export const targetList = ["rock","house","mine"] as const;
export type TargetId = typeof targetList[number];
export const baseHp: Record<TargetId, number> = { rock:10, house:100, mine:1000 };
