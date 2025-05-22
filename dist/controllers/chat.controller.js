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
exports.clearMessages = exports.getMessages = exports.sendMessage = void 0;
const app_1 = require("../app");
const app_2 = require("../app");
const uuid_1 = require("uuid");
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { conversationId, content } = req.body;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        if (!conversationId || !content) {
            res.status(400).json({
                success: false,
                message: 'Conversation ID and message content are required'
            });
            return;
        }
        const { data: conversation, error: convError } = yield app_1.supabase
            .from('conversations')
            .select('id, title')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();
        if (convError || !conversation) {
            res.status(403).json({
                success: false,
                message: 'Not authorized to access this conversation'
            });
            return;
        }
        const { data: previousMessages, error: msgError } = yield app_1.supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(10);
        if (msgError)
            throw msgError;
        const isFirstMessage = !previousMessages || previousMessages.length === 0;
        if (isFirstMessage && conversation.title === 'New Conversation') {
            const generatedTitle = content.length > 30
                ? content.substring(0, 30) + '...'
                : content;
            yield app_1.supabase
                .from('conversations')
                .update({
                title: generatedTitle,
                updated_at: new Date().toISOString()
            })
                .eq('id', conversationId);
        }
        const now = new Date().toISOString();
        const userMessageId = (0, uuid_1.v4)();
        const { error: userMsgError } = yield app_1.supabase
            .from('messages')
            .insert({
            id: userMessageId,
            conversation_id: conversationId,
            content,
            role: 'user',
            user_id: userId,
            created_at: now
        });
        if (userMsgError)
            throw userMsgError;
        const messages = previousMessages
            ? [...previousMessages, { role: 'user', content }]
            : [{ role: 'user', content }];
        const completion = yield app_2.openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            temperature: 0.7,
            max_tokens: 800
        });
        const assistantResponse = completion.choices[0].message.content;
        if (!assistantResponse) {
            throw new Error('Failed to get a response from AI');
        }
        const aiMessageId = (0, uuid_1.v4)();
        const { error: aiMsgError } = yield app_1.supabase
            .from('messages')
            .insert({
            id: aiMessageId,
            conversation_id: conversationId,
            content: assistantResponse,
            role: 'assistant',
            user_id: userId,
            created_at: new Date().toISOString()
        });
        if (aiMsgError)
            throw aiMsgError;
        yield app_1.supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);
        const userMessageResponse = {
            id: userMessageId,
            content,
            role: 'user',
            created_at: now,
            conversation_id: conversationId,
            user_id: userId
        };
        const assistantMessageResponse = {
            id: aiMessageId,
            content: assistantResponse,
            role: 'assistant',
            created_at: new Date().toISOString(),
            conversation_id: conversationId,
            user_id: userId
        };
        res.status(200).json({
            success: true,
            data: {
                userMessage: userMessageResponse,
                assistantMessage: assistantMessageResponse
            }
        });
    }
    catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.sendMessage = sendMessage;
const getMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { conversationId } = req.params;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversation, error: convError } = yield app_1.supabase
            .from('conversations')
            .select('id')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();
        if (convError || !conversation) {
            res.status(403).json({
                success: false,
                message: 'Not authorized to access this conversation'
            });
            return;
        }
        const { data: messages, error: msgError } = yield app_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        if (msgError)
            throw msgError;
        res.status(200).json({
            success: true,
            data: messages || []
        });
    }
    catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.getMessages = getMessages;
const clearMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { conversationId } = req.params;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversation, error: convError } = yield app_1.supabase
            .from('conversations')
            .select('id')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();
        if (convError || !conversation) {
            res.status(403).json({
                success: false,
                message: 'Not authorized to delete messages from this conversation'
            });
            return;
        }
        const { error: deleteError } = yield app_1.supabase
            .from('messages')
            .delete()
            .eq('conversation_id', conversationId);
        if (deleteError)
            throw deleteError;
        res.status(200).json({
            success: true,
            message: 'All messages deleted successfully'
        });
    }
    catch (error) {
        console.error('Error clearing messages:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.clearMessages = clearMessages;
