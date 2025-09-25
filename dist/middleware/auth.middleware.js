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
exports.optionalAuthMiddleware = exports.requireRole = exports.authMiddleware = void 0;
const app_1 = require("../app");
const authMiddleware = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.originalUrl.startsWith('/api/auth') || req.originalUrl === '/health') {
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Unauthorized: No valid auth header found');
        res.status(401).json({
            success: false,
            message: 'Unauthorized: No token provided',
        });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = yield app_1.supabase.auth.getUser(token);
        if (error || !user) {
            console.log('Invalid token error:', error === null || error === void 0 ? void 0 : error.message);
            res.status(401).json({
                success: false,
                message: 'Unauthorized: Invalid token',
            });
            return;
        }
        const { data: profile, error: profileError } = yield app_1.supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (profileError || !profile) {
            console.log('Profile error:', profileError === null || profileError === void 0 ? void 0 : profileError.message);
            res.status(401).json({
                success: false,
                message: 'Unauthorized: User profile not found'
            });
            return;
        }
        req.user = Object.assign({ id: user.id, email: user.email || '', role: profile.role || 'user' }, profile);
        next();
    }
    catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during authentication'
        });
    }
});
exports.authMiddleware = authMiddleware;
const requireRole = (role) => {
    return (req, res, next) => {
        var _a;
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== role) {
            return res.status(403).json({
                success: false,
                message: `Access denied: Requires ${role} role`
            });
        }
        next();
    };
};
exports.requireRole = requireRole;
const optionalAuthMiddleware = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const { data: { user }, error } = yield app_1.supabase.auth.getUser(token);
            if (!error && user) {
                const { data: profile, error: profileError } = yield app_1.supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                if (!profileError && profile) {
                    req.user = Object.assign({ id: user.id, email: user.email || '', role: profile.role || 'user' }, profile);
                }
                else {
                    console.log('Optional auth: profile not found or error');
                }
            }
            else {
                console.log('Optional auth: invalid token');
            }
        }
        catch (err) {
            console.warn('Optional auth middleware error:', err.message);
        }
    }
    else {
        console.log('Optional auth: No auth header provided');
    }
    next();
});
exports.optionalAuthMiddleware = optionalAuthMiddleware;
