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
    socket.username = username;
    socket.room = room;
    console.log(`${username} joined room ${room}`);
    
    const joinTime = new Date();
    socket.joinTime = joinTime;

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
