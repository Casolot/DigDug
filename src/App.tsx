import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMATION_MS, CLICK_BASE_DAMAGE, WORKER_TICK_MS } from "./game/config";
import {
  buyWorker,
  buyUpgrade,
  clickDig,
  finishAnimation,
  newGame,
  selectTarget,
  isAnimatingSelected,
  targetLabel,
  targetList,
  tickWorkers,
  treasures,
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
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [digShakeNonce, setDigShakeNonce] = useState(0);
  const [dismissedTreasureAt, setDismissedTreasureAt] = useState<number | null>(null);

  const digButtonRef = useRef<HTMLButtonElement>(null);
  const lastManualAtRef = useRef<number | null>(null);
  const lastWorkerAtRef = useRef<number | null>(null);

  const selectedTarget = game.targets[game.selected];
  const animating = isAnimatingSelected(game);
  const treasurePopupOpen = !!game.lastTreasure && dismissedTreasureAt !== game.lastTreasure.at;

  const moneyFxActive = !!game.lastTreasure && now - game.lastTreasure.at < 1100;
  const moneyShakeActive = !!game.lastTreasure && now - game.lastTreasure.at < 220;

  const clickBonus = useMemo(() => {
    let bonus = 0;
    for (const upgradeId of Object.keys(game.upgrades) as UpgradeId[]) bonus += upgradeDef[upgradeId].add;
    return bonus;
  }, [game.upgrades]);

  const previewDamage = animating ? 0 : Math.max(0, game.nextClickBase + clickBonus);
  const previewClamped = Math.min(selectedTarget.hp, previewDamage);
  const hpGreen = selectedTarget.hp - previewClamped;
  const hpYellow = previewClamped;
  const hpBlack = selectedTarget.maxHp - selectedTarget.hp;

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
    if (!animating) return;
    const targetId = game.selected;
    const timeoutId = setTimeout(
      () => setGame((prevGame) => finishAnimation(prevGame, targetId, Date.now())),
      ANIMATION_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [animating, game.selected]);

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
        <button onClick={() => setDexOpen(true)}>図鑑</button>
      </header>

      {treasurePopupOpen && game.lastTreasure && (
        <div
          className="treasureModalOverlay"
          role="presentation"
          onClick={() => setDismissedTreasureAt(game.lastTreasure!.at)}
        >
          <div
            className="treasureModal"
            role="dialog"
            aria-label="Treasure obtained"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="treasureModal__close"
              onClick={() => setDismissedTreasureAt(game.lastTreasure!.at)}
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
                  disabled={animating}
                  onClick={() => setGame((prevGame) => selectTarget(prevGame, targetId))}
                  style={{ fontWeight: game.selected === targetId ? "bold" : "normal" }}
                >
                  {targetLabel[targetId]}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div>
                HP: {selectedTarget.hp}/{selectedTarget.maxHp} ({selectedTarget.state})
              </div>
              <div className="hpBar" role="img" aria-label="HP bar">
                <div className="hpBar__seg hpBar__seg--green" style={{ width: `${pct(hpGreen)}%` }} />
                <div className="hpBar__seg hpBar__seg--yellow" style={{ width: `${pct(hpYellow)}%` }} />
                <div className="hpBar__seg hpBar__seg--black" style={{ width: `${pct(hpBlack)}%` }} />
              </div>
            </div>

            <button
              key={digShakeNonce}
              ref={digButtonRef}
              className={digShakeNonce > 0 ? "digButton digButton--shake" : "digButton"}
              disabled={animating}
              aria-label={animating ? "演出中" : "掘る"}
              onClick={() => {
                setDigShakeNonce((n) => n + 1);
                setGame((prevGame) => clickDig(prevGame, Date.now()));
              }}
              style={{ marginTop: 12 }}
            >
              {animating ? (
                <CircleTimer
                  progress={game.animStartedAt ? (now - game.animStartedAt) / ANIMATION_MS : 0}
                  label="演出中"
                  size={96}
                />
              ) : (
                <span className="digButton__emoji" aria-hidden="true">
                  {game.selected === "rock" ? "🪨" : game.selected === "house" ? "🏠" : "⛏️"}
                </span>
              )}
            </button>

            {damagePopups.map((p) => (
              <div
                key={p.id}
                className={`damagePopup damagePopup--${p.kind} damagePopup--${p.tone}`}
                style={{ left: p.x, top: p.y, "--dmg-scale": p.scale } as React.CSSProperties}
              >
                {p.label && <span className="damagePopup__label">{p.label}</span>}
                <span className="damagePopup__num">{p.dmg}</span>
                <span className="damagePopup__suffix">ダメージ！</span>
              </div>
            ))}
          </section>

          <section className="window" aria-label="強化購入窓">
            <div className="windowTitle">強化</div>

            <div>現在の探索力: {CLICK_BASE_DAMAGE + clickBonus}</div>

            {upgradeList
              .filter((upgradeId) => isUnlocked(game.discoveredOrder.length, upgradeId))
              .map((upgradeId) => {
                const upgrade = upgradeDef[upgradeId];
                const owned = !!game.upgrades[upgradeId];
                return (
                  <div key={upgradeId} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <div style={{ width: 140 }}>{upgrade.name}</div>
                    <div style={{ width: 240 }}>{upgrade.desc}（{upgrade.price}G）</div>
                    <button
                      disabled={owned || animating || game.money < upgrade.price}
                      onClick={() => setGame((prevGame) => buyUpgrade(prevGame, upgradeId))}
                    >
                      {owned ? "購入済み" : "購入"}
                    </button>
                  </div>
                );
              })}
          </section>

          <section className="window" aria-label="ワーカー購入窓">
            <div className="windowTitle">ワーカー購入</div>

            {workerList.map((workerId) => {
              const price = workerPrice(game, workerId);
              return (
                <div key={workerId} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <div style={{ width: 140 }}>
                    {workerDef[workerId].name} x{workerCount(game, workerId)}
                  </div>
                  <div style={{ width: 180 }}>
                    {price}G / {workerDef[workerId].ms / 1000}sで{workerDef[workerId].dmg}
                  </div>
                  <button
                    disabled={animating || game.money < price}
                    onClick={() => setGame((prevGame) => buyWorker(prevGame, workerId, Date.now()))}
                  >
                    購入
                  </button>
                </div>
              );
            })}
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
              <button onClick={() => setDexOpen(false)}>閉じる</button>
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
                        <div
                          key={t.id}
                          style={{ display: "flex", justifyContent: "space-between", marginTop: 6, opacity: isFound ? 1 : 0.55 }}
                        >
                          <div>{isFound ? t.name : "？？？"}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

