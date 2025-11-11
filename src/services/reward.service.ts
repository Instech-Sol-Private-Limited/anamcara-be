// src/services/reward.service.ts
import { supabase } from "../app"; 
import { ACTION_REWARDS, ActionType } from "../utils/rewards";
import { REWARD_RULES } from "../utils/reward-rules"; 
import { getRPC } from "../utils/rewardMappers";

export interface AwardRequest {
  userId: string;
  actionType: ActionType | string;
  targetId?: string;
  debug?: boolean;
}

export interface AwardResponse {
  success: boolean;
  blocked?: boolean;
  reason?: string | null;
  actionType?: string;
  module?: string;
  coin?: string;
  amount?: number;
  debug?: any;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export const awardPointsService = async ({
  userId,
  actionType,
  targetId,
  debug = false,
}: AwardRequest): Promise<AwardResponse> =>{
  // 1) Validate reward definition
  const reward = ACTION_REWARDS[actionType as ActionType];
  if (!reward) {
    return {
      success: false,
      blocked: true,
      reason: `Invalid actionType: ${actionType}`,
    };
  }

  const rule = REWARD_RULES[actionType as ActionType];
  const rpcName = getRPC(reward.coin);
  const today = todayUTC();

  // 2) Fetch existing state for caps / one-time logic
  let state: any = {
    user_id: userId,
    action_type: actionType,
    daily_count: 0,
    last_reset_date: null,
    one_time_awarded: false,
    streak_count: 0,
    last_streak_date: null,
    metadata: {},
  };

  const { data: existingState, error: stateErr } = await supabase
    .from("user_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .maybeSingle();

  if (stateErr && stateErr.code !== "PGRST116") {
    // unexpected state error
    throw stateErr;
  }

  if (existingState) state = existingState;

  // 3) Reset daily counter if date changed
  if (state.last_reset_date !== today) {
    state.daily_count = 0;
    state.last_reset_date = today;
  }

  // 4) Apply rule logic
  let allowed = true;
  let reason: string | null = null;

  if (rule) {
    switch (rule.mode) {
      case "daily_once":
        if (state.daily_count >= 1) {
          allowed = false;
          reason = "Daily limit reached for this action";
        }
        break;

      case "daily_cap":
        if (
          typeof rule.maxPerDay === "number" &&
          state.daily_count >= rule.maxPerDay
        ) {
          allowed = false;
          reason = "Daily cap reached for this action";
        }
        break;

      case "one_time":
        if (state.one_time_awarded) {
          allowed = false;
          reason = "One-time reward already claimed";
        }
        break;

      case "per_action":
      default:
        // always allowed
        break;
    }
  }

  // 5) If blocked, return cleanly (no error, just info)
  if (!allowed) {
    const resp: AwardResponse = {
      success: false,
      blocked: true,
      reason,
    };
    if (debug) resp.debug = { rule, state };
    return resp;
  }
console.log({
    user_id: userId,
    action_type: actionType,
    module_type: reward.module,
    target_id: targetId ?? null,
    coin_type: reward.coin,
    amount: reward.amount,
    
  });
  // 6) Insert into user_actions log
  // const { error: logErr } = await supabase.from("user_actions").insert({
  //   user_id: userId,
  //   action_type: actionType,
  //   module_type: reward.module,
  //   target_id: targetId ?? null,
  //   coin_type: reward.coin,
  //   amount: reward.amount,
    
  // });

  // if (logErr) {
  //   throw logErr;
  // }

  // 7) Call appropriate RPC to update balances table
  const { error: rpcErr } = await supabase.rpc(rpcName, {
    p_user_id: userId,
    p_amount: reward.amount,
  });

  if (rpcErr) {
    throw rpcErr;
  }

  // 8) Update reward state (caps / one-time flags)
  const newState = {
    user_id: userId,
    action_type: actionType,
    daily_count: state.daily_count + 1,
    module_type: reward.module, 
     target_id: targetId ?? null,
    coin_type: reward.coin,
    amount: reward.amount,
    last_reset_date: state.last_reset_date,
    one_time_awarded:
      rule?.mode === "one_time" ? true : state.one_time_awarded,
    streak_count: state.streak_count, // extend later if you add streaks
    last_streak_date: state.last_streak_date,
    metadata: state.metadata,
  };

  const { error: stateUpsertErr } = await supabase
    .from("user_actions")
    .upsert(newState);

  if (stateUpsertErr) {
    throw stateUpsertErr;
  }

  // 9) Success response
  const resp: AwardResponse = {
    success: true,
    actionType: actionType as string,
    module: reward.module ?? "General",
    coin: reward.coin,
    amount: reward.amount,
  };

  if (debug) {
    resp.debug = {
      rule,
      prevState: state,
      newState,
      rpc: rpcName,
    };
  }

  return resp;
}
