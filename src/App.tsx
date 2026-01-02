import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMATION_MS, CLICK_BASE_DAMAGE, WORKER_TICK_MS } from "./game/config";
import {
  buyWorker,
  buyUpgrade,
  clickDig,
  finishAnimation,
  newGame,
  selectTarget,
  targetList,
  isAnimatingSelected,
  tickWorkers,
  workerCount,
  workerDef,
  workerList,
  workerPrice,
  treasureIndex,
} from "./game/state";
import { upgradeDef, upgradeList, isUnlocked } from "./game/upgrades";
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

  const digButtonRef = useRef<HTMLButtonElement>(null);
  const lastManualAtRef = useRef<number | null>(null);
  const lastWorkerAtRef = useRef<number | null>(null);

  const selectedTarget = game.targets[game.selected];
  const animating = isAnimatingSelected(game);

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
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>所持金: {game.money}G</div>
        <button onClick={() => setDexOpen(true)}>図鑑</button>
      </div>


      {game.lastTreasure && (
        <div style={{ marginTop: 6 }}>
          入手: {game.lastTreasure.name} +{game.lastTreasure.gold}G
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {targetList.map((targetId) => (
          <button
            key={targetId}
            disabled={animating}
            onClick={() => setGame((prevGame) => selectTarget(prevGame, targetId))}
            style={{ fontWeight: game.selected === targetId ? "bold" : "normal" }}
          >
            {targetId}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        HP: {selectedTarget.hp}/{selectedTarget.maxHp} ({selectedTarget.state})
      </div>

      <button
        key={digShakeNonce}
        ref={digButtonRef}
        className={digShakeNonce > 0 ? "digButton digButton--shake" : "digButton"}
        disabled={animating}
        onClick={() => {
          setDigShakeNonce((n) => n + 1);
          setGame((prevGame) => clickDig(prevGame, Date.now()));
        }}
        style={{ marginTop: 12, padding: 16, width: 260 }}
      >
        {animating ? `演出中（${ANIMATION_MS / 1000}s）` : "掘る（クリック）"}
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

      <div style={{ marginTop: 16 }}>
        <div>強化（図鑑 {game.discoveredOrder.length} 件）</div>
        {upgradeList.map((upgradeId) => {
          const upgrade = upgradeDef[upgradeId];
          const unlocked = isUnlocked(game.discoveredOrder.length, upgradeId);
          const owned = !!game.upgrades[upgradeId];
          return (
            <div key={upgradeId} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <div style={{ width: 140 }}>{upgrade.name}</div>
              <div style={{ width: 240 }}>{upgrade.desc}（{upgrade.price}G）</div>
              <button
                disabled={!unlocked || owned || animating || game.money < upgrade.price}
                onClick={() => setGame((prevGame) => buyUpgrade(prevGame, upgradeId))}
              >
                {owned ? "購入済み" : unlocked ? "購入" : "未解放"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
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
      </div>

      <div style={{ marginTop: 16 }}>
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
      </div>

      {dexOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", padding: 24 }}>
          <div style={{ background: "#111", color: "#fff", maxWidth: 520, margin: "0 auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>図鑑（発見済み）</div>
              <button onClick={() => setDexOpen(false)}>閉じる</button>
            </div>

            <div style={{ marginTop: 12 }}>
              {game.discoveredOrder.length === 0 && <div>まだ見つかっていません。</div>}
              {game.discoveredOrder.map((treasureId) => {
                const treasure = treasureIndex[treasureId];
                return (
                  <div key={treasureId} style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <div>{treasure ? treasure.name : treasureId}</div>
                    <div style={{ opacity: 0.8 }}>{treasure ? treasure.target : "?"}</div>
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

