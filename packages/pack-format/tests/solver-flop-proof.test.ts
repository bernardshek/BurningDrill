import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CompactDrillNodeSchema } from "../src/drill-node-schema.js";
import { validatePackManifest } from "../src/manifest.js";
import { validateCompactPack } from "../src/validate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const packDir = join(root, "packs/solver-flop-proof");

describe("solver-flop-proof pack from the offline dump", () => {
  it("validates compact drill nodes and the PackManifest solvers block", () => {
    const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
    const resolved: Record<string, unknown> = {};
    for (const id of manifest.nodes as string[]) {
      resolved[id] = JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8"));
    }
    const compact = validateCompactPack(manifest, resolved);
    expect(compact.ok).toBe(true);
    if (!compact.ok) return;
    expect(compact.pack.version).toBe("0.1.0");
    expect(compact.pack.provenance?.ships_solver_code).toBe(false);
    expect(compact.nodes).toHaveLength(2);
    expect(compact.nodes.map((node) => node.drill_id)).toEqual([
      "bb_flop_donk",
      "btn_flop_cbet",
    ]);

    const cdnPath = join(packDir, "0.1.0/manifest.json");
    const cdnRaw = JSON.parse(readFileSync(cdnPath, "utf8"));
    const blobsDir = join(packDir, "0.1.0/blobs");
    const blobSizes = new Map<string, number>();
    for (const file of readdirSync(blobsDir)) {
      blobSizes.set(file, readFileSync(join(blobsDir, file)).byteLength);
    }
    const cdn = validatePackManifest(cdnRaw, blobSizes);
    expect(cdn.provenance.ships_solver_code).toBe(false);
    expect(cdn.provenance.solvers).toEqual([
      {
        name: "TexasSolver",
        version: "0.2.0",
        license: "AGPL-3.0",
        role: "offline_solve",
      },
    ]);
    expect(cdn.game_lines).toEqual(["flop"]);

    const index = readFileSync(join(blobsDir, cdn.blobs.node_index.sha256), "utf8");
    const indexed = index
      .trim()
      .split("\n")
      .map((line) => CompactDrillNodeSchema.parse(JSON.parse(line)));
    expect(indexed.map((node) => node.id)).toEqual(compact.nodes.map((node) => node.id));
    for (const node of indexed) {
      expect(node).toEqual(resolved[node.id]);
    }
  });
});
