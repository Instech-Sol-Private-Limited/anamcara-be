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
exports.sendEmail = void 0;
const app_1 = require("../app");
const mailer_1 = require("../config/mailer");
const sendEmail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, relation, invited_email } = req.body;
        const inviter_user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id; // Get user ID from auth middleware
        if (!inviter_user_id) {
            res.status(401).json({
                error: 'User not authenticated',
                code: 'unauthorized'
            });
            return;
        }
        const { data: existingUser } = yield app_1.supabase
            .from('anamcara_users')
            .select('id')
            .eq('email', invited_email)
            .single();
        if (existingUser) {
            res.status(400).json({
                error: 'User with this email already exists',
                code: 'email_exists'
            });
            return;
        }
        yield (0, mailer_1.sendInvitationEmail)(invited_email, name, relation);
        const { data: invitationData, error: dbError } = yield app_1.supabase
            .from('anam_family_invitations')
            .insert({
            inviter_user_id: inviter_user_id,
            name: name,
            relation: relation,
            invited_email: invited_email,
            acceptance_status: 'pending'
        })
            .select()
            .single();
        if (dbError) {
            throw dbError;
        }
        res.status(200).json({
            message: 'Invitation sent successfully',
            data: invitationData
        });
    }
    catch (error) {
        res.status(500).json({ error: error });
    }
});
exports.sendEmail = sendEmail;
