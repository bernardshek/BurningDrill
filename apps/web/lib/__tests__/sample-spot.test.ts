import { describe, expect, it } from "vitest";
import type { DrillNode } from "../drill-node";
import { comboIndexFromHand, handFromComboIndex } from "../combo1326";
import { handClassFromCombo } from "../weeklock";
import {
  filterNodesByDrillId,
  isCloseNode,
  isDumpNode,
  isEligibleNode,
  sampleSpot,
} from "../sample-spot";

function makeNode(partial: Partial<DrillNode> & Pick<DrillNode, "id">): DrillNode {
  const actions = partial.actions ?? [
    { a: "check", m: 0.5, ev: 0.1 },
    { a: "bet_33", m: 0.5, ev: 0.12 },
  ];
  const best =
    partial.best ??
    actions.reduce((bi, a, i, arr) => (a.ev > arr[bi]!.ev ? i : bi), 0);
  const bestEv = actions[best]!.ev;
  let second = -Infinity;
  for (let i = 0; i < actions.length; i++) {
    if (i === best) continue;
    second = Math.max(second, actions[i]!.ev);
  }
  const dev = partial.dev ?? Math.max(0, bestEv - (second === -Infinity ? bestEv : second));
  return {
    id: partial.id,
    st: partial.st ?? "flop",
    hp: partial.hp ?? "BB",
    vp: partial.vp ?? "BTN",
    ip: partial.ip ?? false,
    bd: partial.bd ?? ["Ah", "Kd", "2s"],
    pot: partial.pot ?? 6.5,
    eff: partial.eff ?? 100,
    nf: partial.nf ?? 1,
    wu: partial.wu ?? false,
    best,
    dev,
    actions,
    kids: partial.kids ?? actions.map(() => null),
    combos: partial.combos ?? [{ c: 100, w: 1 }], // 100 is far from Ah/Kd/2s in our encoding
    ...(partial.drill_id ? { drill_id: partial.drill_id } : {}),
    ...(partial.line ? { line: partial.line } : {}),
    ...(partial.line_steps ? { line_steps: partial.line_steps } : {}),
    ...(partial.prior_action ? { prior_action: partial.prior_action } : {}),
    ...(partial.tx ? { tx: partial.tx } : {}),
  };
}

describe("sampleSpot filters", () => {
  it("rejects non-wu dumps from eligibility", () => {
    const dump = makeNode({
      id: "dump",
      actions: [
        { a: "fold", m: 0.96, ev: 0 },
        { a: "call", m: 0.04, ev: -0.4 },
      ],
      wu: false,
    });
    expect(isDumpNode(dump)).toBe(true);
    expect(isEligibleNode(dump)).toBe(false);
    const wuDump = { ...dump, wu: true };
    expect(isEligibleNode(wuDump)).toBe(true);
  });

  it("classifies close nodes by dev / mix band", () => {
    const closeDev = makeNode({
      id: "c1",
      actions: [
        { a: "check", m: 0.8, ev: 0.1 },
        { a: "bet_33", m: 0.2, ev: 0.05 },
      ],
      // best=check, dev=0.05
    });
    expect(closeDev.dev).toBeCloseTo(0.05);
    expect(isCloseNode(closeDev)).toBe(true);

    const closeMix = makeNode({
      id: "c2",
      actions: [
        { a: "check", m: 0.4, ev: 0.1 },
        { a: "bet_33", m: 0.6, ev: 0.2 },
      ],
      // best=bet_33 m=0.6, dev=0.1 → mix band + gap≤0.12
    });
    expect(isCloseNode(closeMix)).toBe(true);

    const far = makeNode({
      id: "far",
      actions: [
        { a: "check", m: 0.9, ev: 1.0 },
        { a: "bet_33", m: 0.1, ev: 0.1 },
      ],
    });
    expect(isCloseNode(far)).toBe(false);
  });

  it("falls back when close pool is empty", () => {
    const farOnly = [
      makeNode({
        id: "far1",
        nf: 1,
        actions: [
          { a: "check", m: 0.9, ev: 1.0 },
          { a: "bet_33", m: 0.1, ev: 0.1 },
        ],
      }),
      makeNode({
        id: "far2",
        nf: 1,
        actions: [
          { a: "check", m: 0.85, ev: 0.8 },
          { a: "bet_33", m: 0.15, ev: 0.2 },
        ],
      }),
    ];
    const result = sampleSpot(farOnly, {
      closeOnly: true,
      random: () => 0.0,
    });
    expect(result).not.toBeNull();
    expect(result!.telemetry.closeRequested).toBe(true);
    expect(result!.telemetry.fallbackFromClose).toBe(true);
    expect(result!.telemetry.closeSatisfied).toBe(false);
    expect(["far1", "far2"]).toContain(result!.node.id);
  });

  it("samples close nodes when they exist and closeOnly is on", () => {
    const nodes = [
      makeNode({
        id: "far",
        nf: 10,
        actions: [
          { a: "check", m: 0.9, ev: 1.0 },
          { a: "bet_33", m: 0.1, ev: 0.1 },
        ],
      }),
      makeNode({
        id: "close",
        nf: 1,
        actions: [
          { a: "check", m: 0.45, ev: 0.1 },
          { a: "bet_33", m: 0.55, ev: 0.14 },
        ],
      }),
    ];
    // Deterministic: always pick first weight mass in close pool (only "close")
    const result = sampleSpot(nodes, {
      closeOnly: true,
      random: () => 0.01,
    });
    expect(result).not.toBeNull();
    expect(result!.node.id).toBe("close");
    expect(result!.telemetry.closeSatisfied).toBe(true);
    expect(result!.telemetry.fallbackFromClose).toBe(false);
  });

  it("falls back through all-dumps pack via wu / decision pool", () => {
    const dumps = [
      makeNode({
        id: "d1",
        wu: false,
        actions: [
          { a: "fold", m: 0.97, ev: 0 },
          { a: "call", m: 0.03, ev: -0.5 },
        ],
      }),
      makeNode({
        id: "d2",
        wu: false,
        actions: [
          { a: "fold", m: 0.96, ev: 0 },
          { a: "call", m: 0.04, ev: -0.3 },
        ],
      }),
    ];
    // No eligible (non-wu dumps) → uses decision fallback
    const result = sampleSpot(dumps, { closeOnly: false, random: () => 0.5 });
    expect(result).not.toBeNull();
    expect(["d1", "d2"]).toContain(result!.node.id);
  });

  it("samples ∝ node_frequency", () => {
    const nodes = [
      makeNode({ id: "rare", nf: 0.0001, combos: [{ c: 100, w: 1 }] }),
      makeNode({ id: "common", nf: 1000, combos: [{ c: 101, w: 1 }] }),
    ];
    let common = 0;
    for (let i = 0; i < 50; i++) {
      const r = sampleSpot(nodes, {
        closeOnly: false,
        pClose: 0, // force default path
        pWarmup: 0,
        random: () => (i + 0.5) / 50,
      });
      if (r?.node.id === "common") common++;
    }
    expect(common).toBeGreaterThan(40);
  });
});

