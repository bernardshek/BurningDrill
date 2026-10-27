import { readFileSync } from "node:fs";
import { validateWeeklockPack } from "./weeklock-schema.js";
const path = process.argv[2];
if (!path) throw new Error("Usage: cli-weeklock-validate.ts <weeklock.json>");
const result = validateWeeklockPack(JSON.parse(readFileSync(path, "utf8")));
if (!result.success) { console.error(result.error.format()); process.exit(1); }
console.log(`Valid Week lock pack: ${result.data.pack} ${result.data.version} (${result.data.scenarios.length} scenarios)`);
