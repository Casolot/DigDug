// src/game/state.ts
import { CLICK_BASE_DAMAGE, CLICK_DAMAGE_TIERS, PRICE_MULT } from "./config";
import { baseHp, targetLabel, targetList, type TargetId } from "./data/targets";
import { treasures, treasureIndex, type Treasure } from "./data/treasures";
import { workerDef, workerList, type WorkerId } from "./data/workers";
import { upgradeDef, isUnlocked, type UpgradeId } from "./upgrades";

export { targetLabel, targetList, treasures, workerList, workerDef, treasureIndex };
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

  lastTreasure?: { id: string; name: string; desc: string; gold: number; isNew: boolean; at: number };
  lastClickDamage?: number;

  // 次のクリックの事前ロール（HPバーの黄色プレビュー用）
  nextClickBase: number;

  // ダメージ演出用（手動/人手）
  lastManualHit?: { dmg: number; at: number; mult: number };
  lastWorkerHit?: { dmg: number; at: number };

  discovered: Record<string, true>;
  discoveredOrder: string[];

  upgrades: Record<UpgradeId, true>;
};

export function rollHp(id: TargetId): number {
  const rollMul = HP_ROLL_MIN_MUL + Math.random() * HP_ROLL_MUL_RANGE;
  return Math.max(1, Math.round(baseHp[id] * rollMul));
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
    nextClickBase: rollClickDamageBase(),
    discovered: {},
    discoveredOrder: [],
    upgrades: {} as Record<UpgradeId, true>,
  };
}

export function isAnimatingSelected(game: GameState): boolean {
  return game.targets[game.selected].state !== "normal";
}

export function selectTarget(game: GameState, id: TargetId): GameState {
  if (isAnimatingSelected(game)) return game;
  return { ...game, selected: id };
}

function applyDamageToSelected(game: GameState, dmg: number, now: number): GameState {
  const target = game.targets[game.selected];
  if (target.state !== "normal" || target.hp <= 0 || dmg <= 0) return game;

  const nextHp = Math.max(0, target.hp - dmg);
  const isAnimating = nextHp === 0;

  const nextState: GameState = {
    ...game,
    animStartedAt: isAnimating ? now : game.animStartedAt,
    targets: {
      ...game.targets,
      [target.id]: { ...target, hp: nextHp, state: isAnimating ? "animating" : "normal" },
    },
  };

  // お宝獲得のタイミングを「HPが0になった瞬間」に合わせる。
  if (!isAnimating) return nextState;

  const treasure = pickTreasure(target.id);
  const gold = rollGold(treasure.base);

  const isNew = nextState.discovered[treasure.id] !== true;
  const discovered: Record<string, true> = isNew
    ? { ...nextState.discovered, [treasure.id]: true as const }
    : nextState.discovered;
  const discoveredOrder = isNew ? [...nextState.discoveredOrder, treasure.id] : nextState.discoveredOrder;

  return {
    ...nextState,
    money: nextState.money + gold,
    lastTreasure: { id: treasure.id, name: treasure.name, desc: treasure.desc, gold, isNew, at: now },
    discovered,
    discoveredOrder,
  };
}

function rollClickDamageBase(): number {
  const roll = Math.random();
  let cumulativeP = 0;
  for (const tier of CLICK_DAMAGE_TIERS) {
    cumulativeP += tier.p;
    if (roll <= cumulativeP) {
      return Math.floor(Math.random() * (tier.maxMul + 1)) * CLICK_BASE_DAMAGE;
    }
  }
  const lastTier = CLICK_DAMAGE_TIERS[CLICK_DAMAGE_TIERS.length - 1];
  return Math.floor(Math.random() * (lastTier.maxMul + 1)) * CLICK_BASE_DAMAGE;
}

function clickBonus(game: GameState): number {
  let bonus = 0;
  for (const upgradeId of Object.keys(game.upgrades) as UpgradeId[]) bonus += upgradeDef[upgradeId].add;
  return bonus;
}

