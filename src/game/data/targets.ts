export const targetList = ["rock", "house", "mine"] as const;
export type TargetId = typeof targetList[number];

export const targetLabel: Record<TargetId, string> = {
  rock: "いい感じの岩",
  house: "一軒家",
  mine: "鉱山",
};

export const baseHp: Record<TargetId, number> = { rock: 10, house: 100, mine: 1000 };
