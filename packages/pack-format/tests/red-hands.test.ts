import { describe, expect, it } from "vitest";
import { WeeklockPackSchema } from "../src/weeklock-schema.js";
import { isFoldOnlyChartValue, redHandsFromWeeklock } from "../src/red-hands.js";
import rawPack from "../../../packs/weeklock/weeklock.json";

type Chart = Record<string, string | string[]>;
const rfi = (chart: Chart) => ({ tag: "RFI" as const, chart });
const other = (tag: "vs3bet" | "vs4bet" | "cbet", chart: Chart) => ({ tag, chart });

describe("isFoldOnlyChartValue", () => {
  it("accepts the string 'fold'", () => expect(isFoldOnlyChartValue("fold")).toBe(true));
  it("accepts arrays of only fold", () => {
    expect(isFoldOnlyChartValue(["fold"])).toBe(true);
    expect(isFoldOnlyChartValue(["fold", "fold"])).toBe(true);
  });
  it("rejects non-fold strings, mixed arrays, and empty arrays", () => {
    expect(isFoldOnlyChartValue("raise")).toBe(false);
    expect(isFoldOnlyChartValue(["raise", "fold"])).toBe(false);
    expect(isFoldOnlyChartValue(["raise"])).toBe(false);
    expect(isFoldOnlyChartValue([])).toBe(false);
  });
});

describe("redHandsFromWeeklock", () => {
  it("includes RFI fold-only classes for string and array forms", () => {
    const red = redHandsFromWeeklock({
      scenarios: [rfi({ "72o": "fold", "83o": ["fold"], "94o": ["fold", "fold"], AA: "raise" })],
    });
    expect(red).toEqual(["72o", "83o", "94o"]);
  });

  it("excludes classes with any non-fold action", () => {
    const red = redHandsFromWeeklock({
      scenarios: [rfi({ A5s: ["raise", "fold"], KJo: "raise", "72o": "fold" })],
    });
    expect(red).toEqual(["72o"]);
  });

  it("ignores non-RFI scenarios", () => {
    const red = redHandsFromWeeklock({
      scenarios: [
        rfi({ "72o": "fold" }),
        other("vs3bet", { JJ: "fold", QQ: "fold" }),
        other("vs4bet", { TT: ["fold"] }),
        other("cbet", { "32o": "fold" }),
      ],
    });
    expect(red).toEqual(["72o"]);
  });

  it("unions across RFI scenarios", () => {
    const red = redHandsFromWeeklock({
      scenarios: [rfi({ "72o": "fold", AA: "raise" }), rfi({ "83o": "fold", "72o": "fold" })],
    });
    expect(red).toEqual(["72o", "83o"]);
  });

  it("unions blocked_hand_classes and de-duplicates", () => {
    const red = redHandsFromWeeklock({
      scenarios: [rfi({ "72o": "fold" })],
      blocked_hand_classes: ["72o", "AKo"],
    });
    expect(red).toEqual(["72o", "AKo"]);
  });

  it("returns only blocked classes when there are no RFI scenarios", () => {
    const red = redHandsFromWeeklock({
      scenarios: [other("vs3bet", { JJ: "fold" })],
      blocked_hand_classes: ["KQo"],
    });
    expect(red).toEqual(["KQo"]);
  });

  it("returns a sorted list", () => {
    const red = redHandsFromWeeklock({
      scenarios: [rfi({ "83o": "fold", "32o": "fold", "72o": "fold" })],
    });
    expect(red).toEqual([...red].sort());
  });

  it("works against the committed weeklock pack", () => {
    const pack = WeeklockPackSchema.parse(rawPack);
    const red = redHandsFromWeeklock(pack);
    expect(red).toEqual([...new Set(red)].sort());
    expect(red).toContain("72o");
    expect(red).not.toContain("AA");
    const rfiScenarios = pack.scenarios.filter((s) => s.tag === "RFI");
    expect(rfiScenarios.length).toBeGreaterThan(0);
    for (const hand of red) {
      expect(
        rfiScenarios.some((s) => {
          const v = s.chart[hand];
          return v !== undefined && isFoldOnlyChartValue(v);
        }),
      ).toBe(true);
    }
  });
});
