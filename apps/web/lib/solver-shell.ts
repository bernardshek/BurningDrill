/**
 * Read-only projection of pack nodes.
 * Mix, EV, and Best / Correct / Wrong come from the node and gradeDrillNode.
 * This module does not solve, train, or load a model.
 */
import type { CompactDrillPack } from "@poker-trainer/pack-format";
import { formatActionLabel } from "./action-label";
import { handFromComboIndex } from "./combo1326";
import {
  formatActionLine,
  formatTexture,
  gradeDrillNode,
  NAMED_DRILLS,
  type DrillNode,
  type DrillPosition,
  type DrillStreet,
} from "./drill-node";

export const SOLVER_SHELL_PACKS = [
  { id: "toy-6max-expand", label: "25-flop expand (toy)" },
  { id: "coach-shelf", label: "Coach shelf" },
  { id: "toy-6max-multistreet", label: "Full hand (toy)" },
  { id: "solver-flop-proof", label: "Solver flop proof" },
] as const;

export type SolverShellPackId = (typeof SOLVER_SHELL_PACKS)[number]["id"];

const PACK_IDS = new Set<string>(SOLVER_SHELL_PACKS.map((pack) => pack.id));

/** Manifest node ids. No slashes, so a node cannot escape its pack directory. */
export const SOLVER_SHELL_NODE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const DRILL_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;

const EXTRA_DRILL_LABELS: Record<string, string> = {
  btn_bb_srp_full: "BTN vs BB full hand",
};

export class SolverShellError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SolverShellError";
    this.status = status;
  }
}

export type SolverShellPackView = {
  id: string;
  name: string;
  version: string;
  practice: boolean;
  kind: string | null;
  note: string | null;
  shipsSolverCode: false;
};

export type SolverShellActionView = {
  id: string;
  label: string;
  /** Pack `actions[].m`. Not recomputed. */
  mix: number;
  /** Pack `actions[].ev`. Not recomputed. */
  evBb: number;
  sizeBb: number | null;
  /** From gradeDrillNode. */
  evLossBb: number;
  grade: "Best" | "Correct" | "Wrong";
  /** Pack `kids[]` entry. Null when the pack has no continuation. */
  kid: string | null;
};

export type SolverShellNodeSummary = {
  id: string;
  drillId: string | null;
  street: DrillStreet;
  hero: DrillPosition;
  villain: DrillPosition;
  board: string[];
  line: string;
};

export type SolverShellNodeView = SolverShellNodeSummary & {
  inPosition: boolean;
  potBb: number;
  stackBb: number;
  texture: string | null;
  deltaEvBb: number;
  /** Action id stored at the pack's `best` index. */
  bestAction: string;
  actions: SolverShellActionView[];
  rangeCount: number;
  range: { hand: string; weight: number }[];
};

export type SolverShellDrillCount = {
  id: string;
  label: string;
  count: number;
};

export type SolverShellFlags = {
  liveSolve: false;
  shipsSolverCode: false;
  source: "pack";
  gradedBy: "gradeDrillNode";
};

export type SolverShellCatalog = SolverShellFlags & {
  pack: SolverShellPackView;
  drills: SolverShellDrillCount[];
  nodes: SolverShellNodeSummary[];
  /** First listed node, so the page can render without a second fetch. */
  node: SolverShellNodeView | null;
};

export type SolverShellNodeBody = SolverShellFlags & {
  pack: SolverShellPackView;
  node: SolverShellNodeView;
};

export type SolverShellResponse = SolverShellCatalog | SolverShellNodeBody;

const FLAGS: SolverShellFlags = {
  liveSolve: false,
  shipsSolverCode: false,
  source: "pack",
  gradedBy: "gradeDrillNode",
};

export function isSolverShellPackId(id: string): id is SolverShellPackId {
  return PACK_IDS.has(id);
}

export function drillLabel(id: string): string {
  const named = NAMED_DRILLS.find((drill) => drill.id === id);
  if (named) return named.label;
  return EXTRA_DRILL_LABELS[id] ?? id;
}

export function parseSolverShellQuery(input: {
  packId: string | null;
  drillId: string | null;
  nodeId: string | null;
}): { packId: SolverShellPackId; drillId: string | null; nodeId: string | null } {
  const packId = input.packId?.trim() ?? "";
  if (!packId) throw new SolverShellError("Missing pack", 400);
  if (!isSolverShellPackId(packId)) {
    throw new SolverShellError(`Unknown pack "${packId}"`, 404);
  }
  const drillRaw = input.drillId?.trim() ?? "";
  const nodeRaw = input.nodeId?.trim() ?? "";
  if (drillRaw && drillRaw !== "all" && !DRILL_ID.test(drillRaw)) {
    throw new SolverShellError("Invalid drill", 400);
  }
  if (nodeRaw && !SOLVER_SHELL_NODE_ID.test(nodeRaw)) {
    throw new SolverShellError("Invalid node", 400);
  }
  return {
    packId,
    drillId: !drillRaw || drillRaw === "all" ? null : drillRaw,
    nodeId: nodeRaw || null,
  };
}

