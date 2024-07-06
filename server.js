require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

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

if (!mongoUri) {
  console.error('MongoDB URI is not defined in .env file');
  process.exit(1);
}

mongoose.connect(mongoUri).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const chatSchema = new mongoose.Schema({
  username: String,
  room: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('joinRoom', async ({ username, room }) => {
    socket.join(room);
    console.log(`${username} joined room ${room}`);
    
    // 현재 시간을 기록
    const joinTime = new Date();

    socket.joinTime = joinTime; // 소켓 객체에 입장 시간을 저장

    // 이후의 메시지들만 클라이언트에게 전송
    try {
      const messages = await Chat.find({ room, timestamp: { $gte: joinTime } }).sort({ timestamp: 1 }).exec();
      socket.emit('init', messages);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('leaveRoom', ({ username, room }) => {
    socket.leave(room);
    console.log(`${username} left room ${room}`);
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

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
