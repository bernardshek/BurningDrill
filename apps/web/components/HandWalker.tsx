"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardRow } from "@/components/CardRow";
import { formatActionLabel } from "@/lib/action-label";
import { spotLeakTag, type DrillNode, type DrillPosition, type DrillStreet } from "@/lib/drill-node";
import {
  followKid,
  fullHandLine,
  gradeWalkerAction,
  sampleActionIndex,
  walkSummary,
  type WalkActor,
  type WalkDecision,
  type WalkerMode,
} from "@/lib/hand-walker";
import { loadPack } from "@/lib/load-pack";
import { parseCards } from "@/lib/parse-cards";
import { filterNodesByDrillId, sampleSpot } from "@/lib/sample-spot";
import { spotPickClass } from "@/lib/spot-verdict";

const HERO_DELAY_MS = 600;
const VILLAIN_SAMPLE_MS = 400;
const VILLAIN_ADVANCE_MS = 500;

type DecisionNote = {
  mode: "street" | "full_hand";
  tag: string;
  scenario_id: string;
  hand: string;
  chosen: string;
  correct: boolean;
};

export function HandWalker({
  mode,
  onModeChange,
  onDecision,
}: {
  mode: WalkerMode;
  onModeChange: (mode: WalkerMode) => void;
  onDecision?: (record: DecisionNote) => void;
}) {
  const [nodes, setNodes] = useState<DrillNode[]>([]);
  const [root, setRoot] = useState<DrillNode | null>(null);
  const [current, setCurrent] = useState<DrillNode | null>(null);
  const [heroHand, setHeroHand] = useState("");
  const [heroPos, setHeroPos] = useState<DrillPosition>("BTN");
  const [street, setStreet] = useState<DrillStreet>("flop");
  const [chosen, setChosen] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<WalkDecision[]>([]);
  const [sessionDecisions, setSessionDecisions] = useState<WalkDecision[]>([]);
  const [events, setEvents] = useState<WalkActor[]>([]);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastGrade, setLastGrade] = useState<WalkDecision["grade"] | null>(null);
  const [villainLabel, setVillainLabel] = useState<string | null>(null);
  const [villainBeat, setVillainBeat] = useState<{ nodeId: string; index: number } | null>(null);
  const dealGen = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAdvance = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    const ticket = ++dealGen.current;
    clearAdvance();
    setLoading(true);
    setError("");
    try {
      const pack = await loadPack("toy-6max-multistreet");
      if (ticket !== dealGen.current) return;
      const eligible = filterNodesByDrillId(pack.nodes, "btn_bb_srp_full").filter((node) =>
        mode === "street" ? node.st === street && node.hp === "BTN" : node.st === "flop" && node.hp === "BTN",
      );
      const dealt = sampleSpot(eligible, { closeOnly: false, pClose: 0, drillId: "btn_bb_srp_full" });
      if (!dealt) throw new Error("No eligible Full Hand / Street starts available");
      setNodes(pack.nodes);
      setRoot(dealt.node);
      setCurrent(dealt.node);
      setHeroHand(dealt.heroHand);
      setHeroPos(dealt.node.hp);
      setDecisions([]);
      setEvents([]);
      setChosen(null);
      setEnded(false);
      setLastGrade(null);
      setVillainLabel(null);
      setVillainBeat(null);
    } catch (e) {
      if (ticket !== dealGen.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setCurrent(null);
    } finally {
      if (ticket === dealGen.current) setLoading(false);
    }
  }, [clearAdvance, mode, street]);

  useEffect(() => {
    setSessionDecisions([]);
  }, [mode, street]);

  useEffect(() => {
    void start();
    return clearAdvance;
  }, [start, clearAdvance]);

  useEffect(() => {
    if (!current || ended || current.hp === heroPos || villainBeat?.nodeId === current.id) return;
    const node = current;
    const ticket = dealGen.current;
    const timer = setTimeout(() => {
      if (ticket !== dealGen.current) return;
      const index = sampleActionIndex(node);
      const action = node.actions[index];
      if (!action) {
        setEnded(true);
        return;
      }
      setVillainBeat({ nodeId: node.id, index });
      setVillainLabel(`${node.hp} ${formatActionLabel(action.a, action.sizeBb)}`);
      setEvents((prev) => [
        ...prev,
        { position: node.hp, action: action.a, sizeBb: action.sizeBb, street: node.st },
      ]);
    }, VILLAIN_SAMPLE_MS);
    return () => clearTimeout(timer);
  }, [current, ended, heroPos, villainBeat]);

  useEffect(() => {
    if (!villainBeat || !current || villainBeat.nodeId !== current.id || ended) return;
    const node = current;
    const index = villainBeat.index;
    const ticket = dealGen.current;
    const timer = setTimeout(() => {
      if (ticket !== dealGen.current) return;
      const child = followKid(nodes, node, index, mode, street);
      setVillainBeat(null);
      if (!child) {
        setEnded(true);
        return;
      }
      setCurrent(child);
      setChosen(null);
    }, VILLAIN_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [villainBeat, current, ended, nodes, mode, street]);

  function pick(index: number) {
    if (!current || chosen !== null || ended || current.hp !== heroPos) return;
    const action = current.actions[index];
    if (!action) return;
    const grade = gradeWalkerAction(current, index);
    const ticket = dealGen.current;
    onDecision?.({
      mode: mode === "street" ? "street" : "full_hand",
      tag: spotLeakTag(current),
      scenario_id: current.id,
      hand: heroHand,
      chosen: action.a,
      correct: grade.isCorrect,
    });
    const decision = { node: current, grade, actionIndex: index };
    setChosen(index);
    setLastGrade(grade);
    setDecisions((prev) => [...prev, decision]);
    setSessionDecisions((prev) => [...prev, decision]);
    setEvents((prev) => [
      ...prev,
      { position: current.hp, action: action.a, sizeBb: action.sizeBb, street: current.st },
    ]);
    const child = followKid(nodes, current, index, mode, street);
    if (!child) {
      setEnded(true);
      return;
    }
    clearAdvance();
    advanceTimer.current = setTimeout(() => {
      if (ticket !== dealGen.current) return;
      setCurrent(child);
      setChosen(null);
      setVillainLabel(null);
    }, HERO_DELAY_MS);
  }

  const session = walkSummary(sessionDecisions);
  const hand = walkSummary(decisions);
  const line = current && root ? fullHandLine(root, events, current) : "";
  const heroTurn = Boolean(current && !ended && current.hp === heroPos);

  return (
    <>
      <h1>Drill</h1>
      <div className="row" role="group" aria-label="Training mode">
        {(
          [
            ["spot", "Spot"],
            ["street", "Street"],
            ["full_hand", "Full Hand"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            className={mode === value ? "" : "secondary"}
            key={value}
            onClick={() => onModeChange(value)}
          >
            {label}
          </button>
        ))}
        {mode === "street" ? (
          <label className="field">
            Practice street
            <select value={street} onChange={(e) => setStreet(e.target.value as DrillStreet)}>
              <option value="flop">Flop</option>
              <option value="turn">Turn</option>
              <option value="river">River</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="card">
        <h2>
          {mode === "full_hand" ? "BTN vs BB SRP · Full Hand" : "BTN vs BB SRP · Street"}{" "}
          <span className="badge practice" title="Toy / hybrid frequencies — not solver GTO">
            Practice / toy
          </span>
        </h2>
        {error ? <p>{error}</p> : null}
        {current ? (
          <>
            <div className="action-line">{line}</div>
            {lastGrade ? (
              <p className="verdict__line">
                {lastGrade.label} · {formatActionLabel(lastGrade.chosenAction.a, lastGrade.chosenAction.sizeBb)}
                {" · best "}
                {formatActionLabel(lastGrade.bestAction.a, lastGrade.bestAction.sizeBb)}
                {" · EV loss "}
                {lastGrade.evLossBb.toFixed(2)} bb
              </p>
            ) : null}
            <div className="metrics-bar" aria-label="Decision metrics">
              <div className="metric">
                <span className="metric__label">Accuracy</span>
                <span className="metric__value">
                  {session.accuracy === null ? "—" : `${Math.round(session.accuracy * 100)}%`}
                </span>
              </div>
              <div className="metric">
                <span className="metric__label">EV loss</span>
                <span className="metric__value">{session.evLossBb.toFixed(2)} bb</span>
              </div>
              <div className="metric">
                <span className="metric__label">Decisions</span>
                <span className="metric__value">{session.decisions}</span>
              </div>
            </div>
            <div className="poker-table">
              <div className="poker-table__board">
                <CardRow
                  cards={current.bd.flatMap(parseCards)}
                  size="medium"
                  label="Board"
                  overlap={false}
                />
              </div>
              <div className="poker-table__hero">
                <CardRow cards={parseCards(heroHand)} size="medium" label={`Hero ${heroPos}`} overlap />
              </div>
              <div className="poker-table__meta">
                <span>{current.st.toUpperCase()}</span>
                <span>vs {current.vp}</span>
                <span>pot {current.pot}bb</span>
              </div>
            </div>
            {ended ? (
              <div className="result-panel">
                <h3>Hand summary</h3>
                <p>
                  {hand.decisions} decisions · Accuracy{" "}
                  {hand.accuracy === null ? "—" : `${Math.round(hand.accuracy * 100)}%`} · EV loss{" "}
                  {hand.evLossBb.toFixed(2)} bb
                </p>
                <button type="button" onClick={() => void start()}>
                  Next hand
                </button>
              </div>
            ) : heroTurn ? (
              <div className="action-grid">
                {current.actions.map((action, index) => {
                  let cls = "action-btn";
                  if (chosen === index && lastGrade) cls += ` ${spotPickClass(lastGrade)}`;
                  return (
                    <button
                      type="button"
                      className={cls}
                      key={action.a}
                      onClick={() => pick(index)}
                      disabled={chosen !== null}
                    >
                      {formatActionLabel(action.a, action.sizeBb)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="meta" aria-live="polite">
                {villainLabel ?? "Villain acts from the pack mix…"}
              </p>
            )}
          </>
        ) : (
          <p className="meta">{loading ? "Dealing…" : "No hand."}</p>
        )}
      </div>
    </>
  );
}
