/**
 * Frequency-weighted random spot sampler (v1).
 * Never invents boards/actions outside the DrillPack nodes passed in.
 *
 * Tunables (research/random-spot-sampler-v1.md):
 *   dump: mix≥0.95 && gap≥0.15 (skipped unless wu)
 *   close: dev≤0.08 OR (best mix ∈ [0.25,0.75] && dev≤0.12)
 *   p_close: toggle ON → 1.0; OFF → 0.25 (try close, ≤20 resamples, fall back)
 *   warmup: ~7% chance to sample from wu-eligible pool when non-empty
 */

import { isComboBlockedByBoard, handFromComboIndex } from "./combo1326";
import type { DrillNode } from "./drill-node";
import { DUMP_GAP_BB, DUMP_MIX } from "./adapt-toy-spot";

export const CLOSE_DEV_MAX = 0.08;
export const CLOSE_MIX_DEV_MAX = 0.12;
export const CLOSE_MIX_LO = 0.25;
export const CLOSE_MIX_HI = 0.75;
export const P_CLOSE_DEFAULT = 0.25;
export const P_WARMUP = 0.07;
export const MAX_CLOSE_RESAMPLES = 20;
export const W_MIN_RELATIVE = 0.0005;

export type RejectReason =
  | "low_weight"
  | "blocked"
  | "trivial_fold"
  | "trivial_value"
  | "low_node_mass"
  | "not_close"
  | "no_decision"
  | "dump"
  | "resample_exhausted"
  | "empty_pool";

export type SampleTelemetry = {
  rejectReasons: Partial<Record<RejectReason, number>>;
  closeRequested: boolean;
  closeSatisfied: boolean;
  resamples: number;
  usedWarmup: boolean;
  fallbackFromClose: boolean;
};

export type SampleResult = {
  node: DrillNode;
  /** Decoded display hand, e.g. "7c6c". */
  heroHand: string;
  comboIndex: number;
  telemetry: SampleTelemetry;
};

export type SampleOptions = {
  /** Close-decisions-only toggle. When true, p_close = 1.0. */
  closeOnly?: boolean;
  /** Soft close probability when closeOnly is false (default 0.25). */
  pClose?: number;
  /** Warmup mix probability (default 0.07). */
  pWarmup?: number;
  /** Injected RNG in [0, 1). */
  random?: () => number;
  /** Filter to nodes with this drill_id (ignore when empty / "all"). */
  drillId?: string;
};

/** Narrow a node list to a named mini-drill. */
export function filterNodesByDrillId(
  nodes: DrillNode[],
  drillId?: string | null,
): DrillNode[] {
  if (!drillId || drillId === "all") return nodes;
  const matched = nodes.filter((n) => n.drill_id === drillId);
  return matched.length > 0 ? matched : nodes;
}

function emptyTelemetry(closeRequested: boolean): SampleTelemetry {
  return {
    rejectReasons: {},
    closeRequested,
    closeSatisfied: false,
    resamples: 0,
    usedWarmup: false,
    fallbackFromClose: false,
  };
}

function bump(t: SampleTelemetry, reason: RejectReason): void {
  t.rejectReasons[reason] = (t.rejectReasons[reason] ?? 0) + 1;
}

export function isDumpNode(node: DrillNode): boolean {
  const best = node.actions[node.best];
  if (!best) return false;
  return best.m >= DUMP_MIX && node.dev >= DUMP_GAP_BB;
}

export function isDecisionNode(node: DrillNode): boolean {
  if (node.nf <= 0) return false;
  const withEv = node.actions.filter((a) => Number.isFinite(a.ev));
  return withEv.length >= 2;
}

export function isCloseNode(node: DrillNode): boolean {
  if (node.dev <= CLOSE_DEV_MAX) return true;
  const best = node.actions[node.best];
  if (!best) return false;
  return (
    best.m >= CLOSE_MIX_LO &&
    best.m <= CLOSE_MIX_HI &&
    node.dev <= CLOSE_MIX_DEV_MAX
  );
}

