const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config(); // .env 파일에서 환경 변수 로드

// Express 앱 초기화
const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());

// MongoDB 연결 설정
const mongoURI = process.env.MONGO_URI; // .env 파일에서 MongoDB URI 가져오기
mongoose.connect(mongoURI, {
  tls: true, // TLS 사용
  tlsAllowInvalidCertificates: true // 유효하지 않은 인증서 허용
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Todo 모델 설정
const todoSchema = new mongoose.Schema({
  title: String,
  completed: Boolean,
});

const Todo = mongoose.model('Todo', todoSchema);

// createTodo 함수
const createTodo = async (req, res) => {
  const { title, completed } = req.body;
  const newTodo = new Todo({
    title,
    completed: completed || false,
  });

  try {
    const savedTodo = await newTodo.save();
    res.status(201).json(savedTodo);
  } catch (error) {
    res.status(500).json({ message: 'Error creating todo', error });
  }
};

// getTodos 함수
const getTodos = async (req, res) => {
  try {
    const todos = await Todo.find();
    res.status(200).json(todos);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching todos', error });
  }
};

// 라우트 설정
app.post('/todos', createTodo);
app.get('/todos', getTodos);

// 서버 시작
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
