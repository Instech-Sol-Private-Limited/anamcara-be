"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = void 0;
const generateTokens_1 = require("../config/generateTokens");
const authenticateUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authorization token missing or malformed." });
        }
        const token = authHeader.split(" ")[1];
        const decoded = (0, generateTokens_1.verifyToken)(token);
        if (!decoded) {
            return res.status(401).json({ error: "Invalid or expired token." });
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        console.error("Authentication error:", error);
        return res.status(500).json({ error: "Failed to authenticate user." });
    }
};
exports.authenticateUser = authenticateUser;
