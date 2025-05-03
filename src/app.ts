// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware/auth.middleware';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import conversationRoutes from './routes/conversationRoutes';
import chatRoutes from './routes/chatRoutes';
import authRoutes from './routes/auth.routes';
import blogRoutes from './routes/blogRoutes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Ensure required environment variables are set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.OPENAI_API_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);


export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors({
  
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:80', 'http://localhost'],
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Request body:', req.body);
  console.log('Auth header:', req.headers.authorization ? 'Present' : 'Missing');
  next();
});


app.get('/health', (req , res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.use('/api/conversations', authMiddleware, conversationRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/auth', authRoutes); 
app.use('/api/blogs', blogRoutes); 

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});