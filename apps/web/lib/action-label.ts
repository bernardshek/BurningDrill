/** Human-readable labels for toy action ids. */
export function formatActionLabel(action: string, sizeBb?: number): string {
  const map: Record<string, string> = {
    check: "Check",
    fold: "Fold",
    call: "Call",
    bet_33: "Bet 33%",
    bet_50: "Bet 50%",
    bet_66: "Bet 66%",
    bet_100: "Bet pot",
    raise_pot: "Raise pot",
  };
  if (map[action]) {
    return sizeBb != null && !map[action].includes("Bet") && !map[action].includes("Raise")
      ? `${map[action]} (${sizeBb}bb)`
      : map[action];
  }
  if (sizeBb != null) return `${action} (${sizeBb}bb)`;
  return action;
}
