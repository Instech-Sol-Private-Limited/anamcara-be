"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamIo = exports.io = exports.openai = exports.supabase = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = require("openai");
const conversation_routes_1 = __importDefault(require("./routes/conversation.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const blog_routes_1 = __importDefault(require("./routes/blog.routes"));
const threadcategory_routes_1 = __importDefault(require("./routes/threadcategory.routes"));
const threads_routes_1 = __importDefault(require("./routes/threads.routes"));
const profile_routes_1 = __importDefault(require("./routes/profile.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const chatmessages_routes_1 = __importDefault(require("./routes/chatmessages.routes"));
const node_cron_1 = __importDefault(require("node-cron"));
const dailyInsightsCron_1 = __importDefault(require("./crons/dailyInsightsCron"));
const dailyinsights_controller_1 = require("./controllers/dailyinsights.controller");
const socket_io_1 = require("socket.io");
const sockets_1 = require("./sockets");
const friends_routes_1 = __importDefault(require("./routes/friends.routes"));
const posts_routes_1 = __importDefault(require("./routes/posts.routes"));
const course_routes_1 = __importDefault(require("./routes/course.routes"));
const enrollment_routes_1 = __importDefault(require("./routes/enrollment.routes"));
const stories_routes_1 = __importDefault(require("./routes/stories.routes"));
const streams_routes_1 = __importDefault(require("./routes/streams.routes"));
const streaming_handler_1 = require("./sockets/streaming.handler");
const users_routes_1 = __importDefault(require("./routes/users.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.OPENAI_API_KEY) {
    console.error('Missing required environment variables');
    process.exit(1);
}
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(() => __awaiter(void 0, void 0, void 0, function* () {
    if (exports.supabase) {
        console.log('✅ Supabase connected successfully');
    }
    else {
        console.error('❌ Failed to connect to Supabase');
    }
}))();
exports.openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// Middleware to allow WebSocket upgrade requests
app.use((req, res, next) => {
    if (req.path.includes('/socket.io/') || req.headers.upgrade === 'websocket') {
        return next();
    }
    next();
});
app.use((0, cors_1.default)({
    // origin: [
    //   'http://localhost:3000',
    //   'http://localhost:3001',
    //   'http://localhost:5173',
    //   'http://localhost:5174'
    // ],
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express_1.default.json());
// Routes
app.get('/', (req, res) => {
    res.status(200).send(`<h1>Server is running...</h1>`);
});
app.use('/api/conversations', auth_middleware_1.authMiddleware, conversation_routes_1.default);
app.use('/api/chat', auth_middleware_1.authMiddleware, chat_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/blogs', blog_routes_1.default);
app.use('/api/categories', threadcategory_routes_1.default);
app.use('/api/threads', threads_routes_1.default);
app.use('/api/profiles', profile_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/notifications', notifications_routes_1.default);
app.get('/api/daily-insights', dailyinsights_controller_1.getDailyInsights);
app.use('/api/friends', friends_routes_1.default);
app.use('/api/chat-messages', auth_middleware_1.authMiddleware, chatmessages_routes_1.default);
app.use('/api/posts', posts_routes_1.default);
app.use('/api/courses', course_routes_1.default);
app.use('/api/enrollment', enrollment_routes_1.default);
app.use('/api/stories', auth_middleware_1.authMiddleware, stories_routes_1.default);
app.use('/api/streams', auth_middleware_1.authMiddleware, streams_routes_1.default);
app.use('/api/users', users_routes_1.default);
node_cron_1.default.schedule('0 0 * * *', dailyInsightsCron_1.default);
const server = http_1.default.createServer(app);
exports.io = new socket_io_1.Server(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'http://localhost:5174'
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});
exports.streamIo = new socket_io_1.Server(server, {
    path: '/stream-socket',
    cors: {
        origin: [
            'http://localhost:5173',
            'http://localhost:5174'
        ],
        methods: ['GET', 'POST']
    },
    transports: ['websocket']
});
exports.io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
    socket.on('error', (error) => {
        console.error(`Socket error: ${error}`);
    });
});
exports.streamIo.on('connection', (socket) => {
    console.log(`New streaming client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`Streaming client disconnected: ${socket.id}`);
    });
});
(0, sockets_1.registerSocketHandlers)(exports.io);
(0, streaming_handler_1.registerStreamingHandlers)(exports.streamIo);
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`⚡ Main Socket.IO listening on ws://localhost:${PORT}`);
    console.log(`📹 Stream Socket.IO listening on ws://localhost:${PORT}/stream-socket`);
});
