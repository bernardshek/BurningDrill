import {
  assertAllowedDrillIds,
  TOY_6MAX_EXPAND_DRILL_IDS,
  type WeeklockPack,
} from "@poker-trainer/pack-format";
import { NAMED_DRILLS } from "./drill-node";

export const EMPTY_WEEKLOCK_ALLOWLIST_MESSAGE =
  "Week lock has no allowed drills. Spot has nothing to deal.";

export const EMPTY_WEEKLOCK_DRILL_POOL_MESSAGE =
  "No spots for this week lock drill.";

export const RED_HANDS_EXHAUSTED_MESSAGE =
  "Could not deal a hand outside the week lock red set.";

type NamedDrill = (typeof NAMED_DRILLS)[number];

export type SpotShelf =
  | {
      status: "open";
      drills: NamedDrill[];
      drillId: string;
      allowedIds: null;
      error: null;
    }
  | {
      status: "loading";
      drills: [];
      drillId: string;
      allowedIds: null;
      error: null;
    }
  | {
      status: "ready";
      drills: NamedDrill[];
      drillId: string;
      allowedIds: string[];
      error: null;
    }
  | {
      status: "blocked";
      drills: [];
      drillId: null;
      allowedIds: [];
      error: string;
    };

/**
 * Spot drill shelf.
 * Week lock off → full NAMED_DRILLS (including donk drills and `all`).
 * Week lock on → only `allowed_drill_ids`, in allowlist order. `all` is never
 * a spot drill. Empty allowlist and unknown ids fail closed (no full-shelf fallthrough).
 */
export function spotDrillShelf(
  weeklockOn: boolean,
  pack: Pick<WeeklockPack, "allowed_drill_ids"> | null,
  currentDrillId: string,
): SpotShelf {
  if (!weeklockOn) {
    return {
      status: "open",
      drills: NAMED_DRILLS,
      drillId: currentDrillId,
      allowedIds: null,
      error: null,
    };
  }
  if (!pack) {
    return {
      status: "loading",
      drills: [],
      drillId: currentDrillId,
      allowedIds: null,
      error: null,
    };
  }
  try {
    assertAllowedDrillIds(pack, TOY_6MAX_EXPAND_DRILL_IDS);
  } catch (e) {
    return {
      status: "blocked",
      drills: [],
      drillId: null,
      allowedIds: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const allowedIds = [...new Set(pack.allowed_drill_ids)];
  if (allowedIds.length === 0) {
    return {
      status: "blocked",
      drills: [],
      drillId: null,
      allowedIds: [],
      error: EMPTY_WEEKLOCK_ALLOWLIST_MESSAGE,
    };
  }
  const drills = allowedIds
    .map((id) => NAMED_DRILLS.find((d) => d.id === id))
    .filter((d): d is NamedDrill => d != null && d.id !== "all");
  if (drills.length === 0) {
    return {
      status: "blocked",
      drills: [],
      drillId: null,
      allowedIds: [],
      error: EMPTY_WEEKLOCK_ALLOWLIST_MESSAGE,
    };
  }
  const ids = drills.map((d) => d.id);
  const drillId = ids.some((id) => id === currentDrillId)
    ? currentDrillId
    : ids[0]!;
  return { status: "ready", drills, drillId, allowedIds: ids, error: null };
}
