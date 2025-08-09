import crypto from 'crypto';
import { Request } from 'express';
import { ZOOM_CONFIG } from '../config/zoom';

export const verifyZoomWebhook = (req: Request): boolean => {
    const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
    const hashForVerify = crypto
        .createHmac('sha256', ZOOM_CONFIG.webhookSecret)
        .update(message)
        .digest('hex');
    const signature = `v0=${hashForVerify}`;
    
    return req.headers['x-zm-signature'] === signature;
};