/**
 * Adapt legacy toy Spot JSON → compact DrillNode (Coach short-key schema).
 * Does not invent boards/actions outside the spot; kids are null for toy.
 */

import type { Spot } from "@poker-trainer/pack-format";
import {
  boardStringToCards,
  comboIndexFromHand,
  isComboBlockedByBoard,
} from "./combo1326";
import type {
  DrillAction,
  DrillNode,
  DrillPosition,
  DrillStreet,
} from "./drill-node";

/** Dump thresholds — matches sampler / research tunables. */
export const DUMP_MIX = 0.95;
export const DUMP_GAP_BB = 0.15;

function isIp(hero: string, street: string): boolean {
  if (street === "preflop") {
    // Rough: BTN/CO/HJ/UTG open as IP vs BB call; SB is OOP vs BB.
    return hero !== "BB" && hero !== "SB";
  }
  // Postflop: BB and SB are OOP in SRP; others IP.
  return hero !== "BB" && hero !== "SB";
}

function bestAndDev(actions: DrillAction[]): { best: number; dev: number } {
  if (actions.length === 0) return { best: 0, dev: 0 };
  let best = 0;
  for (let i = 1; i < actions.length; i++) {
    if (actions[i]!.ev > actions[best]!.ev) best = i;
  }
  let second = -Infinity;
  for (let i = 0; i < actions.length; i++) {
    if (i === best) continue;
    second = Math.max(second, actions[i]!.ev);
  }
  const dev =
    second === -Infinity ? 0 : Math.max(0, actions[best]!.ev - second);
  return { best, dev };
}

/**
 * Convert one toy Spot into a DrillNode.
 * @param nodeFrequency reach weight (use 1/N across pack for uniform prior)
 */
export function adaptToySpot(
  spot: Spot,
  nodeFrequency: number,
): DrillNode {
  const bd = spot.board ? boardStringToCards(spot.board) : [];
  const actions: DrillAction[] = spot.actions.map((a) => {
    const out: DrillAction = {
      a: a.action,
      m: a.frequency,
      ev: a.evBb,
    };
    if (a.sizeBb != null) out.sizeBb = a.sizeBb;
    return out;
  });
  const { best, dev } = bestAndDev(actions);
  const bestMix = actions[best]?.m ?? 0;
  const isDump = bestMix >= DUMP_MIX && dev >= DUMP_GAP_BB;

  const comboIdx = comboIndexFromHand(spot.hero_hand);
  if (isComboBlockedByBoard(comboIdx, bd)) {
    throw new Error(
      `Toy spot ${spot.id}: hero_hand ${spot.hero_hand} blocked by board`,
    );
  }

  return {
    id: spot.id,
    st: spot.street as DrillStreet,
    hp: spot.hero_position as DrillPosition,
    vp: spot.villain_position as DrillPosition,
    ip: isIp(spot.hero_position, spot.street),
    bd,
    pot: spot.potBb ?? 0,
    eff: spot.stackBb ?? 100,
    nf: nodeFrequency,
    wu: isDump, // trivial dumps stay reachable via warmup bucket
    best,
    dev,
    actions,
    kids: actions.map(() => null),
    combos: [{ c: comboIdx, w: 1 }],
  };
}

/** Adapt a full toy pack: uniform nf = 1/N. */
export function adaptToySpots(spots: Spot[]): DrillNode[] {
  const n = spots.length;
  if (n === 0) return [];
  const nf = 1 / n;
  return spots.map((s) => adaptToySpot(s, nf));
}
