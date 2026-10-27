import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sampleSpot } from "../sample-spot";
import type { DrillNode } from "../drill-node";

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
    expect(manifest.version).toMatch(/^0\.4\./);
    const nodes: DrillNode[] = (manifest.nodes as string[]).map((id) =>
      JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")),
    );
    const btn = nodes.filter((n) => n.drill_id === "btn_flop_cbet");
    const bb = nodes.filter((n) => n.drill_id === "bb_vs_cbet");
    expect(btn).toHaveLength(25);
    expect(bb).toHaveLength(25);
    for (const n of btn) {
      expect(n.line).toContain("Hero BTN to act");
      expect(n.line_steps?.length).toBeGreaterThanOrEqual(3);
      expect(n.prior_action).toBeUndefined();
    }
    for (const n of bb) {
      expect(n.line).toContain("BTN bet 33%");
      expect(n.prior_action).toBe("bet_33");
      expect(n.line_steps?.some((s) => s.includes("bet 33"))).toBe(true);
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
  });
});
