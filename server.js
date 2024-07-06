// 환경 변수를 가장 먼저 설정
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 환경 변수가 제대로 로드되었는지 확인
const mongoUri = process.env.MONGODB_URI;
const port = process.env.PORT || 3000;

if (!mongoUri) {
  console.error('MongoDB URI is not defined in .env file');
  process.exit(1);
}

// MongoDB 연결
mongoose.connect(mongoUri).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// MongoDB Schema 및 Model 정의
const chatSchema = new mongoose.Schema({
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

// 클라이언트로부터의 연결 처리
io.on('connection', (socket) => {
  console.log('New client connected');

  // 이전 채팅 메시지 로드
  Chat.find().sort({ timestamp: 1 }).limit(100).exec((err, messages) => {
    if (err) return console.error(err);
    socket.emit('init', messages);
  });

  // 클라이언트로부터의 메시지 처리
  socket.on('chatMessage', (msg) => {
    console.log('Message received:', msg); // 메시지 수신 로그 출력
    const chatMessage = new Chat(msg);
    chatMessage.save().then(() => {
      io.emit('chatMessage', msg); // 모든 클라이언트로 메시지 전송
    }).catch(err => {
      console.error('Error saving chat message:', err);
    });
  });

  // 연결 종료 처리
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// 서버 시작
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
