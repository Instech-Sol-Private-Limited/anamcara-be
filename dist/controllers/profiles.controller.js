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
exports.getUserProfile = exports.updateProfile = void 0;
const supabase_1 = require("../utils/supabase");
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to update your profile'
            });
        }
        const { first_name, last_name, avatar_url } = req.body;
        if (!first_name) {
            res.status(400).json({
                success: false,
                message: 'First name is required'
            });
        }
        const { data, error } = yield supabase_1.supabase
            .from('profiles')
            .update({
            first_name,
            last_name,
            avatar_url,
            updated_at: new Date().toISOString()
        })
            .eq('id', userId)
            .select()
            .single();
        if (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating profile'
        });
    }
});
exports.updateProfile = updateProfile;
const getUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield supabase_1.supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            res.status(404).json({
                success: false,
                message: 'User profile not found'
            });
        }
        res.status(200).json({
            success: true,
            user: data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching user profile'
        });
    }
});
exports.getUserProfile = getUserProfile;
