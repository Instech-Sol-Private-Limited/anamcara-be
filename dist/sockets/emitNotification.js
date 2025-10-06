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
exports.sendNotification = sendNotification;
const app_1 = require("../app");
const _1 = require(".");
function sendNotification(_a) {
    return __awaiter(this, arguments, void 0, function* ({ recipientEmail, recipientUserId, actorUserId, threadId, message, type, metadata = {}, }) {
        const { data, error } = yield app_1.supabase
            .from('notifications')
            .insert([
            {
                user_id: recipientUserId,
                action_performed_by: actorUserId,
                thread_id: threadId,
                message,
                type,
                metadata,
            },
        ])
            .select()
            .single();
        if (error) {
            console.error('❌ Error storing notification:', error.message);
            return;
        }
        const socketIds = _1.connectedUsers.get(recipientEmail);
        if (socketIds && socketIds.size > 0) {
            socketIds.forEach((socketId) => {
                app_1.io.to(socketId).emit('notification', data);
            });
            console.log(`📨 Sent notification to all devices of ${recipientEmail}`);
        }
        else {
            console.log(`📭 ${recipientEmail} is offline, notification stored for later delivery`);
        }
    });
}
