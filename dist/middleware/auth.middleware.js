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
exports.optionalAuthMiddleware = exports.superAdminMiddleware = exports.requireRole = exports.authMiddleware = void 0;
const app_1 = require("../app");
const authMiddleware = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.originalUrl.startsWith('/api/auth') || req.originalUrl === '/health') {
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized: User not authenticated',
            });
            return;
        }
        console.log(req.user, role);
        if (req.user.role !== role) {
            res.status(403).json({
                success: false,
                message: `Access denied: Requires ${role} role`
            });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
const superAdminMiddleware = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Unauthorized: User not authenticated',
        });
        return;
    }
    if (req.user.role !== 'superadmin') {
        res.status(403).json({
            success: false,
            message: 'Access denied: Requires superadmin role',
        });
        return;
    }
    next();
};
exports.superAdminMiddleware = superAdminMiddleware;
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
            }
        }
        catch (err) {
            console.warn('Optional auth middleware error:', err.message);
        }
    }
    next();
});
exports.optionalAuthMiddleware = optionalAuthMiddleware;
