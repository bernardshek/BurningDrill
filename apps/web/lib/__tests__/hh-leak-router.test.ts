import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NAMED_DRILLS } from "../drill-node";
import { routeHhLeak } from "../hh-leak-router";

const packsRoot = join(process.cwd(), "public/packs");
const shippedIds = new Set<string>();
for (const packDir of readdirSync(packsRoot)) {
  const packPath = join(packsRoot, packDir);
  let nodeDirs: string[];
  try {
    nodeDirs = readdirSync(join(packPath, "nodes"));
  } catch {
    continue;
  }
  for (const filename of nodeDirs.filter((name) => name.endsWith(".json"))) {
    const node = JSON.parse(readFileSync(join(packPath, "nodes", filename), "utf8")) as { drill_id?: string };
    if (node.drill_id) shippedIds.add(node.drill_id);
  }
}

describe("routeHhLeak", () => {
  it("routes known tags to named drill ids present in shipped pack nodes", () => {
    const result = routeHhLeak({ tags: ["overfold_vs_cbet", "vs3bet_ip"] });
    expect(result.drill_ids).toEqual(["bb_vs_cbet", "vs3bet_ip"]);
    expect(result.drill_ids.every((id) => shippedIds.has(id))).toBe(true);
  });

  it("uses structured hint context and free-text notes", () => {
    expect(routeHhLeak({ streets: ["flop"], positions: ["BB"], actions: ["faced bet"] }).drill_ids)
      .toEqual(["bb_vs_cbet"]);
    expect(routeHhLeak({ notes: "I keep missing the delayed barrel" }).drill_ids)
      .toEqual(["btn_delayed_barrel"]);
  });

  it("returns no route for unknown hints and never invents ids", () => {
    const result = routeHhLeak({ tags: ["mystery leak", "all"] });
    expect(result.drill_ids).toEqual([]);
    expect(result.reasons).toEqual({});
    expect([...NAMED_DRILLS.map(({ id }) => id), ...result.drill_ids].every((id) => id === "all" || shippedIds.has(id))).toBe(true);
  });
});
