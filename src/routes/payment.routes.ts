import { Router } from "express";
import express from 'express';
import { accountdashboarduserid, balanceuserid, checkaccountstatususerId, createCheckoutSession, getCompleteAccountStatus, handleStripeWebhook, historyid, historyuserid, onboardingretrun, processsuccess, redeem, sessionuserid, setupwithdrawalaccount, transactionuserid, transferACToUserAccount, userid, WithDraw } from "../controllers/payment.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

//=======================Exchnage======================//

router.post("/create-checkout-session", createCheckoutSession);

router.post("/process-success", processsuccess)

router.get("/transactions/:userId", transactionuserid)

router.get("/balances/:userId", balanceuserid)

router.get("/session/:id", sessionuserid)

router.get("/:userId", userid)


router.get("/history/:userId", historyuserid)

router.post("/redeem", redeem)


//=================== WithDrawal=========================//

router.post("/setup-withdrawal-account", authMiddleware, setupwithdrawalaccount);

router.get("/check-account-status/:userId", authMiddleware, checkaccountstatususerId);

router.post("/withdraw", authMiddleware, WithDraw);

router.get("/history/:userId", authMiddleware, historyid);

router.post("/account-dashboard/:userId", authMiddleware, accountdashboarduserid);

router.get("/onboarding-return", onboardingretrun);

// New routes
router.post("/transfer-ac", authMiddleware, transferACToUserAccount);

router.get("/complete-status/:userId", authMiddleware, getCompleteAccountStatus);

router.post("/webhook", express.raw({ type: 'application/json' }), handleStripeWebhook);

export default router;
