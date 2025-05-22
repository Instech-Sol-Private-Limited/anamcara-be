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
exports.openai = exports.supabase = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
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
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.OPENAI_API_KEY) {
    console.error('Missing required environment variables');
    process.exit(1);
}
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(() => __awaiter(void 0, void 0, void 0, function* () {
    if (exports.supabase) {
        console.log('Supabase connection successfully');
    }
    else {
        console.error('Failed to connect to Supabase');
    }
}))();
exports.openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3001', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.status(200).send(`
      <h2 style="padding: 20px; text-align: center;">Server is running...</h2>
  `);
});
app.use('/api/conversations', auth_middleware_1.authMiddleware, conversation_routes_1.default);
app.use('/api/chat', auth_middleware_1.authMiddleware, chat_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/blogs', blog_routes_1.default);
app.use('/api/categories', threadcategory_routes_1.default);
app.use('/api/threads', threads_routes_1.default);
app.use('/api/profiles', profile_routes_1.default);
app.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});
// app.listen(PORT,'0.0.0.0', () => {
//   console.log(`Server running on port http://localhost:${PORT}`);
// });
