import type { ParsedCard, Rank, Suit } from "@/lib/parse-cards";

const SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

const RANK_NAME: Record<Rank, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "Ten",
  "9": "Nine",
  "8": "Eight",
  "7": "Seven",
  "6": "Six",
  "5": "Five",
  "4": "Four",
  "3": "Three",
  "2": "Two",
};

const SUIT_NAME: Record<Suit, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

export type PlayingCardSize = "small" | "medium";

type PlayingCardProps = {
  card: ParsedCard;
  size?: PlayingCardSize;
};

export function PlayingCard({ card, size = "medium" }: PlayingCardProps) {
  const { rank, suit } = card;
  const colorClass = suit === "h" || suit === "d" ? "suit-red" : "suit-black";
  const displayRank = rank === "T" ? "10" : rank;
  const label = `${RANK_NAME[rank]} of ${SUIT_NAME[suit]}`;

  return (
    <div
      className={`playing-card playing-card--${size} ${colorClass}`}
      aria-label={label}
      role="img"
    >
      <span className="playing-card__corner playing-card__corner--tl">
        <span className="playing-card__rank">{displayRank}</span>
        <span className="playing-card__suit-sm" aria-hidden="true">
          {SUIT_SYMBOL[suit]}
        </span>
      </span>
      <span className="playing-card__center" aria-hidden="true">
        {SUIT_SYMBOL[suit]}
      </span>
      <span className="playing-card__corner playing-card__corner--br" aria-hidden="true">
        <span className="playing-card__rank">{displayRank}</span>
        <span className="playing-card__suit-sm">{SUIT_SYMBOL[suit]}</span>
      </span>
    </div>
  );
}
