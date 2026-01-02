export type UpgradeId = "click_x2";

export const upgradeDef: Record<UpgradeId, {
  name: string; desc: string; unlockDex: number; price: number; mult: number;
}> = {
  click_x2: { name: "強化手袋", desc: "クリックダメージを2倍にします。", unlockDex: 2, price: 50, mult: 2 },
};

export function isUnlocked(dexCount: number, id: UpgradeId): boolean {
  return dexCount >= upgradeDef[id].unlockDex;
}
