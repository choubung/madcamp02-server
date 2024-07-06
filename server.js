const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
}).then(() => {
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
	Chat.find().sort({timestamp: 1 }).limit(100).exec((err, messages) => {
		if (err) return console.error(err);
		socket.emit('init', messages);
	});

	// 클라이언트로부터의 메시지 처리
	socket.on('chatMessage', (msg) => {
		const chatMessage = new Chat(msg);
		chatMessage.save().then(() => {
			io.emit('chatMessage', msg);
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
const port = process.env.PORT || 3000;
server.listen(port, () => {
	console.log('Server running on port ${port}');
});
