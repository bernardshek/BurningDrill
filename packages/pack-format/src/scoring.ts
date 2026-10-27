import type { Spot, SpotAction } from "./schema.js";

export type ScoreResult = {
  chosen: SpotAction;
  best: SpotAction;
  isCorrect: boolean;
  /** Absolute EV loss in bb vs best action (0 when correct / same EV). */
  evLossBb: number;
  label: "Best" | "Correct" | "Wrong";
};

/** Highest-frequency action wins. Ties broken by higher EV, then first in list. */
export function getBestAction(spot: Spot): SpotAction {
  if (spot.actions.length === 0) {
    throw new Error(`Spot ${spot.id} has no actions`);
  }
  return spot.actions.reduce((best, cur) => {
    if (cur.frequency > best.frequency) return cur;
    if (cur.frequency === best.frequency && cur.evBb > best.evBb) return cur;
    return best;
  });
}

/**
 * Score a chosen action string against the spot.
 * Correct = matches the highest-frequency action's `action` field.
 * EV loss = best.evBb - chosen.evBb (floored at 0 for display of regret).
 */
export function scoreAction(spot: Spot, chosenAction: string): ScoreResult {
  const chosen = spot.actions.find((a) => a.action === chosenAction);
  if (!chosen) {
    throw new Error(`Action "${chosenAction}" not in spot ${spot.id}`);
  }
  const best = getBestAction(spot);
  const isCorrect = chosen.action === best.action;
  const evLossBb = Math.max(0, best.evBb - chosen.evBb);
  let label: ScoreResult["label"];
  if (isCorrect && evLossBb === 0) label = "Best";
  else if (isCorrect) label = "Correct";
  else label = "Wrong";
  return { chosen, best, isCorrect, evLossBb, label };
}
