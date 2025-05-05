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
exports.deleteConversation = exports.updateConversation = exports.createConversation = exports.getConversationById = exports.getConversations = void 0;
const app_1 = require("../app");
const uuid_1 = require("uuid");
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversations, error } = yield app_1.supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
        if (error)
            throw error;
        res.status(200).json({
            success: true,
            data: conversations
        });
    }
    catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.getConversations = getConversations;
// @desc    Get a conversation by ID with all messages
// @route   GET /api/conversations/:id
// @access  Private
const getConversationById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { id } = req.params;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversation, error: convError } = yield app_1.supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId);
        if (convError || !conversation) {
            res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
            return;
        }
        const { data: messages, error: msgError } = yield app_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });
        if (msgError)
            throw msgError;
        res.status(200).json({
            success: true,
            data: {
                conversation,
                messages: messages || []
            }
        });
    }
    catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.getConversationById = getConversationById;
// @desc    
// @route   
// @access 
const createConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { title } = req.body;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const conversationId = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const { data, error } = yield app_1.supabase
            .from('conversations')
            .insert({
            id: conversationId,
            title: title || 'New Conversation',
            user_id: userId,
            created_at: now,
            updated_at: now
        })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.createConversation = createConversation;
// @desc    
// @route   
// @access  
const updateConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { id } = req.params;
        const { title } = req.body;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversation, error: verifyError } = yield app_1.supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (verifyError || !conversation) {
            res.status(403).json({
                success: false,
                message: 'Not authorized to update this conversation'
            });
            return;
        }
        const { data, error } = yield app_1.supabase
            .from('conversations')
            .update({
            title,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error('Error updating conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.updateConversation = updateConversation;
const deleteConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { id } = req.params;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }
        const { data: conversation, error: verifyError } = yield app_1.supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (verifyError || !conversation) {
            res.status(403).json({
                success: false,
                message: 'Not authorized to delete this conversation'
            });
            return;
        }
        const { error: msgError } = yield app_1.supabase
            .from('messages')
            .delete()
            .eq('conversation_id', id);
        if (msgError)
            throw msgError;
        const { error: convDeleteError } = yield app_1.supabase
            .from('conversations')
            .delete()
            .eq('id', id);
        if (convDeleteError)
            throw convDeleteError;
        res.status(200).json({
            success: true,
            message: 'Conversation deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});
exports.deleteConversation = deleteConversation;
