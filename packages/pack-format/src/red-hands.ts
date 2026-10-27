import type { WeeklockPack } from "./weeklock-schema.js";

type ScenarioLike = Pick<WeeklockPack["scenarios"][number], "tag" | "chart">;

/** Minimal shape needed, so callers/tests need not build a full pack. */
export type RedHandsSource = {
  scenarios: readonly ScenarioLike[];
  blocked_hand_classes?: readonly string[];
};

/** True for "fold" or a non-empty array containing only "fold". */
export function isFoldOnlyChartValue(value: string | readonly string[]): boolean {
  if (typeof value === "string") return value === "fold";
  return value.length >= 1 && value.every((action) => action === "fold");
}

/**
 * Hand classes that are fold-only in ANY RFI scenario's chart, unioned with
 * `blocked_hand_classes`. Returns a unique list in default string sort order.
 */
export function redHandsFromWeeklock(pack: RedHandsSource): string[] {
  const red = new Set<string>();
  for (const scenario of pack.scenarios) {
    if (scenario.tag !== "RFI") continue;
    for (const [hand, value] of Object.entries(scenario.chart)) {
      if (isFoldOnlyChartValue(value)) red.add(hand);
    }
  }
  for (const hand of pack.blocked_hand_classes ?? []) red.add(hand);
  return [...red].sort();
}