export function clickDig(game: GameState, now: number): GameState {
  const base = game.nextClickBase;
  const dmg = Math.max(0, base + clickBonus(game));
  const nextClickBase = rollClickDamageBase();

  // 0ダメージも演出として記録する（HPは減らさない）
  if (dmg <= 0)
    return { ...game, nextClickBase, lastClickDamage: 0, lastManualHit: { dmg: 0, at: now, mult: 0 } };

  const nextState = applyDamageToSelected(game, dmg, now);
  return {
    ...nextState,
    nextClickBase,
    lastClickDamage: dmg,
    lastManualHit: { dmg, at: now, mult: dmg / CLICK_BASE_DAMAGE },
  };
}

export function workerCount(game: GameState, id: WorkerId): number {
  return game.workerUnits[id].length;
}

export function workerPrice(game: GameState, id: WorkerId): number {
  const count = workerCount(game, id);
  return Math.ceil(workerDef[id].base * Math.pow(PRICE_MULT, count));
}

export function buyWorker(game: GameState, id: WorkerId, now: number): GameState {
  if (isAnimatingSelected(game)) return game;
  const price = workerPrice(game, id);
  if (game.money < price) return game;
  const unitNext = now + workerDef[id].ms;
  return {
    ...game,
    money: game.money - price,
    workerUnits: { ...game.workerUnits, [id]: [...game.workerUnits[id], unitNext] },
  };
}

export function tickWorkers(game: GameState, now: number): GameState {
  if (isAnimatingSelected(game)) return game;
  let nextState = game;

  for (const workerId of workerList) {
    const units = nextState.workerUnits[workerId];
    if (units.length === 0) continue;

    const { ms, dmg } = workerDef[workerId];
    let changed = false;
    let typeDamage = 0;

    const nextUnits = units.map((nextAt) => {
      if (now < nextAt) return nextAt;
      const fires = Math.floor((now - nextAt) / ms) + 1;
      typeDamage += fires * dmg;
      changed = true;
      return nextAt + fires * ms;
    });

    if (changed) {
      nextState = { ...nextState, workerUnits: { ...nextState.workerUnits, [workerId]: nextUnits } };
    }
    if (typeDamage > 0) {
      const afterDamage = applyDamageToSelected(nextState, typeDamage, now);
      if (afterDamage !== nextState) nextState = { ...afterDamage, lastWorkerHit: { dmg: typeDamage, at: now } };
      else nextState = afterDamage;
    }
    if (isAnimatingSelected(nextState)) break;
  }

  return nextState;
}

function rollGold(base: number): number {
  const rollMul = GOLD_ROLL_MIN_MUL + Math.random() * GOLD_ROLL_MUL_RANGE;
  return Math.max(0, Math.round(base * rollMul));
}

function pickTreasure(id: TargetId): Treasure {
  const list = treasures[id];
  return list[Math.floor(Math.random() * list.length)];
}

function shiftAllUnits(game: GameState, delta: number): GameState {
  if (delta <= 0) return game;
  const workerUnits = workerList.reduce((acc, workerId) => {
    acc[workerId] = game.workerUnits[workerId].map((nextAt) => nextAt + delta);
    return acc;
  }, {} as Record<WorkerId, number[]>);
  return { ...game, workerUnits };
}

export function finishAnimation(game: GameState, id: TargetId, now: number): GameState {
  const target = game.targets[id];
  if (target.state !== "animating") return game;

  const paused = game.animStartedAt === null ? 0 : Math.max(0, now - game.animStartedAt);
  const restored = shiftAllUnits({ ...game, animStartedAt: null }, paused);

  return {
    ...restored,
    targets: { ...restored.targets, [id]: newTarget(id) },
  };
}

export function buyUpgrade(game: GameState, id: UpgradeId): GameState {
  if (isAnimatingSelected(game)) return game;
  const dex = game.discoveredOrder.length;
  if (!isUnlocked(dex, id) || game.upgrades[id]) return game;
  const price = upgradeDef[id].price;
  if (game.money < price) return game;
  return { ...game, money: game.money - price, upgrades: { ...game.upgrades, [id]: true } };
}

