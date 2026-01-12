import { useEffect, useMemo, useRef, useState } from "react";
import { CLICK_BASE_DAMAGE, SEARCH_MS, TREASURE_PICKUP_INPUT_LOCK_MS, WORKER_TICK_MS } from "./game/config";
import {
  buyWorker,
  buyUpgrade,
  clickDig,
  newGame,
  selectTarget,
  isSearchingSelected,
  startSearch,
  targetLabel,
  targetList,
  tickWorkers,
  treasures,
  treasureIndex,
  workerCount,
  workerDef,
  workerList,
  workerPrice,
} from "./game/state";
import { upgradeDef, upgradeList, isUnlocked, type UpgradeId } from "./game/upgrades";
import { CircleTimer } from "./components/CircleTimer";

type DamagePopup = {
  id: number;
  kind: "manual" | "worker";
  tone: "normal" | "effective" | "critical";
  label: string;
  dmg: number;
  scale: number;
  x: number;
  y: number;
};

const damageTextScale = (dmg: number): number => {
  // dmg = CLICK_BASE_DAMAGE * 10^n のとき、サイズは (1+n) 倍
  const ratio = Math.max(1, dmg / CLICK_BASE_DAMAGE);
  return 1 + Math.log10(ratio);
};

export default function App() {
  const [game, setGame] = useState(() => newGame());
  const [now, setNow] = useState(() => Date.now());
  const [dexOpen, setDexOpen] = useState(false);
  const [dexTreasureId, setDexTreasureId] = useState<string | null>(null);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [digShakeNonce, setDigShakeNonce] = useState(0);
  const [dismissedTreasureAt, setDismissedTreasureAt] = useState<number | null>(null);

  const digButtonRef = useRef<HTMLButtonElement>(null);
  const lastManualAtRef = useRef<number | null>(null);
  const lastWorkerAtRef = useRef<number | null>(null);

  const selectedTarget = game.targets[game.selected];
  const searching = isSearchingSelected(game);
  const canDig = selectedTarget.state === "ready";
  const treasurePopupOpen = !!game.lastTreasure && dismissedTreasureAt !== game.lastTreasure.at;
  const dexTreasure = dexTreasureId ? treasureIndex[dexTreasureId] : null;

  const moneyFxActive = !!game.lastTreasure && now - game.lastTreasure.at < 1100;
  const moneyShakeActive = !!game.lastTreasure && now - game.lastTreasure.at < 220;

  const inputLocked = !!game.lastTreasure && now - game.lastTreasure.at < TREASURE_PICKUP_INPUT_LOCK_MS;

  const clickBonus = useMemo(() => {
    let bonus = 0;
    for (const upgradeId of Object.keys(game.upgrades) as UpgradeId[]) bonus += upgradeDef[upgradeId].add;
    return bonus;
  }, [game.upgrades]);

  const hpGreen = canDig ? selectedTarget.hp : 0;
  const hpYellow = canDig ? Math.min(selectedTarget.lastPlayerDamage ?? 0, selectedTarget.maxHp - selectedTarget.hp) : 0;
  const hpBlack = canDig ? Math.max(0, selectedTarget.maxHp - selectedTarget.hp - hpYellow) : 0;

  const pct = (v: number) => (selectedTarget.maxHp <= 0 ? 0 : (v / selectedTarget.maxHp) * 100);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      setGame((prevGame) => tickWorkers(prevGame, nowMs));
    }, WORKER_TICK_MS);
    return () => clearInterval(intervalId);
  }, []);


  useEffect(() => {
    const hit = game.lastManualHit;
    if (!hit) return;
    if (lastManualAtRef.current === hit.at) return;
    lastManualAtRef.current = hit.at;

    const btn = digButtonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const r = Math.random() * 48;
    const t = Math.random() * Math.PI * 2;
    const x = rect.left + rect.width / 2 + Math.cos(t) * r;
    const y = rect.top + rect.height / 2 + Math.sin(t) * r;

    const id = hit.at + Math.random();

    const tone: DamagePopup["tone"] = hit.mult > 10 ? "critical" : hit.mult > 5 ? "effective" : "normal";
    const label = tone === "critical" ? "Critical!" : tone === "effective" ? "effective!" : "";

    setDamagePopups((prev) => [...prev, { id, kind: "manual", tone, label, dmg: hit.dmg, scale: damageTextScale(hit.dmg), x, y }]);
    window.setTimeout(() => setDamagePopups((prev) => prev.filter((p) => p.id !== id)), 1300);
  }, [game.lastManualHit]);

  useEffect(() => {
    const hit = game.lastWorkerHit;
    if (!hit) return;
    if (lastWorkerAtRef.current === hit.at) return;
    lastWorkerAtRef.current = hit.at;

    const btn = digButtonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const r = Math.random() * 48;
    const t = Math.random() * Math.PI * 2;
    const x = rect.left + rect.width / 2 + Math.cos(t) * r;
    const y = rect.top + rect.height / 2 + Math.sin(t) * r;

    const id = hit.at + Math.random();
    setDamagePopups((prev) => [...prev, { id, kind: "worker", tone: "normal", label: "", dmg: hit.dmg, scale: damageTextScale(hit.dmg), x, y }]);
    window.setTimeout(() => setDamagePopups((prev) => prev.filter((p) => p.id !== id)), 1300);
  }, [game.lastWorkerHit]);

  const unitRows = useMemo(() => {
    const rows: { id: (typeof workerList)[number]; idx: number; nextAt: number }[] = [];
    workerList.forEach((workerId) => {
      game.workerUnits[workerId].forEach((nextAt, idx) => rows.push({ id: workerId, idx, nextAt }));
    });
    return rows;
  }, [game.workerUnits]);

  return (
    <div className="app">
      <header className="appHeader">
        <div className="moneyHud">
          <span>所持金:</span>
          <span className="moneyHud__amountWrap">
            <span
              key={game.lastTreasure?.at ?? 0}
              className={moneyShakeActive ? "moneyHud__amount moneyHud__amount--shake" : "moneyHud__amount"}
            >
              {game.money}G
            </span>
            {moneyFxActive && game.lastTreasure && <span className="moneyGainPopup">+{game.lastTreasure.gold}G</span>}
          </span>
        </div>
        <button
          disabled={inputLocked}
          onClick={() => {
            setDexOpen(true);
            setDexTreasureId(null);
          }}
        >
          図鑑
        </button>
      </header>

      {treasurePopupOpen && game.lastTreasure && (
        <div
          className="treasureModalOverlay"
          role="presentation"
          onClick={() => {
            if (inputLocked) return;
            setDismissedTreasureAt(game.lastTreasure!.at);
          }}
        >
          <div
            className="treasureModal"
            role="dialog"
            aria-label="Treasure obtained"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="treasureModal__close"
              disabled={inputLocked}
              onClick={() => {
                if (inputLocked) return;
                setDismissedTreasureAt(game.lastTreasure!.at);
              }}
              aria-label="Close"
            >
              ×
            </button>

            <div className="treasureModal__titleWrap">
              <div className="treasureModal__title">{game.lastTreasure.name.toUpperCase()}</div>
              {game.lastTreasure.isNew && <span className="treasureModal__badge">NEW</span>}
            </div>

            <div className="treasureModal__subtitle">を手に入れた！</div>

            <div className="treasureModal__icon" aria-hidden>
              🎁
            </div>

            <div className="treasureModal__gold">代金: +{game.lastTreasure.gold}G</div>
            <div className="treasureModal__desc">{game.lastTreasure.desc}</div>
          </div>
        </div>
      )}

      <div className="appMain">
        <div className="appLeft">
          <section className="window" aria-label="探索対象窓">
            <div className="windowTitle">探索対象</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {targetList.map((targetId) => (
                <button
                  key={targetId}
                  disabled={searching || inputLocked}
                  onClick={() => setGame((prevGame) => selectTarget(prevGame, targetId))}
                  style={{ fontWeight: game.selected === targetId ? "bold" : "normal" }}
                >
                  {targetLabel[targetId]}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div>
                HP: {canDig ? selectedTarget.hp : "???"}/{canDig ? selectedTarget.maxHp : "???"} ({selectedTarget.state})
              </div>
              <div className="hpBar" role="img" aria-label="HP bar">
                <div className="hpBar__seg hpBar__seg--green" style={{ width: `${pct(hpGreen)}%` }} />
                <div className="hpBar__seg hpBar__seg--yellow" style={{ width: `${pct(hpYellow)}%` }} />
                <div className="hpBar__seg hpBar__seg--black" style={{ width: `${pct(hpBlack)}%` }} />
              </div>
            </div>

            {canDig ? (
              <button
                key={digShakeNonce}
                ref={digButtonRef}
                className={digShakeNonce > 0 ? "digButton digButton--shake" : "digButton"}
                disabled={searching || inputLocked}
                aria-label="掘る"
                onClick={() => {
                  setDigShakeNonce((n) => n + 1);
                  setGame((prevGame) => clickDig(prevGame, Date.now()));
                }}
                style={{ marginTop: 12 }}
              >
                <span className="digButton__emoji" aria-hidden="true">
                  {game.selected === "rock" ? "🪨" : game.selected === "house" ? "🏠" : "⛏️"}
                </span>
              </button>
            ) : (
              <button
                ref={digButtonRef}
                className="digButton"
                disabled={searching || inputLocked}
                aria-label={searching ? "探索中" : "探す"}
                onClick={() => setGame((prevGame) => startSearch(prevGame, game.selected, Date.now()))}
                style={{ marginTop: 12 }}
              >
                {searching ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <CircleTimer
                      progress={selectedTarget.searchStartedAt ? (now - selectedTarget.searchStartedAt) / SEARCH_MS : 0}
                      label="探索中"
                      size={96}
                    />
                    <div>探索中...</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 700 }}>探す</div>
                )}
              </button>
            )}

            {damagePopups.map((p) => (
              <div
                key={p.id}
                className={`damagePopup damagePopup--${p.kind} damagePopup--${p.tone}`}
                style={{ left: p.x, top: p.y, "--dmg-scale": p.scale } as React.CSSProperties}
              >
                <span className="damagePopup__num">{p.dmg}</span>
                <span className="damagePopup__suffix">ダメージ！</span>
                {p.label && <span className="damagePopup__label">{p.label}</span>}
              </div>
            ))}
          </section>

          <section className="window" aria-label="強化購入窓">
            <div className="windowTitle">強化</div>

            <div>現在の探索力: {CLICK_BASE_DAMAGE + clickBonus}</div>

            <div className="shopRow" aria-label="強化アイテム一覧">
              {upgradeList
                .filter((upgradeId) => isUnlocked(game.discoveredOrder.length, upgradeId))
                .filter((upgradeId) => !game.upgrades[upgradeId])
                .map((upgradeId) => {
                  const upgrade = upgradeDef[upgradeId];
                  return (
                    <div key={upgradeId} className="shopCard">
                      <div className="shopCard__title">{upgrade.name}</div>
                      <div className="shopCard__meta">{upgrade.price}G</div>
                      <div className="shopCard__desc">{upgrade.desc}</div>
                      <button
                        disabled={inputLocked || searching || game.money < upgrade.price}
                        onClick={() => setGame((prevGame) => buyUpgrade(prevGame, upgradeId))}
                      >
                        購入
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="window" aria-label="ワーカー購入窓">
            <div className="windowTitle">ワーカー購入</div>

            <div className="shopRow" aria-label="ワーカー商品一覧">
              {workerList.map((workerId) => {
                const price = workerPrice(game, workerId);
                return (
                  <div key={workerId} className="shopCard">
                    <div className="shopCard__title">
                      {workerDef[workerId].name}×{workerCount(game, workerId)}
                    </div>
                    <div className="shopCard__meta">{price}G</div>
                    <div className="shopCard__desc">
                      {workerDef[workerId].ms / 1000}sで{workerDef[workerId].dmg}
                    </div>
                    <button
                      disabled={inputLocked || searching || game.money < price}
                      onClick={() => setGame((prevGame) => buyWorker(prevGame, workerId, Date.now()))}
                    >
                      購入
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="appRight">
          <section className="window workerWindow" aria-label="ワーカー窓">
            <div className="windowTitle">ワーカー</div>

            <div>購入済みユニット（発火まで）</div>
            {unitRows.map((unitRow) => {
              const intervalMs = workerDef[unitRow.id].ms;
              const remainingMs = Math.max(0, unitRow.nextAt - now);
              const progress = 1 - remainingMs / intervalMs;
              return (
                <div
                  key={`${unitRow.id}-${unitRow.idx}`}
                  style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}
                >
                  <CircleTimer progress={progress} label="timer" />
                  <div style={{ width: 140 }}>
                    {workerDef[unitRow.id].name} #{unitRow.idx + 1}
                  </div>
                  <div>{Math.ceil(remainingMs / 1000)}s</div>
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {dexOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", padding: 24 }}>
          <div style={{ background: "#111", color: "#fff", maxWidth: 520, margin: "0 auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>図鑑</div>
              <button
                disabled={inputLocked}
                onClick={() => {
                  setDexOpen(false);
                  setDexTreasureId(null);
                }}
              >
                閉じる
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {targetList.map((targetId) => {
                const list = treasures[targetId];
                const unlocked = list.filter((t) => game.discovered[t.id] === true).length;
                return (
                  <div key={targetId} style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700 }}>
                      {targetLabel[targetId]}（{unlocked}/{list.length}）
                    </div>
                    {list.map((t) => {
                      const isFound = game.discovered[t.id] === true;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={inputLocked || !isFound}
                          onClick={() => setDexTreasureId(t.id)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            width: "100%",
                            marginTop: 6,
                            opacity: isFound ? 1 : 0.55,
                            cursor: isFound ? "pointer" : "default",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            color: "inherit",
                            textAlign: "left",
                          }}
                        >
                          <span>{isFound ? t.name : "？？？"}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {dexTreasure && (
        <div
          className="treasureModalOverlay"
          role="presentation"
          onClick={() => {
            if (inputLocked) return;
            setDexTreasureId(null);
          }}
        >
          <div className="treasureModal" role="dialog" aria-label="Treasure details" onClick={(e) => e.stopPropagation()}>
            <button
              className="treasureModal__close"
              disabled={inputLocked}
              onClick={() => {
                if (inputLocked) return;
                setDexTreasureId(null);
              }}
              aria-label="Close"
            >
              ×
            </button>

            <div className="treasureModal__titleWrap">
              <div className="treasureModal__title">{dexTreasure.name}</div>
            </div>

            <div className="treasureModal__subtitle">の詳細</div>

            <div className="treasureModal__icon" aria-hidden>
              📖
            </div>

            <div className="treasureModal__gold">平均金額: {dexTreasure.base}G</div>
            <div className="treasureModal__desc">{dexTreasure.desc}</div>
          </div>
        </div>
      )}
    </div>
  );
}

