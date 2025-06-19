import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
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
dotenv.config();

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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.status(200).send(`
    <h2 style="padding: 20px; text-align: center;">Server is running...</h2>
  `);
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
app.use('/api/chat-messages', authMiddleware, chatMessageRoutes);

cron.schedule('0 0 * * *', updateDailyInsights);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});


registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
