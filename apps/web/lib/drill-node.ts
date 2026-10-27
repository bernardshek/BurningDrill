/**
 * Compact DrillPack node types (Coach lock 2026-10-22).
 *
 * Short keys match `/workspace/research/drillpack-node-v1.json`.
 * Combo encoding: uint16 `c` ∈ 0..1325 via `combo1326.ts` (not "AsKd" in pack).
 * Decode to display strings only at render.
 *
 * Mapping from legacy toy Spot (camelCase UI / pack-format):
 *   id            → id
 *   street        → st
 *   hero_position → hp
 *   villain_position → vp
 *   (derived)     → ip  (hero acts last postflop)
 *   board string  → bd  string[]
 *   potBb         → pot
 *   stackBb       → eff
 *   (1/N)         → nf
 *   actions[].action/frequency/evBb → actions[].a/m/ev
 *   argmax EV idx → best; EV_best − EV_second → dev
 *   warmup bit    → wu
 *   kids          → parallel to actions (null for toy)
 *   hero_hand     → combos: [{ c: combo1326, w: 1 }]
 */

export type DrillStreet = "preflop" | "flop" | "turn" | "river";

export type DrillPosition =
  | "UTG"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB"
  | "BB";

export type DrillAction = {
  /** Action id in tree, e.g. "check", "bet_33". */
  a: string;
  /** Mix frequency 0..1. */
  m: number;
  /** EV in bb. */
  ev: number;
  /** Optional size in bb (toy packs; not in compact CDN sketch). */
  sizeBb?: number;
};

export type DrillCombo = {
  /** uint16 combo index 0..1325. */
  c: number;
  /** Relative weight in range. */
  w: number;
};

export type DrillNode = {
  id: string;
  st: DrillStreet;
  hp: DrillPosition;
  vp: DrillPosition;
  /** Hero is in position. */
  ip: boolean;
  /** Optional texture tag. */
  tx?: string;
  /** Board cards as 2-char strings, e.g. ["Ah","7d","2c"]. */
  bd: string[];
  pot: number;
  eff: number;
  /** Node reach / visit weight. */
  nf: number;
  /** Warmup-eligible (trivial bucket). */
  wu: boolean;
  /** Index into actions[] of argmax-EV action. */
  best: number;
  /** ΔEV bb: best − second-best. */
  dev: number;
  actions: DrillAction[];
  /** Child node ids parallel to actions; null = terminal / unknown. */
  kids: (string | null)[];
  combos: DrillCombo[];
  /** Named mini-drill: btn_flop_cbet | bb_vs_cbet | … */
  drill_id?: string;
  /** Full action-line strip for chrome. */
  line?: string;
  /** Ordered action-line steps. */
  line_steps?: string[];
  /** Immediate prior action id (e.g. bet_33). */
  prior_action?: string;
};

export type DrillId = "btn_flop_cbet" | "bb_vs_cbet" | "all";

export const NAMED_DRILLS: {
  id: DrillId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "btn_flop_cbet",
    label: "BTN flop c-bet",
    blurb: "Check / bet 33% / bet 75% as BTN IP",
  },
  {
    id: "bb_vs_cbet",
    label: "BB vs c-bet",
    blurb: "Fold / call / raise facing BTN bet 33%",
  },
  {
    id: "all",
    label: "All (BTN vs BB SRP)",
    blurb: "Both decision types from this pack",
  },
];

/** Prefer pack line / line_steps; fall back from role + prior_action. */
export function formatActionLine(node: DrillNode): string {
  if (node.line && node.line.trim()) return node.line;
  if (node.line_steps && node.line_steps.length > 0) {
    return node.line_steps.join(" → ");
  }
  const street = node.st.charAt(0).toUpperCase() + node.st.slice(1);
  if (node.hp === "BB" || node.prior_action) {
    const prior = node.prior_action === "bet_33" || !node.prior_action
      ? "BTN bet 33%"
      : `BTN ${node.prior_action}`;
    return `BTN open 2.5bb → BB call · ${street} · ${prior} · Hero ${node.hp} to act`;
  }
  return `BTN open 2.5bb → BB call · ${street} · Hero ${node.hp} to act`;
}

/** Humanize texture tag for chrome. */
export function formatTexture(tx?: string): string | null {
  if (!tx) return null;
  return tx.replace(/_/g, " ");
}

export type DrillGradeLabel = "Best" | "Correct" | "Wrong";

export type DrillGrade = {
  chosenIndex: number;
  bestIndex: number;
  chosenAction: DrillAction;
  bestAction: DrillAction;
  evLossBb: number;
  label: DrillGradeLabel;
  isCorrect: boolean;
};

/** Correct = EV loss ≤ 0.03 bb OR chosen mix ≥ 0.15; Best = argmax EV (loss ≈ 0). */
export const CORRECT_EV_LOSS_BB = 0.03;
export const CORRECT_MIX_FLOOR = 0.15;

export function gradeDrillNode(
  node: DrillNode,
  chosenActionId: string,
): DrillGrade {
  const chosenIndex = node.actions.findIndex((a) => a.a === chosenActionId);
  if (chosenIndex < 0) {
    throw new Error(`Action "${chosenActionId}" not in node ${node.id}`);
  }
  const bestIndex = node.best;
  const chosenAction = node.actions[chosenIndex]!;
  const bestAction = node.actions[bestIndex]!;
  const evLossBb = Math.max(0, bestAction.ev - chosenAction.ev);
  const isBest =
    chosenIndex === bestIndex || evLossBb <= 0.01;
  const isCorrect =
    isBest ||
    evLossBb <= CORRECT_EV_LOSS_BB ||
    chosenAction.m >= CORRECT_MIX_FLOOR;
  let label: DrillGradeLabel;
  if (isBest) label = "Best";
  else if (isCorrect) label = "Correct";
  else label = "Wrong";
  return {
    chosenIndex,
    bestIndex,
    chosenAction,
    bestAction,
    evLossBb,
    label,
    isCorrect,
  };
}
