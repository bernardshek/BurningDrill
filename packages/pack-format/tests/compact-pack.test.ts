import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateCompactPack } from "../src/validate.js";

const packDir = join(process.cwd(), "../../packs/toy-6max-expand");

describe("toy-6max-expand compact pack", () => {
  it("validates all emitted nodes", () => {
    const manifest = JSON.parse(
      readFileSync(join(packDir, "manifest.json"), "utf8"),
    );
    const resolved: Record<string, unknown> = {};
    for (const id of manifest.nodes as string[]) {
      resolved[id] = JSON.parse(
        readFileSync(join(packDir, "nodes", `${id}.json`), "utf8"),
      );
    }
    const result = validateCompactPack(manifest, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.version).toBe("0.5.0");
    expect(result.pack.provenance?.ships_solver_code).toBe(false);
    expect(result.nodes.length).toBeGreaterThanOrEqual(25);
    expect(result.nodes.length).toBe(100);
    const byDrill: Record<string, number> = {};
    for (const n of result.nodes) {
      const id = n.drill_id ?? "";
      byDrill[id] = (byDrill[id] ?? 0) + 1;
      expect(n.st).toBe("flop");
    }
    expect(byDrill).toEqual({
      btn_flop_cbet: 25,
      bb_vs_cbet: 25,
      bb_flop_donk: 25,
      btn_vs_donk: 25,
    });
    const boards = new Set(result.nodes.map((n) => n.bd.join("")));
    expect(boards.size).toBe(25);
    for (const n of result.nodes) {
      expect(n.combos.length).toBeGreaterThanOrEqual(60);
      expect(n.combos.length).toBeLessThanOrEqual(120);
    }
  });

  it("has flops-25.json with 25 boards", () => {
    const flops = JSON.parse(
      readFileSync(join(packDir, "flops-25.json"), "utf8"),
    );
    expect(flops.flops).toHaveLength(25);
    expect(readdirSync(join(packDir, "nodes")).length).toBe(100);
  });
});
