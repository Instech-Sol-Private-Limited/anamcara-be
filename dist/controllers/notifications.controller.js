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
exports.getNotifications = void 0;
const app_1 = require("../app");
const getNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.user;
        const { data, error } = yield app_1.supabase
            .from('notifications')
            .select(`*`)
            .eq("user_id", id);
        if (error) {
            throw new Error(`Supabase error: ${error.message}`);
        }
        if (!data || data.length === 0) {
            res.status(200).json({
                success: true,
                data: [],
                message: "No notification found!",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error('Error in notifications:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications!',
            message: errorMessage,
        });
    }
});
exports.getNotifications = getNotifications;