describe("filterNodesByDrillId", () => {
  it("returns all when drillId is all/empty", () => {
    const a = makeNode({ id: "a", drill_id: "btn_flop_cbet" });
    const b = makeNode({ id: "b", drill_id: "bb_vs_cbet" });
    expect(filterNodesByDrillId([a, b], "all")).toHaveLength(2);
    expect(filterNodesByDrillId([a, b], undefined)).toHaveLength(2);
  });

  it("filters by drill_id and falls back when none match", () => {
    const a = makeNode({ id: "a", drill_id: "btn_flop_cbet" });
    const b = makeNode({ id: "b", drill_id: "bb_vs_cbet" });
    expect(filterNodesByDrillId([a, b], "bb_vs_cbet").map((n) => n.id)).toEqual([
      "b",
    ]);
    expect(filterNodesByDrillId([a, b], "missing").map((n) => n.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("sampleSpot red hands", () => {
  const board = ["2c", "3d", "4h"] as const;
  const redCombo = comboIndexFromHand("7c2d");
  const liveCombo = comboIndexFromHand("AcAd");
  const redClass = handClassFromCombo(handFromComboIndex(redCombo));
  const liveClass = handClassFromCombo(handFromComboIndex(liveCombo));

  function scripted(values: number[]) {
    let i = 0;
    return () => values[i++] ?? 0;
  }

  it("leaves sampling unchanged when redHandClasses is omitted or empty", () => {
    const nodes = [
      makeNode({
        id: "n",
        bd: [...board],
        combos: [{ c: redCombo, w: 1 }],
      }),
    ];
    const base = sampleSpot(nodes, { pClose: 0, pWarmup: 0, random: () => 0 });
    const empty = sampleSpot(nodes, {
      pClose: 0,
      pWarmup: 0,
      random: () => 0,
      redHandClasses: [],
    });
    expect(base?.heroHand).toBe(empty?.heroHand);
    expect(handClassFromCombo(base!.heroHand)).toBe(redClass);
    expect(base?.telemetry.rejectReasons.red_hand).toBeUndefined();
  });

  it("resamples when the hero class is red and keeps a non-red hand", () => {
    const nodes = [
      makeNode({
        id: "mixed",
        bd: [...board],
        nf: 1,
        combos: [
          { c: redCombo, w: 1 },
          { c: liveCombo, w: 1 },
        ],
      }),
    ];
    const hit = sampleSpot(nodes, {
      pClose: 0,
      pWarmup: 0,
      redHandClasses: [redClass],
      random: scripted([0, 0, 0, 0, 0, 0.99]),
    });
    expect(hit).not.toBeNull();
    expect(handClassFromCombo(hit!.heroHand)).toBe(liveClass);
    expect(redClass).not.toBe(liveClass);
    expect(hit!.telemetry.rejectReasons.red_hand).toBe(1);
  });

  it("fails closed when every capped deal is red", () => {
    const nodes = [
      makeNode({
        id: "only-red",
        bd: [...board],
        combos: [{ c: redCombo, w: 1 }],
      }),
    ];
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0;
    };
    const hit = sampleSpot(nodes, {
      pClose: 0,
      pWarmup: 0,
      redHandClasses: [redClass],
      maxRedResamples: 2,
      random,
    });
    expect(hit).toBeNull();
    expect(calls).toBe(9);
  });

  it("rejects a red hand on the close-only path without changing the default", () => {
    const nodes = [
      makeNode({
        id: "close-red",
        bd: [...board],
        combos: [{ c: redCombo, w: 1 }],
      }),
    ];
    const bare = sampleSpot(nodes, { closeOnly: true, random: () => 0 });
    expect(bare).not.toBeNull();
    expect(handClassFromCombo(bare!.heroHand)).toBe(redClass);
    const rejected = sampleSpot(nodes, {
      closeOnly: true,
      random: () => 0,
      redHandClasses: [redClass],
      maxRedResamples: 0,
    });
    expect(rejected).toBeNull();
  });
});
