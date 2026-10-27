"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Spot } from "@poker-trainer/pack-format";
import { loadPack, type LoadedPack } from "@/lib/load-pack";
import {
  DEFAULT_SETTINGS,
  loadSavedDrill,
  saveDrillSettings,
  type DrillSettings,
} from "@/lib/saved-drill";
import { formatActionLabel } from "@/lib/action-label";
import { getOrCreateLocalUser, updateLocalUser } from "@/lib/user";
import { parseCards } from "@/lib/parse-cards";
import { CardRow } from "@/components/CardRow";
import { adaptToySpots } from "@/lib/adapt-toy-spot";
import {
  formatActionLine,
  formatTexture,
  gradeDrillNode,
  NAMED_DRILLS,
  type DrillGrade,
  type DrillNode,
} from "@/lib/drill-node";
import {
  filterNodesByDrillId,
  sampleSpot,
  type SampleTelemetry,
} from "@/lib/sample-spot";
import { handFromComboIndex } from "@/lib/combo1326";
import { HandWalker } from "@/components/HandWalker";
import { SpotVerdict } from "@/components/SpotVerdict";
import { spotPickClass } from "@/lib/spot-verdict";
import type { WalkerMode } from "@/lib/hand-walker";
import { WeeklockPackSchema, type WeeklockPack } from "@poker-trainer/pack-format";
import { appendDecision, readSessionLog, accuracy as logAccuracy, streaks, sessions, type DecisionRecord } from "@/lib/session-log";
import { correctActions, dealWeeklock, handClassFromCombo } from "@/lib/weeklock";

type WeeklockDeal = ReturnType<typeof dealWeeklock>;

type ActiveSpot = {
  node: DrillNode;
  heroHand: string;
  /** Index into filteredNodes[] — browse/debug only. */
  sourceIndex: number;
};

type MistakeRecord = {
  id: string;
  nodeId: string;
  board: string;
  heroHand: string;
  chosen: string;
  best: string;
  evLossBb: number;
  label: DrillGrade["label"];
  drillId?: string;
  line: string;
  tx?: string;
};

type SessionStats = {
  hands: number;
  correct: number;
  totalEvLossBb: number;
  mistakes: MistakeRecord[];
};

const EMPTY_STATS: SessionStats = {
  hands: 0,
  correct: 0,
  totalEvLossBb: 0,
  mistakes: [],
};

