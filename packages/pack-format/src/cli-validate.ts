#!/usr/bin/env node
/**
 * Dual validator:
 *   - Drill packs: packs/toy-6max/manifest.json (+ spots/)
 *   - CDN PackManifest: packs/examples/.../manifest.json (+ optional blobs/ size map)
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { validateCompactPack, validatePack } from "./validate.js";
import { PackManifest, validatePackManifest } from "./manifest.js";

const target = process.argv[2];
if (!target) {
  console.error("Usage: validate <path-to-manifest.json>");
  process.exit(2);
}

const abs = target.startsWith("/") ? target : join(process.cwd(), target);
if (!existsSync(abs)) {
  console.error(`File not found: ${abs}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(abs, "utf8"));

if (raw && typeof raw === "object" && raw.format === "drill_node_v1") {
  const dir = dirname(abs);
  const nodesDir = join(dir, "nodes");
  const resolved: Record<string, unknown> = {};
  if (existsSync(nodesDir)) {
    for (const file of readdirSync(nodesDir)) {
      if (file.endsWith(".json")) resolved[basename(file, ".json")] = JSON.parse(readFileSync(join(nodesDir, file), "utf8"));
    }
  }
  const result = validateCompactPack(raw, resolved);
  if (!result.ok) {
    console.error("INVALID compact drill pack");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK (compact drill): ${result.pack.id}@${result.pack.version} — ${result.nodes.length} node(s)`);
  process.exit(0);
}

if (raw && typeof raw === "object" && "schema_version" in raw) {
  try {
    const dir = dirname(abs);
    // Walk up looking for blobs/ sibling of packs/
    let blobSizes: Map<string, number> | undefined;
    const candidates = [
      join(dir, "blobs"),
      join(dir, "../../blobs"),
      join(dir, "../../../blobs"),
    ];
    for (const blobsDir of candidates) {
      if (!existsSync(blobsDir)) continue;
      blobSizes = new Map();
      for (const f of readdirSync(blobsDir)) {
        const p = join(blobsDir, f);
        const st = readFileSync(p);
        blobSizes.set(f, st.byteLength);
      }
      break;
    }
    const m = validatePackManifest(raw, blobSizes);
    PackManifest.parse(m); // already parsed inside; keep type assert path warm
    console.log(
      `OK (PackManifest): ${m.pack_id}@${m.version} ships_solver_code=${m.provenance.ships_solver_code}`,
    );
    process.exit(0);
  } catch (e) {
    console.error("INVALID PackManifest");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

const dir = dirname(abs);
const spotsDir = join(dir, "spots");
const resolved: Record<string, unknown> = {};
if (existsSync(spotsDir)) {
  for (const file of readdirSync(spotsDir)) {
    if (!file.endsWith(".json")) continue;
    const id = basename(file, ".json");
    resolved[id] = JSON.parse(readFileSync(join(spotsDir, file), "utf8"));
  }
}

const result = validatePack(raw, resolved);
if (!result.ok) {
  console.error("INVALID drill pack");
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `OK (drill): ${result.pack.id}@${result.pack.version} — ${result.spots.length} spot(s)`,
);
