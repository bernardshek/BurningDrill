import type { WeeklockPack } from "./weeklock-schema.js";

/**
 * drill_ids on toy-6max-expand. Mirrors NAMED_DRILLS in apps/web/lib/drill-node.ts
 * (excluding the "all" aggregate, which is not a drill_id). Keep in sync.
 */
export const TOY_6MAX_EXPAND_DRILL_IDS = [
  "btn_flop_cbet",
  "bb_vs_cbet",
  "bb_flop_donk",
  "btn_vs_donk",
] as const;

export type WeeklockDrillCheck =
  | { success: true }
  | { success: false; unknown: string[] };

/** Fail closed: any allowed_drill_ids entry not in knownIds is reported (sorted, unique). */
export function validateWeeklockAgainstDrills(
  pack: Pick<WeeklockPack, "allowed_drill_ids">,
  knownIds: readonly string[],
): WeeklockDrillCheck {
  const known = new Set(knownIds);
  const unknown = [...new Set(pack.allowed_drill_ids.filter((id) => !known.has(id)))].sort();
  return unknown.length === 0 ? { success: true } : { success: false, unknown };
}

/** Throwing variant of validateWeeklockAgainstDrills. */
export function assertAllowedDrillIds(
  pack: Pick<WeeklockPack, "allowed_drill_ids">,
  knownIds: readonly string[],
): void {
  const result = validateWeeklockAgainstDrills(pack, knownIds);
  if (!result.success) {
    throw new Error(`Unknown allowed_drill_ids: ${result.unknown.join(", ")}`);
  }
}
