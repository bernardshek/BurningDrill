import { formatActionLabel } from "./action-label";
import {
  CORRECT_MIX_FLOOR,
  formatTexture,
  type DrillAction,
  type DrillGrade,
  type DrillNode,
} from "./drill-node";

/**
 * Spot post-answer copy. Display only — `gradeDrillNode` stays the grader.
 * Templates are fixed strings keyed by the best action and texture.
 * Frequencies come from the chosen and best actions' pack `m` only.
 */

const MIX_SLACK = 1e-9;
const MINUS = "\u2212";

const CHECK_DRY = "range-capped, dry board — bet inflates with worse";
const CHECK_OTHER = "range-capped — bet inflates with worse";
const BET_SMALL = "nut advantage + denial vs float-heavy BB";
const CHECK_CALL =
  "pot control; raise only with strong+ bluffs that block call";
const FOLD =
  "no equity realization vs PFR cbet; pot odds don\u2019t save trash";
const RAISE = "strong+ bluffs that block call";
const BET_LARGE =
  "size up past a small denial bet when the value range wants more";

export type SpotVerdictKind = "best" | "in-mix" | "ev-close" | "out";

export type SpotVerdict = {
  kind: SpotVerdictKind;
  /** Best and EV-close Correct stay quiet. No praise copy. */
  quiet: boolean;
  /** Visible status. Empty for quiet and out-of-mix (the EV line carries those). */
  status: string;
  bestVsChosen: string;
  evLossText: string;
  why: string;
  freqLine: string;
};

export type SpotPickClass = "picked-best" | "picked-mix" | "picked-out";

export function chosenIsInMix(mix: number): boolean {
  return mix + MIX_SLACK >= CORRECT_MIX_FLOOR;
}

/** Button tone for the picked action. In-mix is not the red miss treatment. */
export function spotPickClass(grade: DrillGrade): SpotPickClass {
  if (grade.label === "Best") return "picked-best";
  if (chosenIsInMix(grade.chosenAction.m)) return "picked-mix";
  if (grade.label === "Correct") return "picked-best";
  return "picked-out";
}

export function buildSpotVerdict(node: DrillNode, grade: DrillGrade): SpotVerdict {
  const inMix = chosenIsInMix(grade.chosenAction.m);
  const kind = verdictKind(grade, inMix);
  const quiet = kind === "best" || kind === "ev-close";
  return {
    kind,
    quiet,
    status:
      kind === "in-mix"
        ? `in mix (${MINUS}${grade.evLossBb.toFixed(2)})`
        : "",
    bestVsChosen: bestVsChosenLine(grade),
    evLossText: evLossText(kind, inMix, grade.evLossBb),
    why: whyLine(node, grade.bestAction),
    freqLine: freqLine(grade.chosenAction, grade.bestAction),
  };
}

function verdictKind(grade: DrillGrade, inMix: boolean): SpotVerdictKind {
  if (grade.label === "Best") return "best";
  if (inMix) return "in-mix";
  if (grade.label === "Correct") return "ev-close";
  return "out";
}

function evLossText(
  kind: SpotVerdictKind,
  inMix: boolean,
  evLossBb: number,
): string {
  if (kind === "in-mix" || (kind === "best" && inMix)) return "0 / mix-ok";
  const magnitude = Math.abs(evLossBb).toFixed(2);
  if (evLossBb <= MIX_SLACK) return "EV loss 0.00 bb";
  return `EV loss ${MINUS}${magnitude} bb`;
}

function bestVsChosenLine(grade: DrillGrade): string {
  const best = formatActionLabel(grade.bestAction.a, grade.bestAction.sizeBb);
  const chosen = formatActionLabel(
    grade.chosenAction.a,
    grade.chosenAction.sizeBb,
  );
  return `Best ${best} · Chosen ${chosen}`;
}

function freqLine(chosen: DrillAction, best: DrillAction): string {
  if (chosen.a === best.a) return `${freqWord(chosen)} ${pct(chosen.m)}`;
  return `${freqWord(chosen)} ${pct(chosen.m)} / ${freqWord(best)} ${pct(best.m)}`;
}

function pct(mix: number): string {
  return `${Math.round(mix * 100)}%`;
}

function freqWord(action: DrillAction): string {
  if (action.a === "check" || action.a === "fold" || action.a === "call") {
    return action.a;
  }
  if (action.a === "bet_100") return "bet pot";
  if (action.a.startsWith("bet_")) return `bet ${action.a.slice(4)}`;
  if (action.a.startsWith("raise")) return "raise";
  return action.a.replace(/_/g, " ");
}

function whyLine(node: DrillNode, best: DrillAction): string {
  return `${nodeClause(node)} → ${whyAction(best)}: ${geometry(best, node.tx)}.`;
}

function nodeClause(
  node: Pick<DrillNode, "bd" | "hp" | "vp" | "st" | "tx">,
): string {
  const parts = [
    node.bd.join(""),
    `${node.hp} vs ${node.vp} ${node.st}`,
    formatTexture(node.tx),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

type ActionFamily =
  | "check"
  | "fold"
  | "call"
  | "raise"
  | "bet_small"
  | "bet_large"
  | "other";

function actionFamily(actionId: string): ActionFamily {
  if (actionId === "check") return "check";
  if (actionId === "fold") return "fold";
  if (actionId === "call") return "call";
  if (actionId.startsWith("raise")) return "raise";
  if (actionId === "bet_33" || actionId === "bet_50") return "bet_small";
  if (actionId.startsWith("bet")) return "bet_large";
  return "other";
}

function whyAction(action: DrillAction): string {
  const family = actionFamily(action.a);
  if (family === "bet_small") return "bet small";
  if (family === "bet_large") {
    if (action.a === "bet_100") return "bet pot";
    return `bet ${action.a.slice(4)}`;
  }
  if (family === "call") return "check-call";
  if (family === "raise") return "raise";
  if (family === "fold") return "fold";
  if (family === "check") return "check";
  return action.a.replace(/_/g, " ");
}

function geometry(action: DrillAction, tx?: string): string {
  switch (actionFamily(action.a)) {
    case "check":
      return isDry(tx) ? CHECK_DRY : CHECK_OTHER;
    case "bet_small":
      return BET_SMALL;
    case "call":
      return CHECK_CALL;
    case "fold":
      return FOLD;
    case "raise":
      return RAISE;
    case "bet_large":
      return BET_LARGE;
    default:
      return formatTexture(tx) ?? "pack line";
  }
}

function isDry(tx?: string): boolean {
  return Boolean(tx?.split("_").includes("dry"));
}
