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
  profile_image: { type: String },
  jwt_token: { type: String },  // JWT 토큰 필드 추가
  invite_code: { type: String } // 채팅방 초대 코드 필드 추가
});

const User = mongoose.model("User", userSchema);

const chatSchema = new mongoose.Schema({
  username: String,
  room: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  profile_image: String
});

const Chat = mongoose.model('Chat', chatSchema);

app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 유저 조회
const getUserById = async (kakaoId) => {
  return await User.findOne({ kakao_id: kakaoId });
};

// 유저 등록
const signUp = async (email, name, kakaoId, profileImage) => {
  const jwtToken = jwt.sign({ kakao_id: kakaoId }, TOKENSECRET);
  const newUser = new User({
    kakao_id: kakaoId,
    account_email: email,
    name: name,
    profile_image: profileImage,
    jwt_token: jwtToken, // JWT 토큰 저장
    invite_code: "" // invite_code는 아직 없다
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
  
  console.log('Kakao API response data:', data); // 응답 데이터 전체 출력

  // 필요한 필드 추출
  const name = data?.properties?.nickname;
  const email = data?.kakao_account?.email;
  const kakaoId = data?.id;
  const profileImage = data?.properties?.profile_image;

  // 필드별로 로그 출력
  console.log('Extracted data:', { name, email, kakaoId, profileImage });

  if (!name || !email || !kakaoId) {
    console.error('Missing required user data:', { name, email, kakaoId });
    throw new Error("KEY_ERROR");
  }

  let user = await getUserById(kakaoId);

  if (!user) {
    user = await signUp(email, name, kakaoId, profileImage);
  } else {
    // 기존 유저인 경우 jwt_token 갱신
    user.jwt_token = jwt.sign({ kakao_id: user.kakao_id }, TOKENSECRET);
    await user.save();
  }

  if (user) {
    console.log('Add data:', { name, email, kakaoId, profileImage, jwt_token: user.jwt_token, invite_code: user.invite_code });
  } else {
    console.error('User object is undefined or null');
  }

  return user.jwt_token;
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

// POST 요청 처리: 유저 정보 찾아주기
app.post('/auth/UserInfo', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).send('Token is missing');
  }

  jwt.verify(token, TOKENSECRET, (err, user) => {
    if (err) {
      return res.status(403).send('Invalid token');
    }

    console.log('Get user: ', user);

    try {
      const { kakao_id } = user;
      
      const user_info = User.findOne(kakao_id);

      console.log('UserInfo: ', user_info.name, user_info.account_email);
      
      // 토큰이 유효한 경우
      return res.status(200).json({ UserName: user_info.name, UserProfile: user_info.profile_image, UserMail: user_info.account_email });
    } catch (err) {
        console.error('Error saving chat message:', err);
    }
  });
});

// GET 요청 처리 (테스트 목적)
app.get('/auth/kakao/signin', (req, res) => {
  res.send('This endpoint is only for POST requests.');
});

// JWT 인증 엔드포인트 추가
app.post('/auth', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).send('Token is missing');
  }

  jwt.verify(token, TOKENSECRET, (err, user) => {
    if (err) {
      return res.status(403).send('Invalid token');
    }

    // 토큰이 유효한 경우
    res.status(200).send('Authenticated');
  });
});

// 에러 처리 라우터
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const authenticateJWT = (socket, next) => {
  const token = socket.handshake.auth.token;
  console.log("Received token: ", token);
  if (!token) {
    const err = new Error("Not authorized");
    err.data = { content: "Please retry later" }; // additional details
    return next(err);
  }

  console.log('New client: ${token}');
  
  jwt.verify(token, TOKENSECRET, (err, user) => {
    if (err) {
      return next(new Error("Not authorized"));
    }
    console.log("JWT verified, user: ", user);
    socket.user = user;
    next();
  });
};

io.use(authenticateJWT);

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('message', async (data) => {
    const { event, message } = JSON.parse(data);
    console.log(`Received event: ${event}, message: ${message}`);

    if (event === 'joinRoom') {
      const inviteCode = message;
      const { kakao_id } = socket.user;

      try {
        const user = await User.findOne({ kakao_id });
        if (!user) {
          return socket.emit('error', 'User not found');
        }

        if (user.invite_code == "") {
          await User.updateOne({ kakao_id: kakao_id }, { $set: { invite_code: inviteCode } });
          console.log(`User ${kakao_id}'s invite code has been updated to ${inviteCode}.`);
          user.invite_code = inviteCode; // 업데이트된 초대 코드를 로컬 변수에도 반영
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
          timestamp: new Date(),
          profile_image: ""
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
      const { kakao_id } = socket.user
      const user = await User.findOne({ kakao_id });
      const timestamp = new Date();
      const chatMessage = new Chat({
        username: user.name,
        room: socket.room,
        message: message,
        timestamp: new Date(),
        profile_image: user.profile_image
    });
      // console.log('send ${user.name} s Chat.`);
      
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
    const user = await User.findOne({ kakao_id });
    const { room } = socket;
    if (!room) return;

    socket.leave(room);
    console.log(`${user.name} left room ${room}`);

    // 안내 메시지 전송
    const leaveMessage = new Chat({
      username: 'System',
      room: socket.room,
      message: `${user.name} has left the room.`,
      timestamp: new Date(),
      profile_image: ""
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
    const user = await User.findOne({ kakao_id });
    const { room } = socket;
    console.log(`Client disconnected: ${user.name} from room ${room}`);
    if (room) {
      socket.leave(room);

      // 안내 메시지 전송
      const disconnectMessage = new Chat({
        username: 'System',
        room: socket.room,
        message: `${user.name} has disconnected.`,
        timestamp: new Date(),
        profile_image: ""
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


server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
