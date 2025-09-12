import { Router, Request, Response } from "express";

import { accountdashboarduserid, balanceuserid, checkaccountstatususerId, createCheckoutSession, historyid, historyuserid, onboardingretrun, processsuccess, redeem, sessionuserid, setupwithdrawalaccount, transactionuserid, userid, WithDraw } from "../controllers/payment.controller";
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

router.post("/setup-withdrawal-account", authMiddleware, setupwithdrawalaccount)

router.get("/check-account-status/:userId",  authMiddleware,checkaccountstatususerId)

router.post("/withdraw", authMiddleware, WithDraw)

router.get("/history/:userId",  authMiddleware,historyid)

router.post("/account-dashboard/:userId", accountdashboarduserid)

router.get("/onboarding-return", onboardingretrun)

export default router;
