"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyZoomWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const zoom_1 = require("../config/zoom");
const verifyZoomWebhook = (req) => {
    const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
    const hashForVerify = crypto_1.default
        .createHmac('sha256', zoom_1.ZOOM_CONFIG.webhookSecret)
        .update(message)
        .digest('hex');
    const signature = `v0=${hashForVerify}`;
    return req.headers['x-zm-signature'] === signature;
};
exports.verifyZoomWebhook = verifyZoomWebhook;
