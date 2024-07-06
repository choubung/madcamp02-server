const mongoose = require('mongoose');

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

  module.exports = {
    createTodo,
    getTodos
  };