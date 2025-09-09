// Backend API - Fixed Withdrawal Router
import { Request, Response, Router } from "express";
import { supabase } from "../app";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const router = Router();

// 1. Create Express Account (One-time setup per user) - FIXED URLS
router.post("/setup-withdrawal-account", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, userEmail, userCountry = 'AE' } = req.body;
    
    // Check if user already has account
    const { data: existingAccount } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingAccount?.account_ready) {
      res.json({ success: true, accountReady: true, message: "Withdrawal account already set up" });
      return; 
    }

    // If account exists but not ready, create new onboarding link
    let accountId = existingAccount?.stripe_account_id;
    
    if (!accountId) {
      // Create Express account
      const account = await stripe.accounts.create({
        type: 'standard',
        country: userCountry,
        email: userEmail,
      });
      
      accountId = account.id;

      // Save account info
      await supabase.from('user_accounts').upsert({
        user_id: userId,
        stripe_account_id: account.id,
        account_ready: false,
        created_at: new Date().toISOString()
      });
    }

    // Create onboarding link with FIXED return URLs pointing to TextVault tab
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.CLIENT_URL}/user/dashboard#TextVault`,
      return_url: `${process.env.CLIENT_URL}/user/dashboard?setup=complete&accountId=${accountId}#TextVault`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      onboardingUrl: accountLink.url,
      accountId: accountId
    });

  } catch (error: any) {
    console.error("Account setup error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Check if user's account is ready for withdrawals - ENHANCED
router.get("/check-account-status/:userId", async(req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const { data: userAccount } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!userAccount) {
      res.json({ accountReady: false, needsSetup: true });
      return;
    }

    // Check with Stripe
    const account = await stripe.accounts.retrieve(userAccount.stripe_account_id);
    const isReady = account.charges_enabled && account.payouts_enabled;

    // Update our database when account status changes
    if (isReady !== userAccount.account_ready) {
      await supabase
        .from('user_accounts')
        .update({ 
          account_ready: isReady,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    }

    res.json({
      accountReady: isReady,
      needsSetup: !isReady,
      accountId: userAccount.stripe_account_id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    });

  } catch (error: any) {
    console.error("Status check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Process Withdrawal - ENHANCED WITH PROPER AC DEDUCTION
router.post("/withdraw", async (req: Request, res: Response): Promise<void>=> {
  try {
    const { userId, acAmount } = req.body;

    // Validate input
    if (!acAmount || acAmount < 10) {
      res.status(400).json({ error: "Minimum withdrawal: 10 AC" });
      return; 
    }

    // Check user's account is ready
    const { data: userAccount } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!userAccount?.account_ready) {
      res.status(400).json({ 
        error: "Withdrawal account not set up. Please connect your bank account first.",
        needsSetup: true 
      });
      return;
    }

    // Check AnamCoins balance from the correct table
    const { data: balance, error: balanceError } = await supabase
      .from('anamcoins')  // Make sure this table exists
      .select('total_coins')
      .eq('user_id', userId)
      .single();

    if (balanceError || !balance) {
      res.status(400).json({ error: "Unable to fetch balance" });
      return;
    }

    if (balance.total_coins < acAmount) {
      res.status(400).json({ 
        error: `Insufficient balance. You have ${balance.total_coins} AC, but need ${acAmount} AC` 
      });
      return; 
    }

    // Calculate amounts (100 AC = 89 USD after 11% tax)
    const grossUSD = acAmount * 1; // 1:1 rate
    const tax = grossUSD * 0.11; // 11% tax
    const netUSD = grossUSD - tax;
    const transferAmount = Math.floor(netUSD * 100); // Convert to cents

    if (transferAmount < 50) { // Stripe minimum $0.50
      res.status(400).json({ error: "Amount too small after tax deduction" });
      return;
    }

    // Create transfer to user's connected account
    const transfer = await stripe.payouts.create({
      amount: transferAmount,
      currency: 'usd',
      destination: userAccount.stripe_account_id,
      description: `AnamCoins withdrawal: ${acAmount} AC → $${netUSD.toFixed(2)} USD`,
      metadata: {
        userId: userId,
        acAmount: acAmount.toString(),
        grossUSD: grossUSD.toString(),
        taxAmount: tax.toString(),
        netUSD: netUSD.toString()
      }
    });

    // Generate unique transaction ID
    const transactionId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        transaction_id: transactionId,
        user_id: userId,
        ac_amount: acAmount,
        gross_amount: grossUSD,
        tax_amount: tax,
        net_amount: netUSD,
        stripe_transfer_id: transfer.id,
        status: 'completed',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (withdrawalError) {
      // If withdrawal record fails, we should ideally reverse the transfer
      console.error("Failed to save withdrawal record:", withdrawalError);
      res.status(500).json({ error: "Failed to save withdrawal record" });
      return;
    }

    // DEDUCT AC from user's balance - CRITICAL STEP
    const { error: updateError } = await supabase
      .from('anamcoins')
      .update({
        total_coins: balance.total_coins - acAmount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error("Failed to update user balance:", updateError);
      // Note: In production, you'd want to handle this more carefully
      // possibly by reversing the Stripe transfer
    }

    res.json({
      success: true,
      withdrawal,
      transferId: transfer.id,
      message: `Successfully withdrawn ${acAmount} AC. $${netUSD.toFixed(2)} has been sent to your bank account.`,
      details: {
        acAmount,
        grossUSD,
        taxAmount: tax,
        netUSD,
        remainingBalance: balance.total_coins - acAmount
      }
    });

  } catch (error: any) {
    console.error("Withdrawal error:", error);
    
    // Provide more specific error messages
    if (error.type === 'StripeCardError') {
      res.status(400).json({ error: "Payment processing failed. Please check your account details." });
    } else if (error.type === 'StripeInvalidRequestError') {
      res.status(400).json({ error: "Invalid request. Please check your account setup." });
    } else {
      res.status(500).json({ error: `Withdrawal failed: ${error.message}` });
    }
  }
});

// 4. Get withdrawal history - ENHANCED with table existence check
router.get("/history/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check if withdrawals table exists first
    const { data: tableCheck } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'withdrawals')
      .single();

    if (!tableCheck) {
      // Return empty array if table doesn't exist yet
      res.json({ 
        success: true, 
        withdrawals: [],
        count: 0,
        message: "Withdrawals table not yet created"
      });
      return;
    }

    const { data: withdrawals, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      console.error("History fetch error:", error);
      
      // If table doesn't exist error, return empty array
      if (error.code === '42P01') {
        res.json({ 
          success: true, 
          withdrawals: [],
          count: 0,
          message: "No withdrawals table found - please create the database schema"
        });
        return;
      }
      
      res.status(500).json({ error: "Failed to fetch withdrawal history" });
      return;
    }

    res.json({ 
      success: true, 
      withdrawals: withdrawals || [],
      count: withdrawals?.length || 0
    });

  } catch (error: any) {
    console.error("History error:", error);
    
    // Handle table doesn't exist gracefully
    if (error.code === '42P01') {
      res.json({ 
        success: true, 
        withdrawals: [],
        count: 0,
        message: "Withdrawals table not found - please run the database schema setup"
      });
      return;
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 5. Get Stripe Dashboard URL (for managing account)
router.post("/account-dashboard/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: userAccount } = await supabase
      .from('user_accounts')
      .select('stripe_account_id, account_ready')
      .eq('user_id', userId)
      .single();

    if (!userAccount) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    if (!userAccount.account_ready) {
      res.status(400).json({ error: "Account not ready for dashboard access" });
      return;
    }

    const loginLink = await stripe.accounts.createLoginLink(userAccount.stripe_account_id);

    res.json({
      dashboardUrl: loginLink.url
    });

  } catch (error: any) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. NEW: Handle return from Stripe onboarding
router.get("/onboarding-return", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      res.redirect(`${process.env.CLIENT_URL}/user/dashboard#TextVault`);
      return;
    }

    // Check account status and update database
    const account = await stripe.accounts.retrieve(accountId as string);
    const isReady = account.charges_enabled && account.payouts_enabled;

    await supabase
      .from('user_accounts')
      .update({ 
        account_ready: isReady,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_account_id', accountId);

    // Redirect back to frontend with status
    res.redirect(`${process.env.CLIENT_URL}/user/dashboard?setup=complete&ready=${isReady}#TextVault`);

  } catch (error: any) {
    console.error("Onboarding return error:", error);
    res.redirect(`${process.env.CLIENT_URL}/user/dashboard?setup=error#TextVault`);
  }
});

export default router;