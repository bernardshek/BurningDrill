import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sampleSpot } from "../sample-spot";
import { NAMED_DRILLS, spotLeakTag, type DrillNode } from "../drill-node";

const packDir = join(process.cwd(), "../../packs/toy-6max-expand");

describe("expand pack deal-from-range", () => {
  it("samples many distinct hero hands across deals", () => {
    const manifest = JSON.parse(
      readFileSync(join(packDir, "manifest.json"), "utf8"),
    );
    const nodes: DrillNode[] = (manifest.nodes as string[]).map((id) =>
      JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")),
    );
    const hands = new Set<string>();
    const boards = new Set<string>();
    let seed = 1;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < 200; i++) {
      const hit = sampleSpot(nodes, { random: rng });
      expect(hit).not.toBeNull();
      hands.add(hit!.heroHand);
      boards.add(hit!.node.bd.join(""));
    }
    // Far more than the old 12 fixed hands
    expect(hands.size).toBeGreaterThan(40);
    expect(boards.size).toBeGreaterThan(10);
  });
});

describe("expand pack named drills + line chrome", () => {
  it("tags every node with drill_id, line, and line_steps", () => {
    const manifest = JSON.parse(
      readFileSync(join(packDir, "manifest.json"), "utf8"),
    );
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.provenance.ships_solver_code).toBe(false);
    const nodes: DrillNode[] = (manifest.nodes as string[]).map((id) =>
      JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")),
    );
    expect(nodes).toHaveLength(100);
    const btn = nodes.filter((n) => n.drill_id === "btn_flop_cbet");
    const bb = nodes.filter((n) => n.drill_id === "bb_vs_cbet");
    const donk = nodes.filter((n) => n.drill_id === "bb_flop_donk");
    const vsDonk = nodes.filter((n) => n.drill_id === "btn_vs_donk");
    expect(btn).toHaveLength(25);
    expect(bb).toHaveLength(25);
    expect(donk).toHaveLength(25);
    expect(vsDonk).toHaveLength(25);
    const flopBoards = new Set(
      JSON.parse(readFileSync(join(packDir, "flops-25.json"), "utf8")).flops.map(
        (bd: string[]) => bd.join(""),
      ),
    );
    for (const group of [btn, bb, donk, vsDonk]) {
      expect(new Set(group.map((n) => n.bd.join(""))).size).toBe(25);
      for (const n of group) {
        expect(n.st).toBe("flop");
        expect(flopBoards.has(n.bd.join(""))).toBe(true);
        expect(n.line_steps?.length).toBeGreaterThanOrEqual(3);
      }
    }
    for (const n of btn) {
      expect(n.line).toContain("Hero BTN to act");
      expect(n.prior_action).toBeUndefined();
      expect(n.hp).toBe("BTN");
    }
    for (const n of bb) {
      expect(n.line).toContain("BTN bet 33%");
      expect(n.prior_action).toBe("bet_33");
      expect(n.line_steps?.some((s) => s.includes("bet 33"))).toBe(true);
      expect(n.hp).toBe("BB");
    }
    for (const n of donk) {
      expect(n.hp).toBe("BB");
      expect(n.vp).toBe("BTN");
      expect(n.ip).toBe(false);
      expect(n.pot).toBe(6.5);
      expect(n.line).toContain("Hero BB to act");
      expect(n.line).not.toContain("bet 33%");
      expect(n.prior_action).toBeUndefined();
      expect(n.actions.map((a) => a.a)).toEqual(
        expect.arrayContaining(["check", "bet_33"]),
      );
      expect(n.actions.some((a) => a.a === "fold")).toBe(false);
    }
    for (const n of vsDonk) {
      expect(n.hp).toBe("BTN");
      expect(n.vp).toBe("BB");
      expect(n.ip).toBe(true);
      expect(n.pot).toBe(8.7);
      expect(n.line).toContain("BB bet 33%");
      expect(n.line).toContain("Hero BTN to act");
      expect(n.prior_action).toBe("bet_33");
      expect(n.actions.map((a) => a.a)).toEqual([
        "fold",
        "call",
        "raise_2.5x",
      ]);
    }
  });

  it("filters sampler by drill_id", () => {
    const manifest = JSON.parse(
      readFileSync(join(packDir, "manifest.json"), "utf8"),
    );
    const nodes: DrillNode[] = (manifest.nodes as string[]).map((id) =>
      JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")),
    );
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < 40; i++) {
      const hit = sampleSpot(nodes, {
        random: rng,
        drillId: "bb_vs_cbet",
      });
      expect(hit).not.toBeNull();
      expect(hit!.node.drill_id).toBe("bb_vs_cbet");
      expect(hit!.node.hp).toBe("BB");
    }
    for (const drillId of ["bb_flop_donk", "btn_vs_donk"] as const) {
      const hit = sampleSpot(nodes, { random: rng, drillId });
      expect(hit).not.toBeNull();
      expect(hit!.node.drill_id).toBe(drillId);
    }
  });
});

describe("spot drill shelf", () => {
  it("lists four real drills plus All", () => {
    expect(NAMED_DRILLS.map((d) => d.id)).toEqual([
      "btn_flop_cbet",
      "bb_vs_cbet",
      "bb_flop_donk",
      "btn_vs_donk",
      "all",
    ]);
  });

  it("maps donk drills to other and keeps c-bet on the cbet leak row", () => {
    expect(
      spotLeakTag({
        st: "flop",
        hp: "BTN",
        vp: "BB",
        drill_id: "btn_flop_cbet",
      }),
    ).toBe("cbet");
    expect(
      spotLeakTag({
        st: "flop",
        hp: "BB",
        vp: "BTN",
        drill_id: "bb_vs_cbet",
      }),
    ).toBe("other");
    expect(
      spotLeakTag({
        st: "flop",
        hp: "BB",
        vp: "BTN",
        drill_id: "bb_flop_donk",
      }),
    ).toBe("other");
    expect(
      spotLeakTag({
        st: "flop",
        hp: "BTN",
        vp: "BB",
        drill_id: "btn_vs_donk",
      }),
    ).toBe("other");
  });
});
