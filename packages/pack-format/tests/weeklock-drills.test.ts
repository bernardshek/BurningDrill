import { describe, expect, it } from "vitest";
import { WeeklockPackSchema } from "../src/weeklock-schema.js";
import {
  TOY_6MAX_EXPAND_DRILL_IDS,
  assertAllowedDrillIds,
  validateWeeklockAgainstDrills,
} from "../src/weeklock-drills.js";
import rawPack from "../../../packs/weeklock/weeklock.json";

const KNOWN = ["btn_flop_cbet", "bb_vs_cbet", "bb_flop_donk", "btn_vs_donk"] as const;

describe("TOY_6MAX_EXPAND_DRILL_IDS", () => {
  it("lists the four named drills (not the 'all' aggregate)", () => {
    expect([...TOY_6MAX_EXPAND_DRILL_IDS]).toEqual([...KNOWN]);
  });
});

describe("validateWeeklockAgainstDrills", () => {
  it("passes for the committed pack allowlist", () => {
    const pack = WeeklockPackSchema.parse(rawPack);
    expect(validateWeeklockAgainstDrills(pack, KNOWN)).toEqual({ success: true });
    expect(() => assertAllowedDrillIds(pack, KNOWN)).not.toThrow();
  });

  it("fails when an allowed id is not a known drill (wrong id)", () => {
    const pack = WeeklockPackSchema.parse({ ...rawPack, allowed_drill_ids: ["btn_flop_cbet", "btn_flop_cbett"] });
    const result = validateWeeklockAgainstDrills(pack, KNOWN);
    expect(result).toEqual({ success: false, unknown: ["btn_flop_cbett"] });
    expect(() => assertAllowedDrillIds(pack, KNOWN)).toThrow(/btn_flop_cbett/);
  });

  it("fails on future ids and on the 'all' aggregate", () => {
    const pack = WeeklockPackSchema.parse({
      ...rawPack,
      allowed_drill_ids: ["all", "pf_rfi_utg", "flop_btn_bb_srp_x"],
    });
    const result = validateWeeklockAgainstDrills(pack, KNOWN);
    expect(result).toEqual({ success: false, unknown: ["all", "flop_btn_bb_srp_x", "pf_rfi_utg"] });
  });

  it("fails closed when no known ids are provided", () => {
    const pack = WeeklockPackSchema.parse(rawPack);
    const result = validateWeeklockAgainstDrills(pack, []);
    expect(result.success).toBe(false);
  });

  it("passes for an empty allowlist", () => {
    const pack = WeeklockPackSchema.parse({ ...rawPack, allowed_drill_ids: [] });
    expect(validateWeeklockAgainstDrills(pack, KNOWN)).toEqual({ success: true });
  });

  it("reports each unknown id once", () => {
    const pack = WeeklockPackSchema.parse({ ...rawPack, allowed_drill_ids: ["nope", "nope"] });
    expect(validateWeeklockAgainstDrills(pack, KNOWN)).toEqual({ success: false, unknown: ["nope"] });
  });
});
