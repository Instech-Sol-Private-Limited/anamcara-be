export function getRPC(coin: string) {
  switch (coin) {
    case "SoulPoint": return "increment_reward_soulpoints";
    case "AccessBonus": return "increment_reward_accessbonus";
    case "AnamCoin": return "increment_reward_anamcoins";
    default: throw new Error(`Unknown coin type: ${coin}`);
  }
}
