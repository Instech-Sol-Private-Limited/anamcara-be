"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/config/openai.config.ts
const openai_1 = require("openai");
if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not defined in environment variables.");
    process.exit(1);
}
const openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
exports.default = openai;
