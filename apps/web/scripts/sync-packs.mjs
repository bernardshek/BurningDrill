import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const src = join(root, "packs");
const dest = join(root, "apps/web/public/packs");

if (!existsSync(src)) {
  console.error("packs/ not found at", src);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Synced packs/ → apps/web/public/packs/");
