import dotenv from 'dotenv'; dotenv.config();
import express from 'express';
import http from 'http';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.middleware';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import conversationRoutes from './routes/conversation.routes';
import chatRoutes from './routes/chat.routes';
import authRoutes from './routes/auth.routes';
import blogRoutes from './routes/blog.routes';
import categoryRoutes from './routes/threadcategory.routes';
import threadsRoutes from './routes/threads.routes';
import profileRoutes from './routes/profile.routes';
import reportRoutes from './routes/reports.routes';
import notificationsRoutes from './routes/notifications.routes';
import chatMessageRoutes from './routes/chatmessages.routes';
import cron from 'node-cron';
import updateDailyInsights from './crons/dailyInsightsCron';
import { getDailyInsights } from './controllers/dailyinsights.controller';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './sockets';
import friendsRoutes from './routes/friends.routes';
import storiesRoutes from './routes/stories.routes';
import postsRoutes from './routes/posts.routes';
import courseRouter from './routes/course.routes';
import enrollmentRoutes from './routes/enrollment.routes';
import { getActiveStreams, registerStreamingHandlers } from './sockets/streaming.handler';

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.OPENAI_API_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

(async () => {
  if (supabase) {
    console.log('✅ Supabase connected successfully');
  } else {
    console.error('❌ Failed to connect to Supabase');
  }
})();

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware to allow WebSocket upgrade requests
app.use((req, res, next) => {
  if (req.path.includes('/socket.io/') || req.headers.upgrade === 'websocket') {
    return next();
  }
  next();
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.status(200).send(`<h1>Server is running...</h1>`);
});

app.use('/api/conversations', authMiddleware, conversationRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/threads', threadsRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationsRoutes);
app.get('/api/daily-insights', getDailyInsights);
app.use('/api/friends', friendsRoutes);
app.use("/api/stories", storiesRoutes);
app.use('/api/chat-messages', authMiddleware, chatMessageRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/courses', courseRouter);
app.use('/api/enrollment', enrollmentRoutes);
app.get('/api/streams', authMiddleware, getActiveStreams);

cron.schedule('0 0 * * *', updateDailyInsights);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Basic connection logging
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
  
  socket.on('error', (error) => {
    console.error(`Socket error: ${error}`);
  });
});

registerSocketHandlers(io);
registerStreamingHandlers(io);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`⚡ Socket.IO listening on ws://localhost:${PORT}`);
});