/** Fail closed unless the manifest explicitly refuses to ship solver code. */
export function projectSolverShellPack(
  pack: Pick<CompactDrillPack, "id" | "name" | "version" | "provenance">,
): SolverShellPackView {
  if (pack.provenance?.ships_solver_code !== false) {
    throw new SolverShellError("ships_solver_code must be false", 403);
  }
  return {
    id: pack.id,
    name: pack.name,
    version: pack.version,
    practice: pack.provenance.practice !== false,
    kind: pack.provenance.kind ?? null,
    note: pack.provenance.note ?? null,
    shipsSolverCode: false,
  };
}

export function summarizeSolverShellNode(node: DrillNode): SolverShellNodeSummary {
  return {
    id: node.id,
    drillId: node.drill_id ?? null,
    street: node.st,
    hero: node.hp,
    villain: node.vp,
    board: [...node.bd],
    line: formatActionLine(node),
  };
}

/** Copy pack mix and EV. Grades with gradeDrillNode. Does not invent a line. */
export function projectSolverShellNode(node: DrillNode): SolverShellNodeView {
  const storedBest = node.actions[node.best];
  if (!storedBest) {
    throw new SolverShellError(`Node ${node.id} has no best action`, 500);
  }
  return {
    ...summarizeSolverShellNode(node),
    inPosition: node.ip,
    potBb: node.pot,
    stackBb: node.eff,
    texture: formatTexture(node.tx),
    deltaEvBb: node.dev,
    bestAction: storedBest.a,
    actions: node.actions.map((action, index) => {
      const grade = gradeDrillNode(node, action.a);
      return {
        id: action.a,
        label: formatActionLabel(action.a, action.sizeBb),
        mix: action.m,
        evBb: action.ev,
        sizeBb: action.sizeBb ?? null,
        evLossBb: grade.evLossBb,
        grade: grade.label,
        kid: node.kids[index] ?? null,
      };
    }),
    rangeCount: node.combos.length,
    range: node.combos.map((combo) => ({
      hand: handFromComboIndex(combo.c),
      weight: combo.w,
    })),
  };
}

export function countDrills(nodes: readonly DrillNode[]): SolverShellDrillCount[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const id = node.drill_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const namedOrder: string[] = NAMED_DRILLS.map((drill) => drill.id).filter(
    (id) => id !== "all" && counts.has(id),
  );
  const extras = [...counts.keys()]
    .filter((id) => !namedOrder.includes(id))
    .sort();
  return [...namedOrder, ...extras].map((id) => ({
    id,
    label: drillLabel(id),
    count: counts.get(id) ?? 0,
  }));
}

export function buildSolverShellResponse(
  pack: Pick<CompactDrillPack, "id" | "name" | "version" | "provenance">,
  nodes: readonly DrillNode[],
  query: { drillId: string | null; nodeId: string | null },
): SolverShellResponse {
  const packView = projectSolverShellPack(pack);
  if (query.nodeId) {
    const node = nodes.find((candidate) => candidate.id === query.nodeId);
    if (!node) throw new SolverShellError(`Unknown node "${query.nodeId}"`, 404);
    if (query.drillId && node.drill_id !== query.drillId) {
      throw new SolverShellError(
        `Node ${node.id} is not in drill ${query.drillId}`,
        404,
      );
    }
    return { pack: packView, node: projectSolverShellNode(node), ...FLAGS };
  }
  const listed = query.drillId
    ? nodes.filter((node) => node.drill_id === query.drillId)
    : nodes;
  const summaries = listed.map(summarizeSolverShellNode);
  const first = listed[0] ?? null;
  return {
    pack: packView,
    drills: countDrills(nodes),
    nodes: summaries,
    node: first ? projectSolverShellNode(first) : null,
    ...FLAGS,
  };
}

function isFlagged(value: unknown): value is SolverShellFlags & { pack: unknown } {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<SolverShellFlags>;
  return (
    view.liveSolve === false &&
    view.shipsSolverCode === false &&
    view.source === "pack" &&
    view.gradedBy === "gradeDrillNode"
  );
}

export function isSolverShellCatalog(value: unknown): value is SolverShellCatalog {
  if (!isFlagged(value)) return false;
  const view = value as Partial<SolverShellCatalog>;
  return Array.isArray(view.nodes) && Array.isArray(view.drills);
}

/** A single-node response. Catalog payloads include `nodes` and are rejected here. */
export function isSolverShellNodeBody(value: unknown): value is SolverShellNodeBody {
  if (!isFlagged(value)) return false;
  if (Array.isArray((value as { nodes?: unknown }).nodes)) return false;
  const node = (value as { node?: unknown }).node;
  return node != null && typeof node === "object";
}
