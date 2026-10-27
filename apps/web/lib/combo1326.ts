/**
 * Fixed bijection between unordered hole-card combos and uint16 indices 0..1325.
 *
 * Card id 0..51:
 *   RANKS = 2,3,4,5,6,7,8,9,T,J,Q,K,A  (0..12)
 *   SUITS = c,d,h,s                     (0..3)
 *   cardId = rankIndex * 4 + suitIndex
 *
 * Combo index for two distinct cards lo < hi (by cardId):
 *   c = hi * (hi - 1) / 2 + lo
 *
 * Decode reverses that triangular indexing. Display strings sort high-rank
 * first (then higher suit for pairs): e.g. AsKd, 7h7d.
 *
 * Pack nodes store only `c` (uint16). Decode to AhKd-style strings at render.
 */

export const RANKS_LOW_TO_HIGH = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
] as const;

export const SUITS = ["c", "d", "h", "s"] as const;

export type RankChar = (typeof RANKS_LOW_TO_HIGH)[number];
export type SuitChar = (typeof SUITS)[number];

const RANK_TO_I: Record<string, number> = Object.fromEntries(
  RANKS_LOW_TO_HIGH.map((r, i) => [r, i]),
);
const SUIT_TO_I: Record<string, number> = Object.fromEntries(
  SUITS.map((s, i) => [s, i]),
);

export const COMBO_COUNT = 1326; // C(52, 2)

export function cardIdFromString(card: string): number {
  if (card.length !== 2) {
    throw new Error(`Invalid card "${card}"`);
  }
  const rank = card[0]!;
  const suit = card[1]!.toLowerCase();
  const ri = RANK_TO_I[rank];
  const si = SUIT_TO_I[suit];
  if (ri == null || si == null) {
    throw new Error(`Invalid card "${card}"`);
  }
  return ri * 4 + si;
}

export function cardStringFromId(id: number): string {
  if (id < 0 || id > 51) throw new Error(`cardId out of range: ${id}`);
  const rank = RANKS_LOW_TO_HIGH[Math.floor(id / 4)]!;
  const suit = SUITS[id % 4]!;
  return `${rank}${suit}`;
}

/** Map two distinct card ids (order irrelevant) → combo index 0..1325. */
export function comboIndexFromCardIds(a: number, b: number): number {
  if (a === b) throw new Error("Combo requires two distinct cards");
  if (a < 0 || a > 51 || b < 0 || b > 51) {
    throw new Error(`cardId out of range: ${a},${b}`);
  }
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return (hi * (hi - 1)) / 2 + lo;
}

/** Decode combo index → [lo, hi] card ids with lo < hi. */
export function cardIdsFromComboIndex(c: number): [number, number] {
  if (!Number.isInteger(c) || c < 0 || c >= COMBO_COUNT) {
    throw new Error(`combo index out of range: ${c}`);
  }
  // hi = ceil((1 + sqrt(1 + 8c)) / 2) - 1, then lo = c - C(hi,2)
  let hi = Math.ceil((1 + Math.sqrt(1 + 8 * c)) / 2);
  // Adjust for float edge cases
  while ((hi * (hi - 1)) / 2 > c) hi -= 1;
  while (((hi + 1) * hi) / 2 <= c) hi += 1;
  const lo = c - (hi * (hi - 1)) / 2;
  return [lo, hi];
}

/**
 * Parse a 4-char hole string ("7c6c", "AsKd") → combo index.
 * Card order in the string does not matter for the index.
 */
export function comboIndexFromHand(hand: string): number {
  const cleaned = hand.trim().replace(/\s+/g, "");
  if (cleaned.length !== 4) {
    throw new Error(`Expected 4-char hand, got "${hand}"`);
  }
  const a = cardIdFromString(cleaned.slice(0, 2));
  const b = cardIdFromString(cleaned.slice(2, 4));
  return comboIndexFromCardIds(a, b);
}

/**
 * Decode combo index to display string: high rank first; pairs use higher
 * suit first (s > h > d > c by suit index, so larger cardId first within pair).
 */
export function handFromComboIndex(c: number): string {
  const [lo, hi] = cardIdsFromComboIndex(c);
  // cardId is rank-major: higher id ⇒ higher rank, or same rank + higher suit.
  // Display: high card first (AsKd, 7h7d).
  return cardStringFromId(hi) + cardStringFromId(lo);
}

/** True if either hole card appears on the board (card strings like "Ah"). */
export function isComboBlockedByBoard(
  c: number,
  board: readonly string[],
): boolean {
  if (board.length === 0) return false;
  const boardIds = new Set(board.map((card) => cardIdFromString(card)));
  const [a, b] = cardIdsFromComboIndex(c);
  return boardIds.has(a) || boardIds.has(b);
}

/** Parse concatenated board "AhKd2s" → ["Ah","Kd","2s"]. */
export function boardStringToCards(board: string): string[] {
  const cleaned = board.trim().replace(/\s+/g, "");
  if (!cleaned || cleaned.length % 2 !== 0) {
    throw new Error(`Invalid board string "${board}"`);
  }
  const cards: string[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const card = cleaned[i]! + cleaned[i + 1]!.toLowerCase();
    cardIdFromString(card); // validate
    cards.push(card);
  }
  return cards;
}
