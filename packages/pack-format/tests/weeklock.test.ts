import { describe, expect, it } from "vitest";
import { WeeklockPackSchema } from "../src/weeklock-schema.js";
import pack from "../../../packs/weeklock/weeklock.json";
describe("Week lock schema", () => {
  it("accepts the coach pack and its targeting rules", () => expect(WeeklockPackSchema.safeParse(pack).success).toBe(true));
  it("rejects unknown action ids and invalid hand classes", () => {
    const base = structuredClone(pack) as typeof pack;
    base.scenarios[0]!.chart.AA = "shove";
    expect(WeeklockPackSchema.safeParse(base).success).toBe(false);
    const bad = structuredClone(pack) as typeof pack;
    (bad.scenarios[0]!.chart as Record<string, unknown>)["A1o"] = "fold";
    expect(WeeklockPackSchema.safeParse(bad).success).toBe(false);
  });
  it("requires default and chart values to be declared actions", () => {
    const base = structuredClone(pack) as typeof pack; base.scenarios[0]!.default = "jam";
    expect(WeeklockPackSchema.safeParse(base).success).toBe(false);
  });
  it("validates deal_from and focus hand classes and focus_rate", () => {
    const bad = structuredClone(pack) as typeof pack;
    (bad.scenarios[0] as unknown as { deal_from: string[] }).deal_from = ["A1o"];
    expect(WeeklockPackSchema.safeParse(bad).success).toBe(false);
    const badRate = structuredClone(pack) as typeof pack;
    (badRate.scenarios[0] as unknown as { focus_rate: number }).focus_rate = 1.1;
    expect(WeeklockPackSchema.safeParse(badRate).success).toBe(false);
  });
  it("rejects chart arrays containing undeclared actions", () => {
    const bad = structuredClone(pack) as typeof pack;
    bad.scenarios[0]!.chart.AA = ["raise", "jam"];
    expect(WeeklockPackSchema.safeParse(bad).success).toBe(false);
  });
});

describe("Week lock allowed_drill_ids / blocked_hand_classes", () => {
  it("commits exactly the two allowed drills and no blocked hands for 2026-w43", () => {
    const parsed = WeeklockPackSchema.parse(pack);
    expect(parsed.version).toBe("2026-w43");
    expect(parsed.allowed_drill_ids).toEqual(["btn_flop_cbet", "bb_vs_cbet"]);
    expect(parsed.blocked_hand_classes).toEqual([]);
  });
  it("does not allow future pf_* or flop_btn_bb_srp_* ids", () => {
    const parsed = WeeklockPackSchema.parse(pack);
    for (const id of parsed.allowed_drill_ids) {
      expect(id.startsWith("pf_")).toBe(false);
      expect(id.startsWith("flop_btn_bb_srp_")).toBe(false);
    }
  });
  it("defaults both fields to [] when absent", () => {
    const legacy = structuredClone(pack) as Record<string, unknown>;
    delete legacy.allowed_drill_ids;
    delete legacy.blocked_hand_classes;
    const parsed = WeeklockPackSchema.parse(legacy);
    expect(parsed.allowed_drill_ids).toEqual([]);
    expect(parsed.blocked_hand_classes).toEqual([]);
  });
  it("rejects non-array allowed_drill_ids", () => {
    const bad = structuredClone(pack) as Record<string, unknown>;
    bad.allowed_drill_ids = "btn_flop_cbet";
    expect(WeeklockPackSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects invalid hand classes in blocked_hand_classes", () => {
    const bad = structuredClone(pack) as Record<string, unknown>;
    bad.blocked_hand_classes = ["A1o"];
    expect(WeeklockPackSchema.safeParse(bad).success).toBe(false);
    const ok = structuredClone(pack) as Record<string, unknown>;
    ok.blocked_hand_classes = ["72o"];
    expect(WeeklockPackSchema.safeParse(ok).success).toBe(true);
  });
});
