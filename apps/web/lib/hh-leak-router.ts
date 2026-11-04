import { NAMED_DRILLS } from "./drill-node";

/** A compact summary of a hand-history leak. Raw hand histories are not accepted. */
export type HhLeakHints = {
  streets?: string[];
  positions?: string[];
  actions?: string[];
  tags?: string[];
  notes?: string;
};

export type HhLeakRoute = {
  drill_ids: string[];
  reasons: Record<string, string>;
};

// These destinations are named drills already shipped in the coach shelf / packs.
const TAG_ROUTES: Record<string, { drillId: string; reason: string }> = {
  btn_flop_cbet: { drillId: "btn_flop_cbet", reason: "BTN flop continuation-bet decisions." },
  flop_cbet: { drillId: "btn_flop_cbet", reason: "Flop continuation-bet decisions." },
  missed_cbet: { drillId: "btn_flop_cbet", reason: "Flop continuation-bet decisions." },
  bb_vs_cbet: { drillId: "bb_vs_cbet", reason: "BB response when facing a flop continuation bet." },
  overfold_vs_cbet: { drillId: "bb_vs_cbet", reason: "BB response when facing a flop continuation bet." },
  flop_donk: { drillId: "bb_flop_donk", reason: "BB flop lead (donk) decisions." },
  donk_bet: { drillId: "bb_flop_donk", reason: "BB flop lead (donk) decisions." },
  btn_vs_donk: { drillId: "btn_vs_donk", reason: "BTN response when BB leads the flop." },
  vs_donk: { drillId: "btn_vs_donk", reason: "Response when facing a flop lead." },
  delayed_barrel: { drillId: "btn_delayed_barrel", reason: "BTN turn barrel after the flop checks through." },
  turn_barrel: { drillId: "btn_delayed_barrel", reason: "BTN turn barrel after the flop checks through." },
  vs3bet_oop: { drillId: "vs3bet_oop", reason: "Preflop response to a 3-bet while out of position." },
  vs3bet_ip: { drillId: "vs3bet_ip", reason: "Preflop response to a 3-bet while in position." },
  vs4bet_jam: { drillId: "vs4bet_jam", reason: "Preflop response to a 4-bet jam." },
  vs4bet_22: { drillId: "vs4bet_22", reason: "Preflop response to a 4-bet to 22bb." },
};

const SHIPPED_DRILL_IDS = new Set<string>(NAMED_DRILLS.map(({ id }) => id).filter((id) => id !== "all"));

/** Route known leak hints to existing drills; unknown hints safely return no match. */
export function routeHhLeak(hints: HhLeakHints): HhLeakRoute {
  const reasons: Record<string, string> = {};
  const candidates = [...(hints.tags ?? []), hints.notes ?? ""]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const matches = Object.entries(TAG_ROUTES).filter(([tag]) =>
      candidate === tag || candidate.includes(`_${tag}_`) || candidate.startsWith(`${tag}_`) || candidate.endsWith(`_${tag}`),
    );
    for (const [, route] of matches) {
      if (SHIPPED_DRILL_IDS.has(route.drillId)) reasons[route.drillId] = route.reason;
    }
  }

  // Lightweight structured hint: the BB facing a flop bet maps to its existing drill.
  const positions = (hints.positions ?? []).map((value) => value.toLowerCase());
  const streets = (hints.streets ?? []).map((value) => value.toLowerCase());
  const actions = (hints.actions ?? []).map((value) => value.toLowerCase());
  if (
    positions.includes("bb") && streets.includes("flop") &&
    actions.some((action) => action.includes("faced") && action.includes("bet")) &&
    SHIPPED_DRILL_IDS.has("bb_vs_cbet")
  ) {
    reasons.bb_vs_cbet ??= "BB faced a flop bet; practice the existing BB vs c-bet drill.";
  }

  return { drill_ids: Object.keys(reasons), reasons };
}
