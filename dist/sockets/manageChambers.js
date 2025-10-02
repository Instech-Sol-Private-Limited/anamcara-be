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
exports.verifyChamberPermissions = verifyChamberPermissions;
exports.notifyChamberMembers = notifyChamberMembers;
const _1 = require(".");
const app_1 = require("../app");
function verifyChamberPermissions(chamber_id, user_id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [{ data: chamber }, { data: membership }] = yield Promise.all([
            app_1.supabase
                .from('custom_chambers')
                .select('creator_id')
                .eq('id', chamber_id)
                .single(),
            app_1.supabase
                .from('chamber_members')
                .select('is_moderator')
                .eq('chamber_id', chamber_id)
                .eq('user_id', user_id)
                .single()
        ]);
        return {
            isCreator: (chamber === null || chamber === void 0 ? void 0 : chamber.creator_id) === user_id,
            isModerator: (_a = membership === null || membership === void 0 ? void 0 : membership.is_moderator) !== null && _a !== void 0 ? _a : false
        };
    });
}
function notifyChamberMembers(chamber_id, event, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: membersWithEmails, error } = yield app_1.supabase
            .from('chamber_members')
            .select(`
      user_id,
      profiles:user_id!inner(email)
    `)
            .eq('chamber_id', chamber_id);
        if (error) {
            console.error('Error fetching chamber members:', error);
            return;
        }
        membersWithEmails.forEach((member) => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
            const email = profile === null || profile === void 0 ? void 0 : profile.email;
            if (email && _1.connectedUsers.has(email)) {
                const sockets = _1.connectedUsers.get(email);
                sockets === null || sockets === void 0 ? void 0 : sockets.forEach(socketId => {
                    app_1.io.to(socketId).emit(event, payload);
                });
            }
        });
    });
}
