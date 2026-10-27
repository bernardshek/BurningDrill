import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { DrillPackSchema, SpotSchema } from "../src/schema.js";
import { validatePack } from "../src/validate.js";
import { getBestAction, scoreAction } from "../src/scoring.js";
import {
  EXAMPLE_MANIFEST,
  PackManifest,
  validatePackManifest,
  blobPath,
  manifestPath,
} from "../src/manifest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const toyDir = join(root, "packs/toy-6max");

function loadToy() {
  const manifest = JSON.parse(
    readFileSync(join(toyDir, "manifest.json"), "utf8"),
  );
  const resolved: Record<string, unknown> = {};
  const spotsDir = join(toyDir, "spots");
  if (existsSync(spotsDir)) {
    for (const f of readdirSync(spotsDir)) {
      if (!f.endsWith(".json")) continue;
      resolved[basename(f, ".json")] = JSON.parse(
        readFileSync(join(spotsDir, f), "utf8"),
      );
    }
  }
  return { manifest, resolved };
}

describe("PackManifest (CDN / R2 schema)", () => {
  it("validates EXAMPLE_MANIFEST via validatePackManifest", () => {
    const sizes = new Map<string, number>([
      [
        EXAMPLE_MANIFEST.blobs.strategies.sha256,
        EXAMPLE_MANIFEST.blobs.strategies.bytes,
      ],
      [
        EXAMPLE_MANIFEST.blobs.node_index.sha256,
        EXAMPLE_MANIFEST.blobs.node_index.bytes,
      ],
    ]);
    const m = validatePackManifest(EXAMPLE_MANIFEST, sizes);
    expect(m.schema_version).toBe(1);
    expect(m.provenance.ships_solver_code).toBe(false);
    expect(m.pack_id).toBe("cash6-srp-btn-bb");
  });

  it("rejects ships_solver_code true", () => {
    const bad = {
      ...EXAMPLE_MANIFEST,
      provenance: {
        ...EXAMPLE_MANIFEST.provenance,
        ships_solver_code: true,
      },
    };
    expect(() => validatePackManifest(bad)).toThrow();
  });

  it("rejects cash pack with non-null icm", () => {
    const bad = {
      ...EXAMPLE_MANIFEST,
      icm: { model: "none" as const },
    };
    const r = PackManifest.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("rejects missing blob when sizes provided", () => {
    expect(() =>
      validatePackManifest(EXAMPLE_MANIFEST, new Map()),
    ).toThrow(/missing blob/);
  });

  it("path helpers", () => {
    expect(manifestPath("cash6-srp-btn-bb", "1.0.0")).toBe(
      "packs/cash6-srp-btn-bb/1.0.0/manifest.json",
    );
    expect(blobPath("aa".repeat(32))).toBe(`blobs/${"aa".repeat(32)}`);
  });

  it("example fixture on disk parses", () => {
    const p = join(
      root,
      "packs/examples/cash6-srp-btn-bb/1.0.0/manifest.json",
    );
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const m = validatePackManifest(raw);
    expect(m.version).toBe("1.0.0");
  });
});

describe("drill pack schema", () => {
  it("rejects missing version", () => {
    const r = DrillPackSchema.safeParse({
      id: "x",
      name: "x",
      formatVersion: 1,
      table_size: 6,
      game: "nlhe_cash",
      abstraction: "hu_after_folds",
      line: "BTN_vs_BB_SRP",
      spots: ["a"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects table_size 8", () => {
    const r = DrillPackSchema.safeParse({
      id: "x",
      name: "x",
      version: "0.1.0",
      formatVersion: 1,
      table_size: 8,
      game: "nlhe_cash",
      abstraction: "hu_after_folds",
      line: "BTN_vs_BB_SRP",
      spots: ["a"],
    });
    expect(r.success).toBe(false);
  });
});

describe("toy drill pack", () => {
  it("validates against drill schema + helpers", () => {
    const { manifest, resolved } = loadToy();
    const result = validatePack(manifest, resolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spots.length).toBeGreaterThanOrEqual(1);
  });
});

describe("scoring", () => {
  it("picks highest frequency as correct; reports EV loss", () => {
    const spot = SpotSchema.parse({
      id: "t1",
      street: "flop",
      board: "AhKd7c",
      hero_position: "BB",
      villain_position: "BTN",
      hero_hand: "AsQs",
      actions: [
        { action: "check", frequency: 0.25, evBb: 1.0 },
        { action: "bet", sizeBb: 3.5, frequency: 0.6, evBb: 2.2 },
        { action: "raise", sizeBb: 12, frequency: 0.15, evBb: 0.4 },
      ],
    });
    const best = getBestAction(spot);
    expect(best.action).toBe("bet");
    const wrong = scoreAction(spot, "check");
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.label).toBe("Wrong");
    expect(wrong.evLossBb).toBeCloseTo(1.2, 5);
    const right = scoreAction(spot, "bet");
    expect(right.isCorrect).toBe(true);
    expect(right.label).toBe("Best");
    expect(right.evLossBb).toBe(0);
  });
});
