import { PlayingCard, type PlayingCardSize } from "@/components/PlayingCard";
import type { ParsedCard } from "@/lib/parse-cards";

type CardRowProps = {
  cards: ParsedCard[];
  size?: PlayingCardSize;
  overlap?: boolean;
  label?: string;
  className?: string;
};

export function CardRow({
  cards,
  size = "medium",
  overlap = false,
  label,
  className = "",
}: CardRowProps) {
  if (!cards.length) return null;

  return (
    <div className={`card-row-wrap ${className}`.trim()}>
      {label ? <span className="card-row-label">{label}</span> : null}
      <div
        className={`card-row${overlap ? " card-row--overlap" : ""}`}
        role="group"
        aria-label={label}
      >
        {cards.map((card, i) => (
          <PlayingCard key={`${card.rank}${card.suit}-${i}`} card={card} size={size} />
        ))}
      </div>
    </div>
  );
}