export function DrillClient() {
  const [mode, setMode] = useState<WalkerMode>("spot");
  const [settings, setSettings] = useState<DrillSettings>(DEFAULT_SETTINGS);
  const [pack, setPack] = useState<LoadedPack | null>(null);
  const [nodes, setNodes] = useState<DrillNode[]>([]);
  const [active, setActive] = useState<ActiveSpot | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<DrillGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [lastTelemetry, setLastTelemetry] = useState<SampleTelemetry | null>(
    null,
  );
  const [session, setSession] = useState<SessionStats>(EMPTY_STATS);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [retryQueue, setRetryQueue] = useState<MistakeRecord[]>([]);
  const [weeklockOn, setWeeklockOn] = useState(false);
  const [weeklock, setWeeklock] = useState<WeeklockPack | null>(null);
  const [weekDeal, setWeekDeal] = useState<WeeklockDeal | null>(null);
  const [weekChoice, setWeekChoice] = useState<string | null>(null);
  const [weekCorrect, setWeekCorrect] = useState<boolean | null>(null);
  const [log, setLog] = useState<DecisionRecord[]>([]);

  useEffect(() => {
    setLog(readSessionLog());
    setWeeklockOn(localStorage.getItem("pt_weeklock_on_v1") === "true");
    fetch("/packs/weeklock/weeklock.json").then(r => { if (!r.ok) throw new Error("Could not load Week lock pack"); return r.json(); }).then(raw => { const parsed = WeeklockPackSchema.safeParse(raw); if (!parsed.success) throw new Error(parsed.error.message); setWeeklock(parsed.data); }).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const saved = loadSavedDrill();
    if (saved) setSettings(saved);
    getOrCreateLocalUser();
  }, []);

  const filteredNodes = useMemo(
    () => filterNodesByDrillId(nodes, settings.drillId),
    [nodes, settings.drillId],
  );

  const node = active?.node ?? null;
  const bestAction = node ? node.actions[node.best] : null;
  const actionLine = node ? formatActionLine(node) : "";
  const textureLabel = formatTexture(node?.tx);

  const boardCards = useMemo(
    () => (node ? node.bd.flatMap((c) => parseCards(c)) : []),
    [node],
  );
  const heroCards = useMemo(
    () => parseCards(active?.heroHand ?? ""),
    [active?.heroHand],
  );

  const accuracyPct =
    session.hands > 0
      ? Math.round((session.correct / session.hands) * 1000) / 10
      : null;

  const dealFromNodes = useCallback(
    (
      list: DrillNode[],
      closeOnly: boolean,
      drillId: string,
      preferSequentialIndex?: number,
    ) => {
      if (list.length === 0) {
        setActive(null);
        return;
      }
      if (
        preferSequentialIndex != null &&
        preferSequentialIndex >= 0 &&
        preferSequentialIndex < list.length
      ) {
        const n = list[preferSequentialIndex]!;
        const heroHand = activeHeroFromNode(n);
        setActive({
          node: n,
          heroHand,
          sourceIndex: preferSequentialIndex,
        });
        setLastTelemetry(null);
        return;
      }
      const sampled = sampleSpot(list, { closeOnly, drillId });
      if (!sampled) {
        setError("No eligible spots in pack");
        setActive(null);
        return;
      }
      const sourceIndex = list.findIndex((n) => n.id === sampled.node.id);
      setActive({
        node: sampled.node,
        heroHand: sampled.heroHand,
        sourceIndex: sourceIndex >= 0 ? sourceIndex : 0,
      });
      setLastTelemetry(sampled.telemetry);
    },
    [],
  );

  const load = useCallback(
    async (s: DrillSettings, resetSession = true) => {
      setLoading(true);
      setError(null);
      setChosen(null);
      setResult(null);
      setScorecardOpen(false);
      if (resetSession) {
        setSession(EMPTY_STATS);
        setRetryQueue([]);
      }
      try {
        const loaded = await loadPack(s.packId);
        let adapted: DrillNode[];
        if (loaded.format === "drill_node_v1" && loaded.nodes.length > 0) {
          adapted = loaded.nodes;
        } else {
          adapted = adaptToySpots(loaded.spots as Spot[]);
        }
        setPack(loaded);
        setNodes(adapted);
        const pool = filterNodesByDrillId(adapted, s.drillId);
        dealFromNodes(pool, s.closeOnly, s.drillId);
        updateLocalUser({
          pack_prefs: {
            last_pack: s.packId,
            last_line: s.line,
            last_drill: s.drillId,
          },
        });
      } catch (e) {
        setPack(null);
        setNodes([]);
        setActive(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [dealFromNodes],
  );

  function onPick(action: string) {
    if (!node || !active || chosen) return;
    const scored = gradeDrillNode(node, action);
    setChosen(action);
    setResult(scored);
    const mistake: MistakeRecord | null =
      scored.label === "Wrong"
        ? {
            id: `${node.id}-${active.heroHand}-${Date.now()}`,
            nodeId: node.id,
            board: node.bd.join(""),
            heroHand: active.heroHand,
            chosen: scored.chosenAction.a,
            best: scored.bestAction.a,
            evLossBb: scored.evLossBb,
            label: scored.label,
            drillId: node.drill_id,
            line: formatActionLine(node),
            tx: node.tx,
          }
        : null;
    setSession((prev) => ({
      hands: prev.hands + 1,
      correct: prev.correct + (scored.isCorrect ? 1 : 0),
      totalEvLossBb:
        Math.round((prev.totalEvLossBb + scored.evLossBb) * 1000) / 1000,
      mistakes: mistake ? [...prev.mistakes, mistake] : prev.mistakes,
    }));
    const record: DecisionRecord = { ts: new Date().toISOString(), mode: "spot", tag: node.st === "flop" && node.hp === "BTN" && node.vp === "BB" && node.drill_id === "btn_flop_cbet" ? "cbet" : "other", scenario_id: node.id, hand: active.heroHand, chosen: action, correct: scored.isCorrect };
    appendDecision(record); setLog(readSessionLog());
  }

  function toggleWeeklock(enabled: boolean) {
    setWeeklockOn(enabled); localStorage.setItem("pt_weeklock_on_v1", String(enabled)); setWeekDeal(null); setWeekChoice(null); setWeekCorrect(null);
  }
  function dealWeek() { if (!weeklock) return; setWeekDeal(dealWeeklock(weeklock)); setWeekChoice(null); setWeekCorrect(null); }
  function pickWeekAction(action: string) {
    if (!weekDeal || weekChoice) return;
    const good = correctActions(weekDeal.scenario, weekDeal.handClass);
    const correct = good.includes(action);
    setWeekChoice(action); setWeekCorrect(correct);
    setSession(prev => ({ ...prev, hands: prev.hands + 1, correct: prev.correct + (correct ? 1 : 0) }));
    appendDecision({ ts: new Date().toISOString(), mode: "weeklock", tag: weekDeal.scenario.tag, scenario_id: weekDeal.scenario.id, hand: weekDeal.hand, chosen: action, correct });
    setLog(readSessionLog());
  }

  function browseNext() {
    if (!filteredNodes.length) return;
    setChosen(null);
    setResult(null);
    const next =
      active != null ? (active.sourceIndex + 1) % filteredNodes.length : 0;
    dealFromNodes(filteredNodes, settings.closeOnly, settings.drillId, next);
  }

  function randomSpot() {
    if (!filteredNodes.length) return;
    setChosen(null);
    setResult(null);
    if (retryQueue.length > 0) {
      const [next, ...rest] = retryQueue;
      setRetryQueue(rest);
      const idx = filteredNodes.findIndex((n) => n.id === next!.nodeId);
      if (idx >= 0) {
        const n = filteredNodes[idx]!;
        setActive({
          node: n,
          heroHand: next!.heroHand || activeHeroFromNode(n),
          sourceIndex: idx,
        });
        setLastTelemetry(null);
        return;
      }
    }
    dealFromNodes(filteredNodes, settings.closeOnly, settings.drillId);
  }

  function onSave() {
    saveDrillSettings(settings);
    setSavedNote("Settings saved (localStorage). Reopen Drill to restore.");
    setTimeout(() => setSavedNote(null), 3000);
  }

  function onCloseOnlyChange(checked: boolean) {
    setSettings((s) => ({ ...s, closeOnly: checked }));
  }

  function onDrillChange(drillId: string) {
    setSettings((s) => ({ ...s, drillId }));
  }

  function endSession() {
    setScorecardOpen(true);
  }

  function retryMistakes() {
    if (session.mistakes.length === 0) return;
    setRetryQueue([...session.mistakes]);
    setScorecardOpen(false);
    setChosen(null);
    setResult(null);
    const first = session.mistakes[0]!;
    const idx = filteredNodes.findIndex((n) => n.id === first.nodeId);
    if (idx >= 0) {
      const n = filteredNodes[idx]!;
      setActive({
        node: n,
        heroHand: first.heroHand || activeHeroFromNode(n),
        sourceIndex: idx,
      });
      setRetryQueue(session.mistakes.slice(1));
      setLastTelemetry(null);
    } else {
      dealFromNodes(filteredNodes, settings.closeOnly, settings.drillId);
    }
  }

  function resetSession() {
    setSession(EMPTY_STATS);
    setRetryQueue([]);
    setScorecardOpen(false);
    setChosen(null);
    setResult(null);
    dealFromNodes(filteredNodes, settings.closeOnly, settings.drillId);
  }

  const flopLabel =
    pack?.flopCount != null
      ? `${pack.flopCount}-flop study subset · not every Hold’em flop`
      : "Study subset · deals reshuffle from this pack";

  const drillMeta = NAMED_DRILLS.find((d) => d.id === settings.drillId);
  const shortNodeId = active?.node.id
    ? active.node.id.replace(/^n_btn_bb_f_/, "").slice(0, 18)
    : "";

  if (mode !== "spot") return <><HandWalker mode={mode} onModeChange={setMode} onDecision={(d) => { appendDecision({ ...d, ts: new Date().toISOString() }); setLog(readSessionLog()); }} /><LeaksPanel records={log} onChange={() => setLog(readSessionLog())} /></>;

  return (
    <>
      <h1>Drill</h1>
      <div className="row" role="group" aria-label="Training mode">
        <button type="button" onClick={() => setMode("spot")}>Spot</button>
        <button type="button" className="secondary" onClick={() => setMode("street")}>Street</button>
        <button type="button" className="secondary" onClick={() => setMode("full_hand")}>Full Hand</button>
      </div>
      <div className="card">
        <label className="field field-toggle">Week lock <span className="toggle-row"><input type="checkbox" checked={weeklockOn} onChange={e => toggleWeeklock(e.target.checked)} /><span className="meta">{weeklockOn ? "NL5 weekly leak drill" : "Use current EV drill"}</span></span></label>
      </div>
      <p className="lead">
        Cash · 6-max · named decision drills. Pick a question, then deal inside
        that spot. Best = argmax EV. Close-only is a mode, not the product.
      </p>

      {!weeklockOn ? <div className="card">
        <h2>Settings</h2>
        <div className="row">
          <label className="field">
            Drill
            <select
              value={settings.drillId}
              onChange={(e) => onDrillChange(e.target.value)}
            >
              {NAMED_DRILLS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Format
            <select
              value={settings.format}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  format: e.target.value as DrillSettings["format"],
                }))
              }
            >
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="field">
            Table
            <select
              value={settings.tableSize}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  tableSize: Number(e.target.value) as 6 | 9,
                }))
              }
            >
              <option value={6}>6-max</option>
              <option value={9} disabled>
                9-max (later)
              </option>
            </select>
          </label>
          <label className="field">
            Line
            <select
              value={settings.line}
              onChange={(e) =>
                setSettings((s) => ({ ...s, line: e.target.value }))
              }
            >
              <option value="BTN_vs_BB_SRP">BTN vs BB SRP</option>
            </select>
          </label>
          <label className="field">
            Pack
            <select
              value={settings.packId}
              onChange={(e) =>
                setSettings((s) => ({ ...s, packId: e.target.value }))
              }
            >
              <option value="toy-6max-expand">
                25-flop expand (Practice / toy)
              </option>
              <option value="toy-6max">Legacy 12-spot toy</option>
            </select>
          </label>
          <label className="field field-toggle">
            Close only
            <span className="toggle-row">
              <input
                type="checkbox"
                checked={settings.closeOnly}
                onChange={(e) => onCloseOnlyChange(e.target.checked)}
              />
              <span className="meta">
                {settings.closeOnly
                  ? "ΔEV / mix band only (falls back if empty)"
                  : "Default mix (~25% close)"}
              </span>
            </span>
          </label>
        </div>
        {drillMeta ? (
          <p className="meta" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            {drillMeta.blurb}
            {filteredNodes.length > 0
              ? ` · ${filteredNodes.length} nodes in pool`
              : ""}
          </p>
        ) : null}
        <div className="row" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={() => load(settings)} disabled={loading}>
            {loading ? "Loading…" : "Load / start"}
          </button>
          <button type="button" className="secondary" onClick={onSave}>
            Save settings
          </button>
          {savedNote ? <span className="meta">{savedNote}</span> : null}
        </div>
        {error ? (
          <p style={{ color: "var(--bad)", marginTop: "0.75rem" }}>{error}</p>
        ) : null}
      </div> : null}

      {weeklockOn && weeklock ? <div className="card">
        <h2>Week lock · {weeklock.stakes} · {weeklock.version} {weeklock.placeholder === true ? <span className="badge practice">Placeholder rules</span> : null}</h2>
        {weeklock.rules?.length ? <div className="meta" style={{ marginBottom: "0.75rem" }}><strong>Week lock rules</strong><ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>{weeklock.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></div> : null}
        <div className="metrics-bar"><div className="metric"><span className="metric__label">Accuracy</span><span className="metric__value">{accuracyPct == null ? "—" : `${accuracyPct}%`}</span></div><div className="metric"><span className="metric__label">Hands</span><span className="metric__value">{session.hands}</span></div></div>
        {weekDeal ? <><p className="action-line">{weekDeal.scenario.line}</p><div className="poker-table"><div className="poker-table__hero"><CardRow cards={parseCards(weekDeal.hand)} size="medium" label={`Hero ${weekDeal.scenario.hero_pos}`} overlap /></div><div className="poker-table__meta"><span>{weekDeal.scenario.tag}</span><span>Hero {weekDeal.scenario.hero_pos}</span><span>{weekDeal.scenario.villain_pos ? `Villain ${weekDeal.scenario.villain_pos}` : "No villain yet"}</span><span>{weekDeal.handClass}</span></div></div><div className="action-grid">{weekDeal.scenario.actions.map(action => <button key={action} type="button" className="action-btn" disabled={Boolean(weekChoice)} onClick={() => pickWeekAction(action)}>{formatActionLabel(action)}</button>)}</div>{weekChoice ? <div className="result-panel"><span className={`badge ${weekCorrect ? "correct" : "wrong"}`}>{weekCorrect ? "Correct" : "Wrong"}</span><p>Correct action(s): <strong>{correctActions(weekDeal.scenario, weekDeal.handClass).map(formatActionLabel).join(" / ")}</strong></p><p className="meta">{weekDeal.scenario.note}</p><button type="button" onClick={dealWeek}>Next hand</button></div> : null}</> : <button type="button" onClick={dealWeek} disabled={!weeklock}>Deal hand</button>}
      </div> : null}

      {pack && node && active ? (
        <div className="card">
          <h2
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <span>{drillMeta?.label ?? "Drill"}</span>
            {pack.practice ? (
              <span
                className="badge practice"
                title="Toy / hybrid freqs — not solver GTO"
              >
                Practice / toy
              </span>
            ) : null}
          </h2>

          <div className="action-line" aria-label="Action line">
            {actionLine}
          </div>

          <div className="metrics-bar" aria-label="Session skill metrics">
            <div className="metric">
              <span className="metric__label">Accuracy</span>
              <span className="metric__value">
                {accuracyPct == null ? "—" : `${accuracyPct}%`}
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">EV loss</span>
              <span className="metric__value">
                {session.totalEvLossBb.toFixed(2)} bb
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">Hands</span>
              <span className="metric__value">{session.hands}</span>
            </div>
            {retryQueue.length > 0 ? (
              <div className="metric">
                <span className="metric__label">Retry left</span>
                <span className="metric__value">{retryQueue.length}</span>
              </div>
            ) : null}
          </div>

          <p className="meta" style={{ marginTop: "0.75rem" }}>
            {flopLabel}
            {textureLabel ? ` · ${textureLabel}` : ""}
            {shortNodeId ? ` · ${shortNodeId}` : ""}
            {settings.closeOnly ? " · close" : ""}
            {lastTelemetry?.fallbackFromClose ? " · fallback" : ""}
          </p>

          <div className="poker-table" aria-label="Poker table">
            <div className="poker-table__board">
              <CardRow
                cards={boardCards}
                size="medium"
                label="Board"
                overlap={false}
              />
              {!boardCards.length && node.bd.length === 0 ? (
                <span className="card-row-label poker-table__empty">
                  Board — preflop
                </span>
              ) : null}
            </div>
            <div className="poker-table__hero">
              <CardRow
                cards={heroCards}
                size="medium"
                label={`Hero ${node.hp}`}
                overlap
              />
              {!heroCards.length && active.heroHand ? (
                <span className="sr-only">Hero hand {active.heroHand}</span>
              ) : null}
            </div>
            <div className="poker-table__meta">
              <span>{node.st.toUpperCase()}</span>
              <span>vs {node.vp}</span>
              <span>pot {node.pot}bb</span>
              <span>stack {node.eff}bb</span>
              <span>ΔEV {node.dev.toFixed(2)}bb</span>
              {textureLabel ? <span>{textureLabel}</span> : null}
              <span>{node.combos.length} combos in range</span>
            </div>
          </div>

          <p className="meta" style={{ marginTop: "0.75rem" }}>
            abstraction: {pack.manifest.abstraction} ·{" "}
            {node.drill_id ? `drill: ${node.drill_id} · ` : ""}
            {node.ip ? "IP" : "OOP"} · {pack.manifest.name} v
            {pack.manifest.version}
          </p>

          <div className="action-grid">
            {node.actions.map((a, idx) => {
              const picked = chosen === a.a;
              const isBest = Boolean(result && idx === result.bestIndex);
              let cls = "action-btn";
              if (picked && result) cls += ` ${spotPickClass(result)}`;
              if (isBest && chosen) cls += " is-best";
              return (
                <button
                  key={a.a}
                  type="button"
                  className={cls}
                  disabled={Boolean(chosen)}
                  onClick={() => onPick(a.a)}
                >
                  {formatActionLabel(a.a, a.sizeBb)}
                </button>
              );
            })}
          </div>

          {result ? (
            <SpotVerdict
              node={node}
              grade={result}
              nextLabel={retryQueue.length > 0 ? "Next retry" : "Random deal"}
              onNext={randomSpot}
              onEnd={endSession}
              endDisabled={session.hands === 0}
              browseOpen={browseOpen}
              onBrowse={() => setBrowseOpen((v) => !v)}
              onBrowseNext={browseNext}
            />
          ) : (
            <div className="row" style={{ marginTop: "1rem" }}>
              <p className="meta" style={{ margin: 0 }}>
                Pick an action.
                {bestAction
                  ? ` · ${node.actions.length} actions in tree`
                  : ""}
              </p>
              <button type="button" className="secondary" onClick={randomSpot}>
                Random deal
              </button>
              <button
                type="button"
                className="secondary"
                onClick={endSession}
                disabled={session.hands === 0}
              >
                End session
              </button>
            </div>
          )}
        </div>
      ) : null}

      {scorecardOpen ? (
        <div className="card scorecard" aria-label="Session scorecard">
          <h2>Session scorecard</h2>
          <div className="metrics-bar">
            <div className="metric">
              <span className="metric__label">Accuracy</span>
              <span className="metric__value">
                {accuracyPct == null ? "—" : `${accuracyPct}%`}
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">Total EV loss</span>
              <span className="metric__value">
                {session.totalEvLossBb.toFixed(2)} bb
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">Hands</span>
              <span className="metric__value">{session.hands}</span>
            </div>
            <div className="metric">
              <span className="metric__label">Mistakes</span>
              <span className="metric__value">{session.mistakes.length}</span>
            </div>
          </div>
          {session.mistakes.length > 0 ? (
            <>
              <h3 style={{ marginTop: "1.25rem", fontSize: "1rem" }}>
                Mistakes this session
              </h3>
              <ul className="mistake-list">
                {session.mistakes.map((m) => (
                  <li key={m.id}>
                    <span className="meta">
                      {m.board} · {m.heroHand}
                      {m.tx ? ` · ${formatTexture(m.tx)}` : ""}
                    </span>
                    <div>
                      {formatActionLabel(m.chosen)} → best{" "}
                      {formatActionLabel(m.best)} · −{m.evLossBb.toFixed(2)} bb
                    </div>
                    <div className="meta">{m.line}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="meta">No Wrong grades this session.</p>
          )}
          <div className="row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              onClick={retryMistakes}
              disabled={session.mistakes.length === 0}
            >
              Retry mistakes
            </button>
            <button type="button" className="secondary" onClick={resetSession}>
              New session
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setScorecardOpen(false)}
            >
              Keep drilling
            </button>
          </div>
        </div>
      ) : null}
      <LeaksPanel records={log} onChange={() => setLog(readSessionLog())} />
    </>
  );
}

function LeaksPanel({ records, onChange }: { records: DecisionRecord[]; onChange: () => void }) {
  const tags = ["RFI", "vs3bet", "vs4bet", "cbet"];
  const now = Date.now();
  const periods = [{ label: "Today", from: new Date().setHours(0,0,0,0) }, { label: "7 days", from: now - 7*86400000 }, { label: "All time", from: 0 }];
  const perScenario = new Map<string, DecisionRecord[]>();
  for (const item of records) perScenario.set(item.scenario_id, [...(perScenario.get(item.scenario_id) ?? []), item]);
  const streak = streaks(records);
  function download() { const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "poker-trainer-session-log.json"; a.click(); URL.revokeObjectURL(url); }
  function clear() { if (window.confirm("Clear the full session log?")) { localStorage.removeItem("pt_session_log_v1"); onChange(); } }
  return <section className="card"><h2>Leaks</h2><p>Correct streak: {streak.current} · Best streak: {streak.best}</p><div style={{ overflowX: "auto" }}><table><thead><tr><th>Tag</th>{periods.map(p=><th key={p.label}>{p.label}</th>)}</tr></thead><tbody>{tags.map(tag=><tr key={tag}><th>{tag}</th>{periods.map(p=>{const subset=records.filter(r=>r.tag===tag && Date.parse(r.ts)>=p.from); const value=logAccuracy(subset); return <td key={p.label}>{value===null?"—":`${Math.round(value*100)}% (${subset.length})`}</td>;})}</tr>)}</tbody></table></div><h3>Scenario accuracy (worst first)</h3><ol>{[...perScenario].map(([id,items])=>({id,items,acc:logAccuracy(items)??0})).sort((a,b)=>a.acc-b.acc).map(x=><li key={x.id}>{x.id}: {Math.round(x.acc*100)}% ({x.items.length})</li>)}</ol><h3>Last 10 sessions</h3><ol>{sessions(records).slice(-10).reverse().map((items,i)=><li key={`${items[0]?.ts}-${i}`}>{new Date(items[0]!.ts).toLocaleString()} · {items.length} decisions · {Math.round((logAccuracy(items)??0)*100)}%</li>)}</ol><div className="row"><button type="button" className="secondary" onClick={download}>Download JSON</button><button type="button" className="secondary" onClick={clear}>Clear log</button></div></section>;
}

function activeHeroFromNode(n: DrillNode): string {
  if (n.combos[0]) return handFromComboIndex(n.combos[0].c);
  return "";
}

