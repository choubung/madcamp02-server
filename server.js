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
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

io.on('connection', (socket) => {
  console.log('New client connected');

  Chat.find().sort({ timestamp: 1 }).limit(100).exec((err, messages) => {
    if (err) return console.error(err);
    socket.emit('init', messages);
  });

  socket.on('chatMessage', (msg) => {
    console.log('Message received:', msg);
    const chatMessage = new Chat(msg);
    chatMessage.save().then(() => {
      io.emit('chatMessage', msg);
    }).catch(err => {
      console.error('Error saving chat message:', err);
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