/** Eligible for default freq-weighted pool (dumps only if wu). */
export function isEligibleNode(node: DrillNode): boolean {
  if (!isDecisionNode(node)) return false;
  if (isDumpNode(node) && !node.wu) return false;
  return true;
}

function weightedPick<T>(
  items: T[],
  weight: (item: T) => number,
  random: () => number,
): T | null {
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (w > 0) total += w;
  }
  if (total <= 0) return null;
  let r = random() * total;
  for (const item of items) {
    const w = weight(item);
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function eligibleCombos(
  node: DrillNode,
  telemetry: SampleTelemetry,
): { c: number; w: number }[] {
  const totalW = node.combos.reduce((s, x) => s + (x.w > 0 ? x.w : 0), 0);
  const out: { c: number; w: number }[] = [];
  for (const combo of node.combos) {
    if (combo.w <= 0) {
      bump(telemetry, "low_weight");
      continue;
    }
    if (totalW > 0 && combo.w / totalW < W_MIN_RELATIVE) {
      bump(telemetry, "low_weight");
      continue;
    }
    if (isComboBlockedByBoard(combo.c, node.bd)) {
      bump(telemetry, "blocked");
      continue;
    }
    out.push(combo);
  }
  return out;
}

function sampleCombo(
  node: DrillNode,
  random: () => number,
  telemetry: SampleTelemetry,
): { c: number; w: number } | null {
  const combos = eligibleCombos(node, telemetry);
  if (combos.length === 0) return null;
  return weightedPick(combos, (x) => x.w, random);
}

function pickNode(pool: DrillNode[], random: () => number): DrillNode | null {
  return weightedPick(pool, (n) => n.nf, random);
}

function dealFrom(
  pool: DrillNode[],
  random: () => number,
  telemetry: SampleTelemetry,
): SampleResult | null {
  const node = pickNode(pool, random);
  if (!node) return null;
  const combo = sampleCombo(node, random, telemetry);
  if (!combo) return null;
  return {
    node,
    heroHand: handFromComboIndex(combo.c),
    comboIndex: combo.c,
    telemetry,
  };
}

/**
 * Sample a node + hero combo from a DrillPack node list.
 * Returns null only when no decision node can deal a non-blocked combo.
 */
export function sampleSpot(
  nodes: DrillNode[],
  options: SampleOptions = {},
): SampleResult | null {
  const random = options.random ?? Math.random;
  const closeOnly = options.closeOnly === true;
  const pClose = closeOnly ? 1.0 : (options.pClose ?? P_CLOSE_DEFAULT);
  const pWarmup = options.pWarmup ?? P_WARMUP;
  const scoped = filterNodesByDrillId(nodes, options.drillId);

  const wantClose = closeOnly || random() < pClose;
  const telemetry = emptyTelemetry(wantClose);

  const eligible = scoped.filter(isEligibleNode);
  const decisions = scoped.filter(isDecisionNode);
  const basePool = eligible.length > 0 ? eligible : decisions;

  if (basePool.length === 0) {
    bump(telemetry, "no_decision");
    bump(telemetry, "empty_pool");
    return null;
  }
  if (eligible.length === 0) {
    for (const _ of decisions) bump(telemetry, "dump");
  }

  const closePool = basePool.filter(isCloseNode);
  const wuPool = basePool.filter((n) => n.wu);

  if (wantClose) {
    for (let i = 0; i < MAX_CLOSE_RESAMPLES; i++) {
      if (closePool.length === 0) break;
      telemetry.resamples = i;
      const hit = dealFrom(closePool, random, telemetry);
      if (hit) {
        telemetry.closeSatisfied = true;
        return hit;
      }
      bump(telemetry, "not_close");
    }
    bump(telemetry, "resample_exhausted");
    telemetry.fallbackFromClose = true;
    const fallback = dealFrom(basePool, random, telemetry);
    return fallback;
  }

  // Default freq-weighted (+ optional warmup bucket).
  let pool = basePool;
  if (wuPool.length > 0 && random() < pWarmup) {
    pool = wuPool;
    telemetry.usedWarmup = true;
  }
  return dealFrom(pool, random, telemetry) ?? dealFrom(basePool, random, telemetry);
}
