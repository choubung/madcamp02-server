require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const mongoUri = process.env.MONGODB_URI;
const port = process.env.PORT || 3000;
const TOKENSECRET = process.env.TOKKENSECRET || "your_jwt_secret_key";

if (!mongoUri) {
  console.error('MongoDB URI is not defined in .env file');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// MongoDB 스키마 및 모델 설정
const userSchema = new mongoose.Schema({
  kakao_id: { type: String, required: true, unique: true },
  account_email: { type: String, required: true },
  name: { type: String, required: true },
  profile_image: { type: String }
});

const User = mongoose.model("User", userSchema);

const chatSchema = new mongoose.Schema({
  username: String,
  room: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

app.use(express.json());
app.use(cors());

// 유저 조회
const getUserById = async (kakaoId) => {
  return await User.findOne({ kakao_id: kakaoId });
};

// 유저 등록
const signUp = async (email, name, kakaoId, profileImage) => {
  const newUser = new User({
    kakao_id: kakaoId,
    account_email: email,
    name: name,
    profile_image: profileImage
  });
  return await newUser.save();
};

// 카카오 로그인 서비스
const signInKakao = async (kakaoToken) => {
  const result = await axios.get("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${kakaoToken}`,
    },
  });

  const { data } = result;
  
  console.log('Kakao API response data:', data); // 추가된 로그

  const name = data.properties?.nickname;
  const email = data.kakao_account?.email;
  const kakaoId = data.id;
  const profileImage = data.properties?.profile_image;

  if (!name || !email || !kakaoId) {
    console.error('Missing required user data:', { name, email, kakaoId });
    throw new Error("KEY_ERROR");
  }

  let user = await getUserById(kakaoId);

  if (!user) {
    user = await signUp(email, name, kakaoId, profileImage);
  }

  return jwt.sign({ kakao_id: user.kakao_id }, TOKENSECRET);
};

// 에러 처리 미들웨어
const asyncWrap = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// 카카오 로그인 컨트롤러
const signInKakaoController = asyncWrap(async (req, res) => {
  const headers = req.headers["authorization"];
  if (!headers) {
    return res.status(400).json({ message: "Authorization header is missing" });
  }
  const kakaoToken = headers.split(" ")[1];

  const accessToken = await signInKakao(kakaoToken);
  
  return res.status(200).json({ accessToken: accessToken });
});

// POST 요청 처리
app.post('/auth/kakao/signin', signInKakaoController);

// GET 요청 처리 (테스트 목적)
app.get('/auth/kakao/signin', (req, res) => {
  res.send('This endpoint is only for POST requests.');
});

// 에러 처리 라우터
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('joinRoom', async ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;
    console.log(`${username} joined room ${room}`);

    const joinTime = new Date();
    socket.joinTime = joinTime;

    // 안내 메시지 전송
    const joinMessage = new Chat({
      username: 'System',
      room: room,
      message: `${username} has joined the room.`,
      timestamp: new Date()
    });

    try {
      await joinMessage.save();
      io.to(room).emit('chatMessage', joinMessage);
    } catch (err) {
      console.error('Error saving join message:', err);
    }

    try {
      const messages = await Chat.find({ room, timestamp: { $gte: joinTime } }).sort({ timestamp: 1 }).exec();
      socket.emit('init', messages);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('leaveRoom', async ({ username, room }) => {
    socket.leave(room);
    console.log(`${username} left room ${room}`);

    // 안내 메시지 전송
    const leaveMessage = new Chat({
      username: 'System',
      room: room,
      message: `${username} has left the room.`,
      timestamp: new Date()
    });

    try {
      await leaveMessage.save();
      io.to(room).emit('chatMessage', leaveMessage);
    } catch (err) {
      console.error('Error saving leave message:', err);
    }

    await checkAndDeleteRoom(room);
  });

  socket.on('chatMessage', async (msg) => {
    console.log('Message received:', msg);
    const chatMessage = new Chat(msg);
    try {
      await chatMessage.save();
      io.to(msg.room).emit('chatMessage', msg);
    } catch (err) {
      console.error('Error saving chat message:', err);
    }
  });

  socket.on('disconnect', async () => {
    const { username, room } = socket;
    console.log(`Client disconnected: ${username} from room ${room}`);
    if (room) {
      socket.leave(room);

      // 안내 메시지 전송
      const disconnectMessage = new Chat({
        username: 'System',
        room: room,
        message: `${username} has disconnected.`,
        timestamp: new Date()
      });

      try {
        await disconnectMessage.save();
        io.to(room).emit('chatMessage', disconnectMessage);
      } catch (err) {
        console.error('Error saving disconnect message:', err);
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

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
