const jwt = require('jsonwebtoken');
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (!token) {
    console.log('Token not provided');
    return next(new Error('Authentication error'));
  }

  jwt.verify(token, 'YOUR_SECRET_KEY', (err, decoded) => {
    if (err) {
      console.log('Token verification failed:', err);
      return next(new Error('Authentication error'));
    }
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.user);

  socket.on('message', async (data) => {
    const { event, message } = JSON.parse(data);
    console.log(`Received event: ${event}, message: ${message}`);

    if (event === 'joinRoom') {
      const inviteCode = message;
      // 기존 joinRoom 이벤트 처리 로직을 사용
      const { kakao_id } = socket.user;

      try {
        const user = await User.findOne({ kakao_id });
        if (!user) {
          return socket.emit('error', 'User not found');
        }

        if (user.invite_code == "") {
          try {
            await User.updateOne({ kakao_id: kakao_id }, { $set: { invite_code: inviteCode } });
            console.log(`User ${kakao_id}'s invite code has been updated to ${inviteCode}.`);
            user.invite_code = inviteCode; // 업데이트된 초대 코드를 로컬 변수에도 반영
          } catch (err) {
            console.error('Error updating user invite code:', err);
            return socket.emit('error', 'Failed to update invite code');
          }
        } else if (user.invite_code !== inviteCode) {
          return socket.emit('error', 'Invalid invite code');
        }

        const room = inviteCode; // 초대 코드를 방 이름으로 사용
        socket.join(room);
        socket.room = room;

        console.log(`${user.name} joined room ${room}`);

        const joinTime = new Date();
        socket.joinTime = joinTime;

        // 안내 메시지 전송
        const joinMessage = new Chat({
          username: 'System',
          room: room,
          message: `${user.name} has joined the room.`,
          timestamp: new Date()
        });

        await joinMessage.save();
        io.to(room).emit('chatMessage', joinMessage);

        const messages = await Chat.find({ room, timestamp: { $gte: joinTime } }).sort({ timestamp: 1 }).exec();
        socket.emit('init', messages);
      } catch (err) {
        console.error(err);
        socket.emit('error', 'An error occurred while joining the room');
      }
    } else if (event === 'chatMessage') {
      // 기존 chatMessage 이벤트 처리 로직을 사용
      const chatMessage = new Chat({ room: socket.room, username: socket.user.kakao_id, message });
      try {
        await chatMessage.save();
        io.to(socket.room).emit('chatMessage', chatMessage);
      } catch (err) {
        console.error('Error saving chat message:', err);
      }
    }
  });

  socket.on('leaveRoom', async () => {
    const { kakao_id } = socket.user;
    const { room } = socket;
    if (!room) return;

    socket.leave(room);
    console.log(`${kakao_id} left room ${room}`);

    // 안내 메시지 전송
    const leaveMessage = new Chat({
      username: 'System',
      room: room,
      message: `${kakao_id} has left the room.`,
      timestamp: new Date()
    });

    try {
      await leaveMessage.save();
      io.to(room).emit('chatMessage', leaveMessage);
    } catch (err) {
      console.error('Error saving leave message:', err);
    }

    // 사용자의 inviteCode를 빈 문자열로 업데이트
    try {
      await User.updateOne({ kakao_id: kakao_id }, { $set: { invite_code: "" } });
      console.log(`User ${kakao_id}'s invite code has been cleared.`);
    } catch (err) {
      console.error('Error updating user invite code:', err);
    }

    await checkAndDeleteRoom(room);
  });

  socket.on('disconnect', async () => {
    const { kakao_id } = socket.user;
    const { room } = socket;
    console.log(`Client disconnected: ${kakao_id} from room ${room}`);
    if (room) {
      socket.leave(room);

      // 안내 메시지 전송
      const disconnectMessage = new Chat({
        username: 'System',
        room: room,
        message: `${kakao_id} has disconnected.`,
        timestamp: new Date()
      });

      try {
        await disconnectMessage.save();
        io.to(room).emit('chatMessage', disconnectMessage);
      } catch (err) {
        console.error('Error saving disconnect message:', err);
      }

      // 사용자의 inviteCode를 빈 문자열로 업데이트
      try {
        await User.updateOne({ kakao_id: kakao_id }, { $set: { invite_code: "" } });
        console.log(`User ${kakao_id}'s invite code has been cleared.`);
      } catch (err) {
        console.error('Error updating user invite code:', err);
      }

      await checkAndDeleteRoom(room);
    }
  });

  async function checkAndDeleteRoom(room) {
    const clients = io.sockets.adapter.rooms.get(room);
    if (!clients || clients.size === 0) {
      try {
        await Chat.deleteMany({ room });
        console.log(`Deleted all messages in room ${room}`);
      } catch (err) {
        console.error(`Error deleting messages in room ${room}:`, err);
      }
    }
  }
});
