"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.supabase = void 0;
// src/index.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = require("openai");
const conversationRoutes_1 = __importDefault(require("./routes/conversationRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const blogRoutes_1 = __importDefault(require("./routes/blogRoutes"));
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Ensure required environment variables are set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.OPENAI_API_KEY) {
    console.error('Missing required environment variables');
    process.exit(1);
}
// Initialize Supabase client
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
exports.openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
// Middleware
app.use((0, cors_1.default)({
    origin: ['*'],
    credentials: true
}));
app.use(express_1.default.json());
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Request body:', req.body);
    console.log('Auth header:', req.headers.authorization ? 'Present' : 'Missing');
    next();
});
app.get('/', (req, res) => {
    res.status(200).send(`
      <h2 style="padding: 20px; text-align: center;">Server is running...</h2>
  `);
});
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/conversations', auth_middleware_1.authMiddleware, conversationRoutes_1.default);
app.use('/api/chat', auth_middleware_1.authMiddleware, chatRoutes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/blogs', blogRoutes_1.default);

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});

// app.listen();
