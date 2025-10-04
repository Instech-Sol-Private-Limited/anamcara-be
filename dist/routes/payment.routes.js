"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
//=======================Exchnage======================//
router.post("/create-checkout-session", payment_controller_1.createCheckoutSession);
router.post("/process-success", payment_controller_1.processsuccess);
router.get("/transactions/:userId", payment_controller_1.transactionuserid);
router.get("/balances/:userId", payment_controller_1.balanceuserid);
router.get("/session/:id", payment_controller_1.sessionuserid);
router.get("/:userId", payment_controller_1.userid);
router.get("/history/:userId", payment_controller_1.historyuserid);
router.post("/redeem", payment_controller_1.redeem);
//=================== WithDrawal=========================//
router.post("/setup-withdrawal-account", auth_middleware_1.authMiddleware, payment_controller_1.setupwithdrawalaccount);
router.get("/check-account-status/:userId", auth_middleware_1.authMiddleware, payment_controller_1.checkaccountstatususerId);
router.post("/withdraw", auth_middleware_1.authMiddleware, payment_controller_1.WithDraw);
router.get("/history/:userId", auth_middleware_1.authMiddleware, payment_controller_1.historyid);
router.post("/account-dashboard/:userId", auth_middleware_1.authMiddleware, payment_controller_1.accountdashboarduserid);
router.get("/onboarding-return", payment_controller_1.onboardingretrun);
// New routes
router.post("/transfer-ac", auth_middleware_1.authMiddleware, payment_controller_1.transferACToUserAccount);
router.get("/complete-status/:userId", auth_middleware_1.authMiddleware, payment_controller_1.getCompleteAccountStatus);
router.post("/webhook", express_2.default.raw({ type: 'application/json' }), payment_controller_1.handleStripeWebhook);
exports.default = router;
