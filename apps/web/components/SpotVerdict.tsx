import type { DrillGrade, DrillNode } from "@/lib/drill-node";
import { buildSpotVerdict } from "@/lib/spot-verdict";

type Props = {
  node: DrillNode;
  grade: DrillGrade;
  nextLabel: string;
  onNext: () => void;
  onEnd: () => void;
  endDisabled: boolean;
  browseOpen: boolean;
  onBrowse: () => void;
  onBrowseNext: () => void;
};

/** Compact Spot result. Four facts, no full action matrix, no praise. */
export function SpotVerdict({
  node,
  grade,
  nextLabel,
  onNext,
  onEnd,
  endDisabled,
  browseOpen,
  onBrowse,
  onBrowseNext,
}: Props) {
  const verdict = buildSpotVerdict(node, grade);
  const tone =
    verdict.kind === "out" ? "out" : verdict.kind === "in-mix" ? "mix" : "quiet";
  const quietName =
    verdict.kind === "best"
      ? "Best"
      : verdict.kind === "ev-close"
        ? "EV close"
        : "Out of mix";

  return (
    <div
      className={`result-panel verdict verdict--${tone}`}
      aria-label="Spot verdict"
      data-verdict={verdict.kind}
    >
      {verdict.status ? (
        <span className="badge mix">{verdict.status}</span>
      ) : (
        <span className="sr-only">{quietName}</span>
      )}
      <p className="verdict__line">{verdict.bestVsChosen}</p>
      <p className="verdict__ev">{verdict.evLossText}</p>
      <p className="verdict__why">{verdict.why}</p>
      <p className="verdict__freq meta">{verdict.freqLine}</p>
      <div className="row verdict__actions">
        <button type="button" onClick={onNext}>
          {nextLabel}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onEnd}
          disabled={endDisabled}
        >
          End session
        </button>
        <button type="button" className="secondary" onClick={onBrowse}>
          Browse pack
        </button>
        {browseOpen ? (
          <button type="button" className="secondary" onClick={onBrowseNext}>
            Next node (debug)
          </button>
        ) : null}
      </div>
    </div>
  );
}
