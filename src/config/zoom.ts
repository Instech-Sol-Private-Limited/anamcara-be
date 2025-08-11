const ZOOM_CONFIG = {
    accountId: process.env.ZOOM_ACCOUNT_ID!,
    clientId: process.env.ZOOM_CLIENT_ID!,
    clientSecret: process.env.ZOOM_CLIENT_SECRET!,
    webhookSecret: process.env.ZOOM_WEBHOOK_SECRET!,
    apiBaseUrl: 'https://api.zoom.us/v2'
};

export { ZOOM_CONFIG };