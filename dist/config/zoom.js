"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZOOM_CONFIG = void 0;
const ZOOM_CONFIG = {
    accountId: process.env.ZOOM_ACCOUNT_ID,
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
    webhookSecret: process.env.ZOOM_WEBHOOK_SECRET,
    apiBaseUrl: 'https://api.zoom.us/v2'
};
exports.ZOOM_CONFIG = ZOOM_CONFIG;
