/**
 * Load a drill_node_v1 pack and project it through the solver shell.
 * Reads JSON already on disk (or the static /packs copy). Never runs a solver.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { validateCompactPack } from "@poker-trainer/pack-format";
import type { DrillNode } from "./drill-node";
import { toDrillNode } from "./load-pack";
import {
  SOLVER_SHELL_NODE_ID,
  SolverShellError,
  buildSolverShellResponse,
  isSolverShellPackId,
  parseSolverShellQuery,
  type SolverShellResponse,
} from "./solver-shell";

type LoadedShellPack = {
  manifest: Parameters<typeof buildSolverShellResponse>[0];
  nodes: DrillNode[];
};

const cache = new Map<string, LoadedShellPack>();

export function clearSolverShellPackCache(): void {
  cache.clear();
}

/** Directory that holds pack folders. Prefers the static public copy the site serves. */
export function findPacksRoot(cwd = process.cwd()): string | null {
  const candidates = [
    join(cwd, "public/packs"),
    join(cwd, "apps/web/public/packs"),
    join(cwd, "packs"),
    join(cwd, "../../packs"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "toy-6max-expand", "manifest.json"))) return dir;
  }
  return null;
}

function assertInside(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolved = resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + sep)) {
    throw new SolverShellError("Invalid pack path", 400);
  }
}

function loadPackRecords(manifestRaw: unknown, resolved: Record<string, unknown>): LoadedShellPack {
  const result = validateCompactPack(manifestRaw, resolved);
  if (!result.ok) throw new SolverShellError(result.errors.join("\n"), 400);
  return {
    manifest: result.pack,
    nodes: result.nodes.map(toDrillNode),
  };
}

export function readSolverShellPackFromDisk(packsRoot: string, packId: string): LoadedShellPack {
  if (!isSolverShellPackId(packId)) {
    throw new SolverShellError(`Unknown pack "${packId}"`, 404);
  }
  const root = resolve(packsRoot);
  const dir = resolve(root, packId);
  assertInside(root, dir);
  const hit = cache.get(dir);
  if (hit) return hit;
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new SolverShellError(`Pack "${packId}" is not on disk`, 404);
  }
  const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    format?: string;
    nodes?: unknown[];
  };
  if (manifestRaw.format !== "drill_node_v1") {
    throw new SolverShellError(`Pack "${packId}" is not a drill_node_v1 pack`, 400);
  }
  const ids = (manifestRaw.nodes ?? []).filter((id): id is string => typeof id === "string");
  const resolvedNodes: Record<string, unknown> = {};
  for (const id of ids) {
    if (!SOLVER_SHELL_NODE_ID.test(id)) {
      throw new SolverShellError("Invalid node id in manifest", 400);
    }
    const nodePath = resolve(dir, "nodes", `${id}.json`);
    assertInside(dir, nodePath);
    if (!existsSync(nodePath)) throw new SolverShellError(`Missing node ${id}`, 404);
    resolvedNodes[id] = JSON.parse(readFileSync(nodePath, "utf8"));
  }
  const loaded = loadPackRecords(manifestRaw, resolvedNodes);
  cache.set(dir, loaded);
  return loaded;
}

function requireOrigin(origin: string | undefined): string {
  if (!origin) throw new SolverShellError("Pack files are not available", 500);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new SolverShellError("Pack files are not available", 500);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SolverShellError("Pack files are not available", 500);
  }
  return parsed.origin;
}

/** Static files the site already serves under /packs. Used when the repo tree is not on disk. */
export async function readSolverShellPackFromOrigin(
  origin: string | undefined,
  packId: string,
): Promise<LoadedShellPack> {
  if (!isSolverShellPackId(packId)) {
    throw new SolverShellError(`Unknown pack "${packId}"`, 404);
  }
  const base = `${requireOrigin(origin)}/packs/${packId}`;
  const cacheKey = `origin:${base}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const manifestRes = await fetch(`${base}/manifest.json`);
  if (!manifestRes.ok) throw new SolverShellError(`Failed to load pack ${packId}`, 404);
  const manifestRaw = (await manifestRes.json()) as { format?: string; nodes?: unknown[] };
  if (manifestRaw.format !== "drill_node_v1") {
    throw new SolverShellError(`Pack "${packId}" is not a drill_node_v1 pack`, 400);
  }
  const ids = (manifestRaw.nodes ?? []).filter((id): id is string => typeof id === "string");
  const resolvedNodes: Record<string, unknown> = {};
  await Promise.all(
    ids.map(async (id) => {
      if (!SOLVER_SHELL_NODE_ID.test(id)) {
        throw new SolverShellError("Invalid node id in manifest", 400);
      }
      const nodeRes = await fetch(`${base}/nodes/${id}.json`);
      if (!nodeRes.ok) throw new SolverShellError(`Missing node ${id}`, 404);
      resolvedNodes[id] = await nodeRes.json();
    }),
  );
  const loaded = loadPackRecords(manifestRaw, resolvedNodes);
  cache.set(cacheKey, loaded);
  return loaded;
}

export async function loadSolverShell(
  input: { packId: string | null; drillId: string | null; nodeId: string | null },
  opts: { cwd?: string; origin?: string } = {},
): Promise<SolverShellResponse> {
  const query = parseSolverShellQuery(input);
  const root = findPacksRoot(opts.cwd ?? process.cwd());
  const loaded = root
    ? readSolverShellPackFromDisk(root, query.packId)
    : await readSolverShellPackFromOrigin(opts.origin, query.packId);
  return buildSolverShellResponse(loaded.manifest, loaded.nodes, query);
}
