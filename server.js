const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const serverfunctions = require('./serverfunction.js');

require('dotenv').config(); // .env 파일에서 환경 변수 로드

// Express 앱 초기화
const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());

// MongoDB 연결 설정, 성공 여부를 log로 보내줌
const mongoURI = process.env.MONGO_URI; // .env 파일에서 MongoDB URI 가져오기
mongoose.connect(mongoURI, {
  tls: true, // TLS 사용
  tlsAllowInvalidCertificates: true // 유효하지 않은 인증서 허용
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// 라우트 설정
app.post('/todos', serverfunctions.createTodo);
app.get('/todos', serverfunctions.getTodos);

// 서버 시작
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

