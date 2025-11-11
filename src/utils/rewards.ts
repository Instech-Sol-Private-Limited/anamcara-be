export type CoinType = "SoulPoint" | "AccessBonus" | "AnamCoin";

export const COIN_TYPES: CoinType[] = ["SoulPoint", "AccessBonus", "AnamCoin"];

export const ACTION_REWARDS = {
  // --- Oasis / Profile / Onboarding ---
  oasis_daily_login:              { module: "Oasis",       coin: "SoulPoint",  amount: 25 },
  anamprofile_daily_view:         { module: "AnamProfile", coin: "SoulPoint",  amount: 25 },
  anamprofile_level1_verification_sp: { module: "AnamProfile", coin: "SoulPoint",  amount: 11 },
  anamprofile_level1_verification_ab: { module: "AnamProfile", coin: "AccessBonus", amount: 11 },
  anamprofile_referral_verified_sp:   { module: "AnamProfile", coin: "SoulPoint",  amount: 11 },
  anamprofile_referral_verified_ab:   { module: "AnamProfile", coin: "AccessBonus", amount: 11 },

  // --- SoulFeed ---
  soulfeed_daily_login:      { module: "SoulFeed",       coin: "SoulPoint",  amount: 25 },
  soulfeed_create_post:      { module: "SoulFeed", coin: "SoulPoint", amount: 110 },
  soulfeed_comment:          { module: "SoulFeed", coin: "SoulPoint", amount: 70 },
  soulfeed_react_given:      { module: "SoulFeed", coin: "SoulPoint", amount: 11 },
  soulfeed_react_received:   { module: "SoulFeed", coin: "SoulPoint", amount: 11 },
  soulfeed_share_internal:   { module: "SoulFeed", coin: "SoulPoint", amount: 70 },
  soulfeed_share_external:   { module: "SoulFeed", coin: "SoulPoint", amount: 70 },
  soulfeed_tag_mention:      { module: "SoulFeed", coin: "SoulPoint", amount: 11 },
  soulfeed_report_validated: { module: "SoulFeed", coin: "SoulPoint", amount: 110 },

  // --- Nirvana ---
  nirvana_create_thread:      { module: "Nirvana", coin: "SoulPoint", amount: 110 },
  nirvana_comment:            { module: "Nirvana", coin: "SoulPoint", amount: 70 },
  nirvana_react_given:        { module: "Nirvana", coin: "SoulPoint", amount: 11 },
  nirvana_react_received:     { module: "Nirvana", coin: "SoulPoint", amount: 11 },
  nirvana_share_internal:     { module: "Nirvana", coin: "SoulPoint", amount: 70 },
  nirvana_share_external:     { module: "Nirvana", coin: "SoulPoint", amount: 70 },
  nirvana_tag_mention:        { module: "Nirvana", coin: "SoulPoint", amount: 11 },
  nirvana_report_validated:   { module: "Nirvana", coin: "SoulPoint", amount: 110 },

  // --- Chambers ---
  chambers_daily_view:              { module: "Chambers", coin: "SoulPoint", amount: 25 },
  chambers_create_post_public:      { module: "Chambers", coin: "SoulPoint", amount: 110 },
  chambers_create_post_private_ac_paid: { module: "Chambers", coin: "SoulPoint", amount: 110 },
  chambers_comment_public:          { module: "Chambers", coin: "SoulPoint", amount: 70 },
  chambers_comment_private_ac_paid: { module: "Chambers", coin: "SoulPoint", amount: 70 },
  chambers_react:                   { module: "Chambers", coin: "SoulPoint", amount: 11 },
  chambers_share:                   { module: "Chambers", coin: "SoulPoint", amount: 70 },
  chambers_tag_mention:             { module: "Chambers", coin: "SoulPoint", amount: 11 },
  chambers_invite_friend_joins:     { module: "Chambers", coin: "SoulPoint", amount: 110 },
  chambers_report_validated:        { module: "Chambers", coin: "SoulPoint", amount: 110 },

  // --- Vault (conversion examples) ---
  vault_convert_sp_to_ab:      { module: "Vault", coin: "AccessBonus", amount: 1 },
  vault_convert_sp_to_ac:      { module: "Vault", coin: "AnamCoin",    amount: 1 },

  // --- Leaderboard (weekly rewards) ---
  leaderboard_daily_login:              { module: "Leaderboard",       coin: "SoulPoint",  amount: 25 },
  leaderboard_weekly_top_1:    { module: "Leaderboard", coin: "SoulPoint", amount: 1111 },
  leaderboard_weekly_top_2:    { module: "Leaderboard", coin: "SoulPoint", amount: 777 },
  leaderboard_weekly_top_3:    { module: "Leaderboard", coin: "SoulPoint", amount: 444 },

  // --- AnamGurus (samples) ---
  anamgurus_daily_view_divine: { module: "AnamGurus", coin: "SoulPoint", amount: 25 },
  anamgurus_daily_view_destiny:{ module: "AnamGurus", coin: "SoulPoint", amount: 25 },
  anamgurus_daily_view_athena: { module: "AnamGurus", coin: "SoulPoint", amount: 25 },

  // --- Creator Studio ---
  creator_daily_view:          { module: "Creator Studio", coin: "SoulPoint", amount: 25 },
  creator_publish_content:     { module: "Creator Studio", coin: "SoulPoint", amount: 110 },
  creator_comment:             { module: "Creator Studio", coin: "SoulPoint", amount: 70 },
  creator_react:               { module: "Creator Studio", coin: "SoulPoint", amount: 11 },
  creator_share:               { module: "Creator Studio", coin: "SoulPoint", amount: 70 },
} as const;

export type ActionType = keyof typeof ACTION_REWARDS;
export type ModuleType = (typeof ACTION_REWARDS)[ActionType]["module"];
