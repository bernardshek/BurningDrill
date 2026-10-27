import { describe, expect, it } from "vitest";
import { dealHandClass, dealWeeklock, handClassFromCombo } from "../weeklock";
import type { WeeklockPack } from "@poker-trainer/pack-format";
import pack from "../../../../packs/weeklock/weeklock.json";
const coachPack = pack as WeeklockPack;
describe("Week lock hand sampling", () => {
  it("deals real combos matching all classes", () => {
    for (const klass of ["AA", "AKs", "AKo", "72o"]) expect(handClassFromCombo(dealHandClass(klass, () => 0))).toBe(klass);
  });
  it("deals only from deal_from when present", () => {
    const scenario = { ...coachPack.scenarios.find(s => s.id === "vs4bet_jam")!, deal_from: ["KK"] };
    const result = dealWeeklock({ ...coachPack, scenarios: [scenario] }, () => 0);
    expect(result.handClass).toBe("KK");
  });
  it("uses focus_rate for RFI focus sampling and otherwise samples all classes", () => {
    const scenario = { ...coachPack.scenarios.find(s => s.id === "rfi_utg")!, focus: ["87s"], focus_rate: 0.4, deal_from: undefined };
    const values = [0, 0.2, 0, 0];
    expect(dealWeeklock({ ...coachPack, scenarios: [scenario] }, () => values.shift() ?? 0).handClass).toBe("87s");
    const normalValues = [0, 0.9, 0, 0];
    expect(dealWeeklock({ ...coachPack, scenarios: [scenario] }, () => normalValues.shift() ?? 0).handClass).toBe("AA");
  });
});
