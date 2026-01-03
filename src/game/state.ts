// src/game/state.ts
import { CLICK_BASE_DAMAGE, CLICK_DAMAGE_TIERS, PRICE_MULT, SEARCH_MS } from "./config";
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

export type TargetState = "unsearched" | "searching" | "ready";
export type Target = {
  id: TargetId;
  maxHp: number;
  hp: number;
  state: TargetState;
  searchStartedAt: number | null;
  // その対象が直前に受けた「プレイヤー(クリック)」からのダメージ量
  lastPlayerDamage: number;
};

export type GameState = {
  money: number;
  selected: TargetId;
  targets: Record<TargetId, Target>;

  workerUnits: Record<WorkerId, number[]>;

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
  return { id, maxHp: 0, hp: 0, state: "unsearched", searchStartedAt: null, lastPlayerDamage: 0 };
}

export function newGame(): GameState {
  return {
    money: 0,
    selected: "rock",
    targets: { rock: newTarget("rock"), house: newTarget("house"), mine: newTarget("mine") },
    workerUnits: { scavenger: [], caver: [], excavator: [] },
    nextClickBase: rollClickDamageBase(),
    discovered: {},
    discoveredOrder: [],
    upgrades: {} as Record<UpgradeId, true>,
  };
}

export function isAnimatingSelected(game: GameState): boolean {
  return game.targets[game.selected].state === "searching";
}

export function selectTarget(game: GameState, id: TargetId): GameState {
  if (isAnimatingSelected(game)) return game;
  return { ...game, selected: id };
}

export function startSearch(game: GameState, id: TargetId, now: number): GameState {
  const target = game.targets[id];
  if (target.state !== "unsearched") return game;
  return {
    ...game,
    targets: {
      ...game.targets,
      [id]: { ...target, state: "searching", searchStartedAt: now },
    },
  };
}

function applyDamageToSelected(game: GameState, dmg: number, now: number): GameState {
  const target = game.targets[game.selected];
  if (target.state !== "ready" || target.hp <= 0 || dmg <= 0) return game;

  const nextHp = Math.max(0, target.hp - dmg);

  const nextState: GameState = {
    ...game,
    targets: {
      ...game.targets,
      [target.id]: { ...target, hp: nextHp },
    },
  };

  // お宝獲得のタイミングを「HPが0になった瞬間」に合わせる。
  if (nextHp > 0) return nextState;

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
    targets: {
      ...nextState.targets,
      [target.id]: newTarget(target.id),
    },
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

  const target = game.targets[game.selected];
  const applied = target.state === "ready" && target.hp > 0 ? Math.min(target.hp, dmg) : 0;

  // 0ダメージも演出として記録する（HPは減らさない）
  if (dmg <= 0) {
    const t = game.targets[game.selected];
    return {
      ...game,
      nextClickBase,
      lastClickDamage: 0,
      lastManualHit: { dmg: 0, at: now, mult: 0 },
      targets:
        t.state === "ready"
          ? { ...game.targets, [t.id]: { ...t, lastPlayerDamage: 0 } }
          : game.targets,
    };
  }

  const afterDamage = applyDamageToSelected(game, dmg, now);

  // 「その対象が直前に受けたプレイヤーからのダメージ分」を保持する
  const t2 = afterDamage.targets[game.selected];
  const withLast =
    t2.state === "ready"
      ? { ...afterDamage, targets: { ...afterDamage.targets, [t2.id]: { ...t2, lastPlayerDamage: applied } } }
      : afterDamage;

  return {
    ...withLast,
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
  let nextState = game;

  // 探索中の対象があれば、一定時間後にHPを確定させる。
  for (const targetId of targetList) {
    const t = nextState.targets[targetId];
    if (t.state !== "searching" || t.searchStartedAt === null) continue;
    if (now - t.searchStartedAt < SEARCH_MS) continue;
    const maxHp = rollHp(targetId);
    nextState = {
      ...nextState,
      targets: {
        ...nextState.targets,
        [targetId]: { ...t, state: "ready", searchStartedAt: null, maxHp, hp: maxHp, lastPlayerDamage: 0 },
      },
    };
  }

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


export function buyUpgrade(game: GameState, id: UpgradeId): GameState {
  if (isAnimatingSelected(game)) return game;
  const dex = game.discoveredOrder.length;
  if (!isUnlocked(dex, id) || game.upgrades[id]) return game;
  const price = upgradeDef[id].price;
  if (game.money < price) return game;
  return { ...game, money: game.money - price, upgrades: { ...game.upgrades, [id]: true } };
}

