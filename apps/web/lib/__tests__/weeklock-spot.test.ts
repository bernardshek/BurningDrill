import { describe, expect, it } from "vitest";
import {
  assertAllowedDrillIds,
  TOY_6MAX_EXPAND_DRILL_IDS,
  WeeklockPackSchema,
} from "@poker-trainer/pack-format";
import { NAMED_DRILLS } from "../drill-node";
import {
  EMPTY_WEEKLOCK_ALLOWLIST_MESSAGE,
  spotDrillShelf,
} from "../weeklock-spot";
import rawPack from "../../../../packs/weeklock/weeklock.json";

describe("spotDrillShelf", () => {
  it("returns the full named shelf when week lock is off", () => {
    const shelf = spotDrillShelf(
      false,
      { allowed_drill_ids: ["btn_flop_cbet"] },
      "bb_flop_donk",
    );
    expect(shelf.status).toBe("open");
    expect(shelf.drills.map((d) => d.id)).toEqual(NAMED_DRILLS.map((d) => d.id));
    expect(shelf.drillId).toBe("bb_flop_donk");
    expect(shelf.error).toBeNull();
  });

  it("keeps the shelf empty until the week lock pack loads", () => {
    const shelf = spotDrillShelf(true, null, "all");
    expect(shelf.status).toBe("loading");
    expect(shelf.drills).toEqual([]);
  });

  it("limits 2026-w43 to the pack allowlist and snaps off donk and all", () => {
    const pack = WeeklockPackSchema.parse(rawPack);
    expect(pack.version).toBe("2026-w43");
    expect(pack.allowed_drill_ids).toEqual(["btn_flop_cbet", "bb_vs_cbet"]);

    const fromDonk = spotDrillShelf(true, pack, "bb_flop_donk");
    const fromAll = spotDrillShelf(true, pack, "all");
    const fromVs = spotDrillShelf(true, pack, "bb_vs_cbet");
    for (const shelf of [fromDonk, fromAll, fromVs]) {
      expect(shelf.status).toBe("ready");
      if (shelf.status !== "ready") continue;
      expect(shelf.drills.map((d) => d.id)).toEqual([
        "btn_flop_cbet",
        "bb_vs_cbet",
      ]);
      expect(shelf.allowedIds).not.toContain("bb_flop_donk");
      expect(shelf.allowedIds).not.toContain("btn_vs_donk");
      expect(shelf.allowedIds).not.toContain("all");
    }
    expect(fromDonk.drillId).toBe("btn_flop_cbet");
    expect(fromAll.drillId).toBe("btn_flop_cbet");
    expect(fromVs.drillId).toBe("bb_vs_cbet");
  });

  it("snaps to the first allowlist id, preserving allowlist order", () => {
    const shelf = spotDrillShelf(
      true,
      { allowed_drill_ids: ["bb_vs_cbet", "btn_flop_cbet"] },
      "btn_vs_donk",
    );
    expect(shelf.status).toBe("ready");
    if (shelf.status !== "ready") return;
    expect(shelf.drills.map((d) => d.id)).toEqual([
      "bb_vs_cbet",
      "btn_flop_cbet",
    ]);
    expect(shelf.drillId).toBe("bb_vs_cbet");
  });

  it("fails closed on an empty allowlist", () => {
    const shelf = spotDrillShelf(true, { allowed_drill_ids: [] }, "btn_flop_cbet");
    expect(shelf.status).toBe("blocked");
    expect(shelf.drills).toEqual([]);
    expect(shelf.drillId).toBeNull();
    expect(shelf.error).toBe(EMPTY_WEEKLOCK_ALLOWLIST_MESSAGE);
  });

  it("fails closed on an unknown allowlist id with the pack-format error", () => {
    const pack = { allowed_drill_ids: ["btn_flop_cbet", "not_a_drill"] };
    let message = "";
    try {
      assertAllowedDrillIds(pack, TOY_6MAX_EXPAND_DRILL_IDS);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    const shelf = spotDrillShelf(true, pack, "btn_flop_cbet");
    expect(shelf.status).toBe("blocked");
    expect(shelf.drills).toEqual([]);
    expect(shelf.drillId).toBeNull();
    expect(shelf.error).toBe(message);
    expect(message).toMatch(/not_a_drill/);
  });

  it("treats the all aggregate as an unknown drill id", () => {
    const shelf = spotDrillShelf(true, { allowed_drill_ids: ["all"] }, "btn_flop_cbet");
    expect(shelf.status).toBe("blocked");
    expect(shelf.error).toMatch(/all/);
    expect(shelf.drills).toEqual([]);
  });
});
