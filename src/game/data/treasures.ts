import type { TargetId } from "./targets";
export type Treasure = { id: string; name: string; desc: string; base: number };
export const treasures: Record<TargetId, Treasure[]> = {
  rock: [
    { id: "andesite", name: "安山岩", desc: "（説明準備中）", base: 1 },
    { id: "basalt", name: "玄武岩", desc: "（説明準備中）", base: 2 },
    { id: "granite", name: "花崗岩", desc: "（説明準備中）", base: 3 },
    { id: "fossil_common", name: "どこにでもある化石", desc: "（説明準備中）", base: 5 },
  ],
  house: [
    { id: "book", name: "アッチな本", desc: "（説明準備中）", base: 30 },
    { id: "dishes", name: "食器類", desc: "（説明準備中）", base: 50 },
    { id: "materials", name: "建材", desc: "（説明準備中）", base: 80 },
    { id: "cash", name: "へそくり", desc: "（説明準備中）", base: 130 },
  ],
  mine: [
    { id: "coal", name: "石炭", desc: "（説明準備中）", base: 800 },
    { id: "iron", name: "鉄鉱石", desc: "（説明準備中）", base: 1300 },
    { id: "fossil_weird", name: "変な化石", desc: "（説明準備中）", base: 2100 },
    { id: "gem", name: "宝石", desc: "（説明準備中）", base: 3400 },
  ],
};
export const treasureIndex: Record<string, Treasure & { target: TargetId }> = (() => {
  const out: Record<string, Treasure & { target: TargetId }> = {};
  (Object.keys(treasures) as TargetId[]).forEach((target) => {
    treasures[target].forEach((treasure) => {
      out[treasure.id] = { ...treasure, target };
    });
  });
  return out;
})();
