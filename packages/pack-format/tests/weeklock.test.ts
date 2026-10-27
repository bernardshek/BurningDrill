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
