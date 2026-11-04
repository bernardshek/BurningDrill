#!/usr/bin/env node
/**
 * Emit a BurningDrill pack from a TexasSolver-style dump envelope.
 *
 *   node tools/pack-builder/emit.mjs
 *   node tools/pack-builder/emit.mjs --check
 *
 * Does not download or run a solver. Default input is the checked-in fixture.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCoachShelf } from "./chart-shelf.mjs";
import { diffPackFiles, renderPack, writePackFiles } from "./lib.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "../..");

function usage() {
  return `Usage: node tools/pack-builder/emit.mjs [--dump file] [--out dir] [--check]

Read a TexasSolver-style dump envelope, or a chart_shelf_v1 spec, and write
compact drill nodes. Does not download or run a solver.

Defaults:
  --dump tools/pack-builder/fixtures/texassolver-flop-srp.json
  --out  packs/solver-flop-proof

Coach shelf (weeklock charts + delayed-barrel fixture):
  --dump tools/pack-builder/fixtures/coach-shelf.json
  --out  packs/coach-shelf
`;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`missing value for ${name}`);
    process.exit(2);
  }
  return value;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const dumpPath = resolvePath(arg("--dump") ?? join(here, "fixtures/texassolver-flop-srp.json"));
const outDir = resolvePath(arg("--out") ?? join(root, "packs/solver-flop-proof"));
const check = process.argv.includes("--check");

let dump;
try {
  dump = JSON.parse(readFileSync(dumpPath, "utf8"));
} catch (error) {
  console.error(`failed to read dump ${dumpPath}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let rendered;
try {
  rendered =
    dump.format === "chart_shelf_v1"
      ? renderCoachShelf(dump, { root, dumpDir: dirname(dumpPath) })
      : renderPack(dump);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const shown = relative(root, outDir) || outDir;
const packId = rendered.cdn?.pack_id ?? rendered.compact.id;
const packVersion = rendered.cdn?.version ?? rendered.compact.version;
if (check) {
  const diffs = diffPackFiles(outDir, rendered.files);
  if (diffs.length) {
    console.error(`pack-builder --check failed for ${shown}`);
    for (const diff of diffs) console.error(`  ${diff}`);
    process.exit(1);
  }
  console.log(
    `OK pack-builder --check ${packId}@${packVersion} ships_solver_code=false (${Object.keys(rendered.files).length} files)`,
  );
  process.exit(0);
}

writePackFiles(outDir, rendered.files);
console.log(`OK pack-builder wrote ${shown} ${packId}@${packVersion} ships_solver_code=false`);
