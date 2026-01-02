export const upgradeList = ["glove", "pickaxe"] as const;
export type UpgradeId = typeof upgradeList[number];

export const upgradeDef: Record<
  UpgradeId,
  {
    name: string;
    desc: string;
    unlockDex: number;
    price: number;
    add: number;
  }
> = {
  glove: { name: "強化手袋", desc: "クリックダメージを+1します。", unlockDex: 2, price: 50, add: 1 },
  pickaxe: { name: "強化つるはし", desc: "クリックダメージを+2します。", unlockDex: 6, price: 180, add: 2 },
};

export function isUnlocked(dexCount: number, id: UpgradeId): boolean {
  return dexCount >= upgradeDef[id].unlockDex;
}
