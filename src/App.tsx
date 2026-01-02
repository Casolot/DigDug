import { useEffect, useMemo, useState } from "react";
import { ANIMATION_MS, WORKER_TICK_MS } from "./game/config";
import {
  buyWorker,
  buyUpgrade,
  clickDig,
  finishAnimation,
  newGame,
  selectTarget,
  tickWorkers,
  workerCount,
  workerDef,
  workerPrice,
  treasureIndex,
} from "./game/state";
import { upgradeDef, isUnlocked } from "./game/upgrades";
import { CircleTimer } from "./components/CircleTimer";

export default function App() {
  const [g, setG] = useState(() => newGame());
  const [now, setNow] = useState(() => Date.now());
  const [dexOpen, setDexOpen] = useState(false);

  const t = g.targets[g.selected];
  const anim = t.state !== "normal";

  useEffect(() => {
    const h = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setG((x) => tickWorkers(x, n));
    }, WORKER_TICK_MS);
    return () => clearInterval(h);
  }, []);

  useEffect(() => {
    if (!anim) return;
    const id = g.selected;
    const h = setTimeout(() => setG((x) => finishAnimation(x, id, Date.now())), ANIMATION_MS);
    return () => clearTimeout(h);
  }, [anim, g.selected]);

  const unitRows = useMemo(() => {
    const rows: { id: keyof typeof workerDef; idx: number; nextAt: number }[] = [];
    (Object.keys(workerDef) as (keyof typeof workerDef)[]).forEach((id) => {
      g.workerUnits[id].forEach((nextAt, idx) => rows.push({ id, idx, nextAt }));
    });
    return rows;
  }, [g.workerUnits]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>所持金: {g.money}G</div>
        <button onClick={() => setDexOpen(true)}>図鑑</button>
      </div>

      {g.lastClickDamage != null && (
        <div style={{ marginTop: 6 }}>クリックダメージ: {g.lastClickDamage}</div>
      )}

      {g.lastTreasure && (
        <div style={{ marginTop: 6 }}>
          入手: {g.lastTreasure.name} +{g.lastTreasure.gold}G
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {(["rock", "house", "mine"] as const).map((id) => (
          <button
            key={id}
            disabled={anim}
            onClick={() => setG((x) => selectTarget(x, id))}
            style={{ fontWeight: g.selected === id ? "bold" : "normal" }}
          >
            {id}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        HP: {t.hp}/{t.maxHp} ({t.state})
      </div>

      <button
        disabled={anim}
        onClick={() => setG((x) => clickDig(x, Date.now()))}
        style={{ marginTop: 12, padding: 16, width: 260 }}
      >
        {anim ? `演出中（${ANIMATION_MS / 1000}s）` : "掘る（クリック）"}
      </button>

      <div style={{ marginTop: 16 }}>
        <div>強化（図鑑 {g.discoveredOrder.length} 件）</div>
        {(Object.keys(upgradeDef) as (keyof typeof upgradeDef)[]).map((id) => {
          const u = upgradeDef[id];
          const ok = isUnlocked(g.discoveredOrder.length, id);
          const owned = !!g.upgrades[id];
          return (
            <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <div style={{ width: 140 }}>{u.name}</div>
              <div style={{ width: 240 }}>{u.desc}（{u.price}G）</div>
              <button
                disabled={!ok || owned || anim || g.money < u.price}
                onClick={() => setG((x) => buyUpgrade(x, id))}
              >
                {owned ? "購入済み" : ok ? "購入" : "未解放"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        {(Object.keys(workerDef) as (keyof typeof workerDef)[]).map((id) => {
          const price = workerPrice(g, id);
          return (
            <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <div style={{ width: 140 }}>
                {workerDef[id].name} x{workerCount(g, id)}
              </div>
              <div style={{ width: 180 }}>
                {price}G / {workerDef[id].ms / 1000}sで{workerDef[id].dmg}
              </div>
              <button
                disabled={anim || g.money < price}
                onClick={() => setG((x) => buyWorker(x, id, Date.now()))}
              >
                購入
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <div>購入済みユニット（発火まで）</div>
        {unitRows.map((u) => {
          const ms = workerDef[u.id].ms;
          const rem = Math.max(0, u.nextAt - now);
          const prog = 1 - rem / ms;
          return (
            <div key={`${u.id}-${u.idx}`} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <CircleTimer progress={prog} label="timer" />
              <div style={{ width: 140 }}>
                {workerDef[u.id].name} #{u.idx + 1}
              </div>
              <div>{Math.ceil(rem / 1000)}s</div>
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
              {g.discoveredOrder.length === 0 && <div>まだ見つかっていません。</div>}
              {g.discoveredOrder.map((tid) => {
                const tr = treasureIndex[tid];
                return (
                  <div key={tid} style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <div>{tr ? tr.name : tid}</div>
                    <div style={{ opacity: 0.8 }}>{tr ? tr.target : "?"}</div>
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

