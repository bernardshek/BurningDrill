import { readFileSync } from "node:fs";
import { validateWeeklockPack } from "./weeklock-schema.js";
import { TOY_6MAX_EXPAND_DRILL_IDS, validateWeeklockAgainstDrills } from "./weeklock-drills.js";
const path = process.argv[2];
if (!path) throw new Error("Usage: cli-weeklock-validate.ts <weeklock.json>");
const result = validateWeeklockPack(JSON.parse(readFileSync(path, "utf8")));
if (!result.success) { console.error(result.error.format()); process.exit(1); }
const drills = validateWeeklockAgainstDrills(result.data, TOY_6MAX_EXPAND_DRILL_IDS);
if (!drills.success) {
  console.error(`Unknown allowed_drill_ids (not on toy-6max-expand): ${drills.unknown.join(", ")}`);
  process.exit(1);
}
console.log(`Valid Week lock pack: ${result.data.pack} ${result.data.version} (${result.data.scenarios.length} scenarios, ${result.data.allowed_drill_ids.length} allowed drills)`);
