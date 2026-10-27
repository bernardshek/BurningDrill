import {
  validatePack,
  validateCompactPack,
  type DrillPack,
  type Spot,
  type CompactDrillPack,
  type CompactDrillNode,
} from "@poker-trainer/pack-format";
import type { DrillNode } from "./drill-node";

export type LoadedPack = {
  manifest: DrillPack | CompactDrillPack;
  /** Legacy 1-hand spots (toy-6max). Empty when format is drill_node_v1. */
  spots: Spot[];
  /** Compact multi-combo nodes when format is drill_node_v1. */
  nodes: DrillNode[];
  format: "spot" | "drill_node_v1";
  practice: boolean;
  flopCount?: number;
};

function toDrillNode(n: CompactDrillNode): DrillNode {
  const out: DrillNode = {
    id: n.id,
    st: n.st,
    hp: n.hp,
    vp: n.vp,
    ip: n.ip,
    tx: n.tx,
    bd: n.bd,
    pot: n.pot,
    eff: n.eff,
    nf: n.nf,
    wu: n.wu,
    best: n.best,
    dev: n.dev,
    actions: n.actions.map((a) => {
      const act: DrillNode["actions"][number] = { a: a.a, m: a.m, ev: a.ev };
      if (a.sizeBb != null) act.sizeBb = a.sizeBb;
      return act;
    }),
    kids: n.kids,
    combos: n.combos.map((c) => ({ c: c.c, w: c.w })),
  };
  if (n.drill_id) out.drill_id = n.drill_id;
  if (n.line) out.line = n.line;
  if (n.line_steps) out.line_steps = [...n.line_steps];
  if (n.prior_action) out.prior_action = n.prior_action;
  return out;
}

/**
 * Load a drill pack from /public/packs/<id>/.
 * Supports legacy Spot packs and compact drill_node_v1 multi-combo packs.
 * Solvers never ship — packs are JSON assets only.
 */
export async function loadPack(packId: string): Promise<LoadedPack> {
  const base = `/packs/${packId}`;
  const manifestRes = await fetch(`${base}/manifest.json`);
  if (!manifestRes.ok) {
    throw new Error(`Failed to load pack manifest: ${packId}`);
  }
  const manifestRaw = (await manifestRes.json()) as Record<string, unknown>;

  if (manifestRaw.format === "drill_node_v1") {
    const nodeIds = (manifestRaw.nodes as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
    const resolved: Record<string, unknown> = {};
    await Promise.all(
      nodeIds.map(async (id) => {
        const r = await fetch(`${base}/nodes/${id}.json`);
        if (!r.ok) throw new Error(`Failed to load node ${id}`);
        resolved[id] = await r.json();
      }),
    );
    const result = validateCompactPack(manifestRaw, resolved);
    if (!result.ok) {
      throw new Error(`Invalid pack ${packId}:\n${result.errors.join("\n")}`);
    }
    const provenance = result.pack.provenance;
    return {
      manifest: result.pack,
      spots: [],
      nodes: result.nodes.map(toDrillNode),
      format: "drill_node_v1",
      practice: provenance?.practice !== false,
      flopCount: countUniqueBoards(result.nodes),
    };
  }

  const spotIds = (manifestRaw.spots as unknown[]).filter(
    (s): s is string => typeof s === "string",
  );
  const resolved: Record<string, unknown> = {};
  await Promise.all(
    spotIds.map(async (id) => {
      const r = await fetch(`${base}/spots/${id}.json`);
      if (!r.ok) throw new Error(`Failed to load spot ${id}`);
      resolved[id] = await r.json();
    }),
  );

  const result = validatePack(manifestRaw, resolved);
  if (!result.ok) {
    throw new Error(`Invalid pack ${packId}:\n${result.errors.join("\n")}`);
  }
  return {
    manifest: result.pack,
    spots: result.spots,
    nodes: [],
    format: "spot",
    practice: true,
  };
}

function countUniqueBoards(nodes: CompactDrillNode[]): number {
  const keys = new Set(nodes.map((n) => n.bd.join("")));
  return keys.size;
}
