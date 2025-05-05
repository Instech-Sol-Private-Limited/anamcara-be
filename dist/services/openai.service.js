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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIResponse = void 0;
// src/services/openai.service.ts
const app_1 = require("../app");
/**
 * Generates an AI response using the OpenAI API
 * @param messages The conversation history
 * @param systemPrompt Custom system prompt (optional)
 * @returns The AI-generated response text
 */
const generateAIResponse = (messages, systemPrompt) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const defaultSystemPrompt = 'You are a helpful, friendly AI assistant. Provide accurate and concise responses.';
        const apiMessages = [
            {
                role: 'system',
                content: systemPrompt || defaultSystemPrompt
            },
            ...messages.map(m => ({
                role: m.role,
                content: m.content,
                name: m.role === 'user' ? 'user' : undefined
            }))
        ];
        const filteredMessages = [
            apiMessages[0],
            ...apiMessages.slice(1).filter(m => m.role !== 'system')
        ];
        const completion = yield app_1.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: filteredMessages,
            max_tokens: 1000,
            temperature: 0.7,
        });
        return completion.choices[0].message.content || 'Sorry, I couldn\'t generate a response.';
    }
    catch (error) {
        console.error('Error generating AI response:', error);
        return 'Sorry, there was an error generating a response. Please try again later.';
    }
});
exports.generateAIResponse = generateAIResponse;
exports.default = {
    generateAIResponse: exports.generateAIResponse
};
