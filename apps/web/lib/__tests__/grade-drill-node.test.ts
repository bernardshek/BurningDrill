import { describe, expect, it } from "vitest";
import {
  BEST_EV_TIE_BB,
  CORRECT_EV_LOSS_BB,
  CORRECT_MIX_FLOOR,
  gradeDrillNode,
  type DrillNode,
} from "../drill-node";

function node(
  actions: DrillNode["actions"],
  /** Stale index. The grade must follow argmax EV, not this field. */
  best = 0,
): DrillNode {
  return {
    id: "n",
    st: "flop",
    hp: "BTN",
    vp: "BB",
    ip: true,
    bd: ["Ah", "Kd", "2c"],
    pot: 6.5,
    eff: 100,
    nf: 1,
    wu: false,
    best,
    dev: 0,
    actions,
    kids: actions.map(() => null),
    combos: [{ c: 1, w: 1 }],
  };
}

describe("gradeDrillNode", () => {
  it("marks argmax EV as Best even when another action has a higher mix", () => {
    const graded = gradeDrillNode(
      node(
        [
          { a: "check", m: 0.8, ev: 1 },
          { a: "bet", m: 0.2, ev: 1.4 },
        ],
        0,
      ),
      "bet",
    );
    expect(graded.label).toBe("Best");
    expect(graded.bestIndex).toBe(1);
    expect(graded.bestAction.a).toBe("bet");
    expect(graded.evLossBb).toBe(0);
    expect(graded.isCorrect).toBe(true);
  });

  it("does not grade the highest-frequency action as Best or Correct when it misses both bars", () => {
    const graded = gradeDrillNode(
      node([
        { a: "popular", m: 0.149, ev: 0 },
        { a: "b", m: 0.149, ev: 0.2 },
        { a: "c", m: 0.149, ev: 0.2 },
        { a: "d", m: 0.149, ev: 0.2 },
        { a: "e", m: 0.149, ev: 0.2 },
        { a: "f", m: 0.149, ev: 0.2 },
        { a: "best", m: 0.106, ev: 1 },
      ]),
      "popular",
    );
    expect(graded.label).toBe("Wrong");
    expect(graded.isCorrect).toBe(false);
    expect(graded.bestAction.a).toBe("best");
    expect(graded.evLossBb).toBeCloseTo(1, 5);
  });

  it("treats EV loss of 0.03 as Correct and a loss just above it as Wrong when mix is under 0.15", () => {
    const spot = node([
      { a: "best", m: 0.9, ev: 1 },
      { a: "edge", m: 0.05, ev: 1 - CORRECT_EV_LOSS_BB },
      { a: "over", m: 0.05, ev: 1 - CORRECT_EV_LOSS_BB - 0.001 },
    ]);
    const edge = gradeDrillNode(spot, "edge");
    expect(edge.evLossBb).toBeCloseTo(CORRECT_EV_LOSS_BB, 10);
    expect(edge.evLossBb).toBeGreaterThan(BEST_EV_TIE_BB);
    expect(edge.label).toBe("Correct");
    expect(edge.isCorrect).toBe(true);

    const over = gradeDrillNode(spot, "over");
    expect(over.evLossBb).toBeGreaterThan(CORRECT_EV_LOSS_BB);
    expect(over.label).toBe("Wrong");
    expect(over.isCorrect).toBe(false);
  });

  it("treats mix of 0.15 as Correct even when EV loss is large, and mix just under 0.15 as Wrong", () => {
    const atFloor = gradeDrillNode(
      node([
        { a: "best", m: 0.85, ev: 2 },
        { a: "mix", m: CORRECT_MIX_FLOOR, ev: 0 },
      ]),
      "mix",
    );
    expect(atFloor.evLossBb).toBeGreaterThan(CORRECT_EV_LOSS_BB);
    expect(atFloor.label).toBe("Correct");
    expect(atFloor.isCorrect).toBe(true);

    const under = gradeDrillNode(
      node([
        { a: "best", m: 0.86, ev: 2 },
        { a: "miss", m: CORRECT_MIX_FLOOR - 0.001, ev: 0 },
      ]),
      "miss",
    );
    expect(under.label).toBe("Wrong");
    expect(under.isCorrect).toBe(false);
  });

  it("treats a line within 0.01bb of argmax EV as Best, and 0.02bb as Correct", () => {
    const spot = node([
      { a: "best", m: 0.5, ev: 1 },
      { a: "near", m: 0.05, ev: 1 - BEST_EV_TIE_BB },
      { a: "ok", m: 0.45, ev: 1 - 0.02 },
    ]);
    const near = gradeDrillNode(spot, "near");
    expect(near.label).toBe("Best");
    expect(near.isCorrect).toBe(true);
    expect(near.bestIndex).toBe(0);

    const ok = gradeDrillNode(spot, "ok");
    expect(ok.label).toBe("Correct");
    expect(ok.isCorrect).toBe(true);
    expect(ok.evLossBb).toBeGreaterThan(BEST_EV_TIE_BB);
    expect(ok.evLossBb).toBeLessThanOrEqual(CORRECT_EV_LOSS_BB);
  });

  it("rejects an action id that is not on the node", () => {
    expect(() => gradeDrillNode(node([{ a: "check", m: 1, ev: 0 }]), "bet")).toThrow(
      /not in node/,
    );
  });
});
