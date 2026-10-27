import { describe, expect, it } from "vitest";
import type { Spot } from "@poker-trainer/pack-format";
import { adaptToySpot, adaptToySpots } from "../adapt-toy-spot";
import { handFromComboIndex } from "../combo1326";

const toy: Spot = {
  id: "btn_bb_flop_ahkd2s_7c6c",
  street: "flop",
  board: "AhKd2s",
  hero_position: "BB",
  villain_position: "BTN",
  hero_hand: "7c6c",
  potBb: 6.5,
  stackBb: 97,
  actions: [
    { action: "check", frequency: 0.78, evBb: 0.1 },
    { action: "bet_33", sizeBb: 2.2, frequency: 0.18, evBb: -0.05 },
    { action: "bet_75", sizeBb: 4.9, frequency: 0.04, evBb: -0.55 },
  ],
};

describe("adaptToySpot", () => {
  it("maps toy spot into compact DrillNode short keys", () => {
    const node = adaptToySpot(toy, 1 / 12);
    expect(node.id).toBe(toy.id);
    expect(node.st).toBe("flop");
    expect(node.hp).toBe("BB");
    expect(node.vp).toBe("BTN");
    expect(node.ip).toBe(false);
    expect(node.bd).toEqual(["Ah", "Kd", "2s"]);
    expect(node.pot).toBe(6.5);
    expect(node.eff).toBe(97);
    expect(node.nf).toBeCloseTo(1 / 12);
    expect(node.actions.map((a) => a.a)).toEqual([
      "check",
      "bet_33",
      "bet_75",
    ]);
    expect(node.actions[0]).toMatchObject({ m: 0.78, ev: 0.1 });
    expect(node.best).toBe(0); // check has highest EV
    expect(node.dev).toBeCloseTo(0.15); // 0.10 - (-0.05)
    expect(node.kids).toEqual([null, null, null]);
    expect(node.combos).toHaveLength(1);
    expect(handFromComboIndex(node.combos[0]!.c).slice(0, 2)).toMatch(/7[cdhs]/);
    expect(node.wu).toBe(false); // mix 0.78 < 0.95
  });

  it("sets uniform nf across a pack", () => {
    const nodes = adaptToySpots([toy, { ...toy, id: "other", hero_hand: "AsQs" }]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.nf).toBeCloseTo(0.5);
    expect(nodes[1]!.nf).toBeCloseTo(0.5);
  });

  it("marks dump nodes as warmup-eligible", () => {
    const dump: Spot = {
      ...toy,
      id: "dump",
      actions: [
        { action: "fold", frequency: 0.97, evBb: 0 },
        { action: "call", frequency: 0.03, evBb: -0.5 },
      ],
    };
    const node = adaptToySpot(dump, 0.1);
    expect(node.wu).toBe(true);
    expect(node.best).toBe(0);
    expect(node.dev).toBeCloseTo(0.5);
  });
});
