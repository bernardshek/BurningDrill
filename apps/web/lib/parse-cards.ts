export type Suit = "c" | "d" | "h" | "s";
export type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";

export type ParsedCard = {
  rank: Rank;
  suit: Suit;
};

const RANKS = new Set<string>(["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]);
const SUITS = new Set<string>(["c", "d", "h", "s"]);

/**
 * Parse concatenated card strings like `AsQs`, `AhKd7c`, `AhKd7c2s`
 * into `{ rank, suit }[]`. Returns [] on empty/invalid input.
 */
export function parseCards(input: string | null | undefined): ParsedCard[] {
  if (!input || typeof input !== "string") return [];
  const cleaned = input.trim().replace(/\s+/g, "");
  if (!cleaned) return [];
  if (cleaned.length % 2 !== 0) return [];

  const cards: ParsedCard[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const rank = cleaned[i]!;
    const suit = cleaned[i + 1]!.toLowerCase();
    if (!RANKS.has(rank) || !SUITS.has(suit)) return [];
    cards.push({ rank: rank as Rank, suit: suit as Suit });
  }
  return cards;
}
