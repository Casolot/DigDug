// src/game/state.ts
import { CLICK_BASE_DAMAGE, CLICK_DAMAGE_TIERS, PRICE_MULT } from "./config";
import { baseHp, targetList, type TargetId } from "./data/targets";
import { workerDef, workerList, type WorkerId } from "./data/workers";
import { treasures, treasureIndex, type Treasure } from "./data/treasures";
import { upgradeDef, isUnlocked, type UpgradeId } from "./upgrades";

export { targetList, workerList, workerDef, treasureIndex };
export type { TargetId, WorkerId, Treasure, UpgradeId };

// 数値は同じでも意味が異なるため、同一の定数にはしない。
const HP_ROLL_MIN_MUL = 0.7;
const HP_ROLL_MUL_RANGE = 0.6;

const GOLD_ROLL_MIN_MUL = 0.7;
const GOLD_ROLL_MUL_RANGE = 0.6;

export type TargetState = "normal" | "animating";
export type Target = { id: TargetId; maxHp: number; hp: number; state: TargetState };

export type GameState = {
  money: number;
  selected: TargetId;
  targets: Record<TargetId, Target>;

  workerUnits: Record<WorkerId, number[]>;
  animStartedAt: number | null;

  lastTreasure?: { name: string; gold: number };
  lastClickDamage?: number;

  discovered: Record<string, true>;
  discoveredOrder: string[];

  upgrades: Record<UpgradeId, true>;
};

export function rollHp(id: TargetId): number {
  const r = HP_ROLL_MIN_MUL + Math.random() * HP_ROLL_MUL_RANGE;
  return Math.max(1, Math.round(baseHp[id] * r));
}

export function newTarget(id: TargetId): Target {
  const maxHp = rollHp(id);
  return { id, maxHp, hp: maxHp, state: "normal" };
}

export function newGame(): GameState {
  return {
    money: 0,
    selected: "rock",
    targets: { rock: newTarget("rock"), house: newTarget("house"), mine: newTarget("mine") },
    workerUnits: { scavenger: [], caver: [], excavator: [] },
    animStartedAt: null,
    discovered: {},
    discoveredOrder: [],
    upgrades: {} as Record<UpgradeId, true>,
  };
}

export function isAnimatingSelected(g: GameState): boolean {
  return g.targets[g.selected].state !== "normal";
}

export function selectTarget(g: GameState, id: TargetId): GameState {
  if (isAnimatingSelected(g)) return g;
  return { ...g, selected: id };
}

function applyDamageToSelected(g: GameState, dmg: number, now: number): GameState {
  const t = g.targets[g.selected];
  if (t.state !== "normal" || t.hp <= 0 || dmg <= 0) return g;
  const hp = Math.max(0, t.hp - dmg);
  const anim = hp === 0;
  return {
    ...g,
    animStartedAt: anim ? now : g.animStartedAt,
    targets: { ...g.targets, [t.id]: { ...t, hp, state: anim ? "animating" : "normal" } },
  };
}

function rollClickDamageBase(): number {
  const r = Math.random();
  let acc = 0;
  for (const t of CLICK_DAMAGE_TIERS) {
    acc += t.p;
    if (r <= acc) return Math.floor(Math.random() * (t.maxMul + 1)) * CLICK_BASE_DAMAGE;
  }
  const last = CLICK_DAMAGE_TIERS[CLICK_DAMAGE_TIERS.length - 1];
  return Math.floor(Math.random() * (last.maxMul + 1)) * CLICK_BASE_DAMAGE;
}

function clickMult(g: GameState): number {
  let m = 1;
  for (const id of Object.keys(g.upgrades) as UpgradeId[]) m *= upgradeDef[id].mult;
  return m;
}

export function clickDig(g: GameState, now: number): GameState {
  const base = rollClickDamageBase();
  const dmg = base * clickMult(g);
  const ng = applyDamageToSelected(g, dmg, now);
  return { ...ng, lastClickDamage: dmg };
}

export function workerCount(g: GameState, id: WorkerId): number {
  return g.workerUnits[id].length;
}

export function workerPrice(g: GameState, id: WorkerId): number {
  const c = workerCount(g, id);
  return Math.ceil(workerDef[id].base * Math.pow(PRICE_MULT, c));
}

export function buyWorker(g: GameState, id: WorkerId, now: number): GameState {
  if (isAnimatingSelected(g)) return g;
  const price = workerPrice(g, id);
  if (g.money < price) return g;
  const unitNext = now + workerDef[id].ms;
  return {
    ...g,
    money: g.money - price,
    workerUnits: { ...g.workerUnits, [id]: [...g.workerUnits[id], unitNext] },
  };
}

export function tickWorkers(g: GameState, now: number): GameState {
  if (isAnimatingSelected(g)) return g;
  let ng = g;

  for (const id of workerList) {
    const units = ng.workerUnits[id];
    if (units.length === 0) continue;

    const { ms, dmg } = workerDef[id];
    let changed = false;
    let typeDamage = 0;

    const nextUnits = units.map((t) => {
      if (now < t) return t;
      const fires = Math.floor((now - t) / ms) + 1;
      typeDamage += fires * dmg;
      changed = true;
      return t + fires * ms;
    });

    if (changed) ng = { ...ng, workerUnits: { ...ng.workerUnits, [id]: nextUnits } };
    if (typeDamage > 0) ng = applyDamageToSelected(ng, typeDamage, now);
    if (isAnimatingSelected(ng)) break;
  }

  return ng;
}

function rollGold(base: number): number {
  const r = GOLD_ROLL_MIN_MUL + Math.random() * GOLD_ROLL_MUL_RANGE;
  return Math.max(0, Math.round(base * r));
}

function pickTreasure(id: TargetId): Treasure {
  const list = treasures[id];
  return list[Math.floor(Math.random() * list.length)];
}

function shiftAllUnits(g: GameState, delta: number): GameState {
  if (delta <= 0) return g;
  const workerUnits = workerList.reduce((acc, id) => {
    acc[id] = g.workerUnits[id].map((t) => t + delta);
    return acc;
  }, {} as Record<WorkerId, number[]>);
  return { ...g, workerUnits };
}

export function finishAnimation(g: GameState, id: TargetId, now: number): GameState {
  const t = g.targets[id];
  if (t.state !== "animating") return g;

  const tr = pickTreasure(id);
  const gold = rollGold(tr.base);

  const paused = g.animStartedAt === null ? 0 : Math.max(0, now - g.animStartedAt);
  const restored = shiftAllUnits({ ...g, animStartedAt: null }, paused);

  const isNew = restored.discovered[tr.id] !== true;
  const discovered: Record<string, true> = isNew
    ? { ...restored.discovered, [tr.id]: true as const }
    : restored.discovered;
  const discoveredOrder = isNew ? [...restored.discoveredOrder, tr.id] : restored.discoveredOrder;

  return {
    ...restored,
    money: restored.money + gold,
    lastTreasure: { name: tr.name, gold },
    targets: { ...restored.targets, [id]: newTarget(id) },
    discovered,
    discoveredOrder,
  };
}

export function buyUpgrade(g: GameState, id: UpgradeId): GameState {
  if (isAnimatingSelected(g)) return g;
  const dex = g.discoveredOrder.length;
  if (!isUnlocked(dex, id) || g.upgrades[id]) return g;
  const price = upgradeDef[id].price;
  if (g.money < price) return g;
  return { ...g, money: g.money - price, upgrades: { ...g.upgrades, [id]: true } };
}

