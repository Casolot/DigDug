export const SEARCH_MS = 3000;

export const PRICE_MULT = 1.2;

export const WORKER_TICK_MS = 100;

export const CLICK_BASE_DAMAGE = 1;

export const CLICK_DAMAGE_TIERS = [
  { p: 0.90, maxMul: 2 },
  { p: 0.09, maxMul: 10 },
  { p: 0.01, maxMul: 100 },
] as const;

