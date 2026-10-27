import { describe, expect, it } from "vitest";
import { gradeDrillNode, type DrillNode } from "../drill-node";
import { buildSpotVerdict, spotPickClass } from "../spot-verdict";

function node(
  actions: DrillNode["actions"],
  extra: Partial<DrillNode> = {},
): DrillNode {
  return {
    id: "n_btn_bb_f_ahkd2c_btn",
    st: "flop",
    hp: "BTN",
    vp: "BB",
    ip: true,
    tx: "dry_a_high",
    bd: ["Ah", "Kd", "2c"],
    pot: 6.5,
    eff: 100,
    nf: 1,
    wu: false,
    best: 0,
    dev: 0,
    actions,
    kids: actions.map(() => null),
    combos: [{ c: 1, w: 1 }],
    ...extra,
  };
}

describe("buildSpotVerdict", () => {
  it("keeps a Correct in-mix line off the Wrong treatment and shows mix-ok", () => {
    const spot = node([
      { a: "check", m: 0.62, ev: 1.2 },
      { a: "bet_33", m: 0.38, ev: 1.18 },
      { a: "bet_75", m: 0.01, ev: 0.1, sizeBb: 4.9 },
    ]);
    const grade = gradeDrillNode(spot, "bet_33");
    expect(grade.label).toBe("Correct");
    expect(grade.isCorrect).toBe(true);

    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("in-mix");
    expect(verdict.quiet).toBe(false);
    expect(verdict.status).toBe("in mix (−0.02)");
    expect(verdict.status).not.toMatch(/Wrong|Correct|Best/);
    expect(verdict.evLossText).toBe("0 / mix-ok");
    expect(verdict.bestVsChosen).toBe("Best Check · Chosen Bet 33%");
    expect(verdict.freqLine).toBe("bet 33 38% / check 62%");
    expect(verdict.freqLine).not.toContain("75");
    expect(verdict.freqLine).not.toContain("1%");
    expect(verdict.why).toBe(
      "AhKd2c · BTN vs BB flop · dry a high → check: range-capped, dry board — bet inflates with worse.",
    );
    expect(spotPickClass(grade)).toBe("picked-mix");
  });

  it("stays quiet on Best, including 0 / mix-ok when that line is in the mix", () => {
    const spot = node([
      { a: "check", m: 0.62, ev: 1.2 },
      { a: "bet_33", m: 0.38, ev: 1.0 },
    ]);
    const grade = gradeDrillNode(spot, "check");
    expect(grade.label).toBe("Best");

    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("best");
    expect(verdict.quiet).toBe(true);
    expect(verdict.status).toBe("");
    expect(verdict.evLossText).toBe("0 / mix-ok");
    expect(verdict.bestVsChosen).toBe("Best Check · Chosen Check");
    expect(verdict.freqLine).toBe("check 62%");
    expect(verdict.why).not.toMatch(/nice|great|well played|wrong/i);
    expect(spotPickClass(grade)).toBe("picked-best");
  });

  it("shows a clear EV loss when the pick is out of mix", () => {
    const spot = node([
      { a: "check", m: 0.9, ev: 1 },
      { a: "fold", m: 0.05, ev: 0 },
      { a: "bet_33", m: 0.05, ev: 0.2 },
    ]);
    const grade = gradeDrillNode(spot, "fold");
    expect(grade.label).toBe("Wrong");

    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("out");
    expect(verdict.status).toBe("");
    expect(verdict.evLossText).toBe("EV loss −1.00 bb");
    expect(verdict.freqLine).toBe("fold 5% / check 90%");
    expect(verdict.freqLine).not.toContain("bet");
    expect(verdict.why).toContain("→ check:");
    expect(JSON.stringify(verdict)).not.toMatch(/Wrong|✗|red-x/i);
    expect(spotPickClass(grade)).toBe("picked-out");
  });

  it("treats a tiny EV loss under the mix floor as quiet EV-close, not in-mix", () => {
    const spot = node([
      { a: "check", m: 0.94, ev: 1 },
      { a: "bet_33", m: 0.06, ev: 0.98 },
    ]);
    const grade = gradeDrillNode(spot, "bet_33");
    expect(grade.label).toBe("Correct");
    expect(grade.evLossBb).toBeCloseTo(0.02, 10);

    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("ev-close");
    expect(verdict.quiet).toBe(true);
    expect(verdict.status).toBe("");
    expect(verdict.evLossText).toBe("EV loss −0.02 bb");
    expect(spotPickClass(grade)).toBe("picked-best");
  });

  it("labels a large-EV mix line as in mix instead of Wrong", () => {
    const spot = node([
      { a: "bet_33", m: 0.85, ev: 2 },
      { a: "check", m: 0.15, ev: 0 },
    ]);
    const grade = gradeDrillNode(spot, "check");
    expect(grade.label).toBe("Correct");
    expect(grade.evLossBb).toBeCloseTo(2, 5);

    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("in-mix");
    expect(verdict.status).toBe("in mix (−2.00)");
    expect(verdict.evLossText).toBe("0 / mix-ok");
    expect(verdict.why).toContain(
      "→ bet small: nut advantage + denial vs float-heavy BB.",
    );
  });

  it("uses the fold, check-call, and non-dry check templates", () => {
    const foldSpot = node(
      [
        { a: "fold", m: 0.7, ev: 0 },
        { a: "call", m: 0.3, ev: -0.4 },
      ],
      { hp: "BB", vp: "BTN", ip: false, tx: "dry_mid" },
    );
    expect(buildSpotVerdict(foldSpot, gradeDrillNode(foldSpot, "fold")).why).toBe(
      "AhKd2c · BB vs BTN flop · dry mid → fold: no equity realization vs PFR cbet; pot odds don’t save trash.",
    );

    const callSpot = node(
      [
        { a: "call", m: 0.6, ev: 0.4 },
        { a: "fold", m: 0.3, ev: 0 },
        { a: "raise_2.5x", m: 0.1, ev: -0.2 },
      ],
      { hp: "BB", vp: "BTN", ip: false, tx: "connected_mid" },
    );
    expect(buildSpotVerdict(callSpot, gradeDrillNode(callSpot, "call")).why).toBe(
      "AhKd2c · BB vs BTN flop · connected mid → check-call: pot control; raise only with strong+ bluffs that block call.",
    );

    const wetCheck = node(
      [
        { a: "check", m: 0.5, ev: 0.2 },
        { a: "bet_33", m: 0.5, ev: 0.1 },
      ],
      { tx: "connected_mid" },
    );
    const why = buildSpotVerdict(wetCheck, gradeDrillNode(wetCheck, "check")).why;
    expect(why).toBe(
      "AhKd2c · BTN vs BB flop · connected mid → check: range-capped — bet inflates with worse.",
    );
    expect(why).not.toContain("dry board");
  });

  it("keys a larger bet and a raise off their own templates", () => {
    const big = node(
      [
        { a: "bet_75", m: 0.4, ev: 0.5, sizeBb: 4.9 },
        { a: "check", m: 0.6, ev: 0.1 },
      ],
      { tx: "mono_broadway" },
    );
    expect(buildSpotVerdict(big, gradeDrillNode(big, "bet_75")).why).toContain(
      "→ bet 75: size up past a small denial bet when the value range wants more.",
    );

    const raise = node(
      [
        { a: "raise_2.5x", m: 0.2, ev: 0.3, sizeBb: 7.5 },
        { a: "call", m: 0.5, ev: 0.1 },
        { a: "fold", m: 0.3, ev: 0 },
      ],
      { hp: "BB", vp: "BTN", ip: false },
    );
    expect(buildSpotVerdict(raise, gradeDrillNode(raise, "raise_2.5x")).why).toContain(
      "→ raise: strong+ bluffs that block call.",
    );
  });

  it("reports 0.00 bb when Best itself is below the mix floor", () => {
    const spot = node([
      { a: "bet_75", m: 0.05, ev: 1, sizeBb: 4.9 },
      { a: "check", m: 0.95, ev: 0 },
    ]);
    const grade = gradeDrillNode(spot, "bet_75");
    expect(grade.label).toBe("Best");
    const verdict = buildSpotVerdict(spot, grade);
    expect(verdict.kind).toBe("best");
    expect(verdict.evLossText).toBe("EV loss 0.00 bb");
    expect(verdict.freqLine).toBe("bet 75 5%");
  });
});
