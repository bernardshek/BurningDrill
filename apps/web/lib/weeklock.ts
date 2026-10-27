import type { WeeklockPack } from "@poker-trainer/pack-format";
import { cardIdFromString, comboIndexFromCardIds, handFromComboIndex, RANKS_LOW_TO_HIGH, SUITS } from "./combo1326";

export type WeeklockScenario = WeeklockPack["scenarios"][number];
const highRanks = [...RANKS_LOW_TO_HIGH].reverse();
export function handClassFromCombo(hand: string): string {
  const a = hand.slice(0, 2), b = hand.slice(2, 4);
  if (a[0] === b[0]) return `${a[0]}${b[0]}`;
  const rankA = a[0]! as typeof RANKS_LOW_TO_HIGH[number], rankB = b[0]! as typeof RANKS_LOW_TO_HIGH[number];
  const hi = highRanks.indexOf(rankA) < highRanks.indexOf(rankB) ? a[0]! : b[0]!;
  const lo = hi === a[0] ? b[0]! : a[0]!;
  return `${hi}${lo}${a[1] === b[1] ? "s" : "o"}`;
}
export function sampleWeighted<T>(items: readonly T[], weight: (x: T) => number, random = Math.random): T {
  const total = items.reduce((n, x) => n + weight(x), 0);
  if (total <= 0) throw new Error("Cannot sample empty weighted list");
  let value = random() * total;
  for (const item of items) { value -= weight(item); if (value < 0) return item; }
  return items[items.length - 1]!;
}
export function dealHandClass(handClass: string, random = Math.random): string {
  const first = handClass[0]!, second = handClass[1]!;
  const combos: string[] = [];
  if (first === second) {
    for (let i = 0; i < SUITS.length; i++) for (let j = i + 1; j < SUITS.length; j++) combos.push(`${first}${SUITS[i]}${second}${SUITS[j]}`);
  } else {
    for (const suitA of SUITS) for (const suitB of SUITS) if (handClass.endsWith("s") ? suitA === suitB : suitA !== suitB) combos.push(`${first}${suitA}${second}${suitB}`);
  }
  // Exercise the shared 1326 mapping, and return its canonical card ordering.
  const selected = sampleWeighted(combos, () => 1, random);
  return handFromComboIndex(comboIndexFromCardIds(cardIdFromString(selected.slice(0, 2)), cardIdFromString(selected.slice(2, 4))));
}
export function dealWeeklock(pack: WeeklockPack, random = Math.random) {
  const scenario = sampleWeighted(pack.scenarios, s => s.weight, random);
  const classes = [...new Set([...highRanks.flatMap((a, i) => highRanks.slice(i).flatMap((b) => a === b ? [`${a}${b}`] : [`${a}${b}s`, `${a}${b}o`]))])];
  const comboWeight = (h: string) => h[0] === h[1] ? 6 : h.endsWith("s") ? 4 : 12;
  let candidates = classes;
  if (scenario.deal_from) candidates = scenario.deal_from;
  else if (scenario.focus && scenario.focus_rate !== undefined && random() < scenario.focus_rate) candidates = scenario.focus;
  const handClass = sampleWeighted(candidates, comboWeight, random);
  return { scenario, handClass, hand: dealHandClass(handClass, random) };
}
export function correctActions(scenario: WeeklockScenario, handClass: string): string[] {
  const value = scenario.chart[handClass] ?? scenario.default;
  return Array.isArray(value) ? value : [value];
}
