import type { ActionType } from "./rewards";

type RuleMode = "per_action" | "daily_once" | "daily_cap" | "one_time";

interface RewardRule {
  mode: RuleMode;
  maxPerDay?: number;       // for daily_cap
  // for one_time
  oneTime?: boolean;
}

export const REWARD_RULES: Partial<Record<ActionType, RewardRule>> = {
  // Daily login / daily views: once per day
  oasis_daily_login:           { mode: "daily_once" },
  leaderboard_daily_login:           { mode: "daily_once" },
  soulfeed_daily_login:        { mode: "daily_once" },
  anamprofile_daily_view:      { mode: "daily_once" },
  soulfeed_create_post:        { mode: "daily_cap", maxPerDay: 5 },
  soulfeed_comment:            { mode: "daily_cap", maxPerDay: 20 },
  soulfeed_react_given:        { mode: "daily_cap", maxPerDay: 50 },
  soulfeed_react_received:     { mode: "daily_cap", maxPerDay: 50 },
  nirvana_create_thread:       { mode: "daily_cap", maxPerDay: 5 },
  nirvana_comment:             { mode: "daily_cap", maxPerDay: 20 },
  chambers_daily_view:         { mode: "daily_once" },

  // One-time actions
  anamprofile_level1_verification_sp: { mode: "one_time", oneTime: true },
  anamprofile_level1_verification_ab: { mode: "one_time", oneTime: true },

  // Things you manually trigger (e.g. leaderboard): no caps here
  leaderboard_weekly_top_1: { mode: "per_action" },
  leaderboard_weekly_top_2: { mode: "per_action" },
  leaderboard_weekly_top_3: { mode: "per_action" },
};
