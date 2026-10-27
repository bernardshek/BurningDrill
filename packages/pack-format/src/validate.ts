import { DrillPackSchema, SpotSchema, type DrillPack, type Spot } from "./schema.js";
import { getBestAction } from "./scoring.js";
import {
  CompactDrillNodeSchema,
  CompactDrillPackSchema,
  type CompactDrillNode,
  type CompactDrillPack,
} from "./drill-node-schema.js";

export type ValidateOk = { ok: true; pack: DrillPack; spots: Spot[] };
export type ValidateErr = { ok: false; errors: string[] };
export type ValidateResult = ValidateOk | ValidateErr;

function freqSumOk(spot: Spot, tolerance = 0.02): boolean {
  const sum = spot.actions.reduce((s, a) => s + a.frequency, 0);
  return Math.abs(sum - 1) <= tolerance || sum <= 1 + tolerance;
}

/**
 * Validate a slice-1 drill pack (compact spots JSON).
 * For CDN PackManifest + blob CAS checks, use validatePackManifest from ./manifest.ts.
 */
export function validatePack(
  raw: unknown,
  resolvedSpots?: Record<string, unknown>,
): ValidateResult {
  const errors: string[] = [];
  const parsed = DrillPackSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const pack = parsed.data;
  const spots: Spot[] = [];

  for (const entry of pack.spots) {
    if (typeof entry === "string") {
      const rawSpot = resolvedSpots?.[entry];
      if (rawSpot === undefined) {
        errors.push(`spots: missing resolved spot "${entry}"`);
        continue;
      }
      const spotParsed = SpotSchema.safeParse(rawSpot);
      if (!spotParsed.success) {
        for (const issue of spotParsed.error.issues) {
          errors.push(`spot ${entry}.${issue.path.join(".")}: ${issue.message}`);
        }
        continue;
      }
      if (spotParsed.data.id !== entry) {
        errors.push(
          `spot ${entry}: id field "${spotParsed.data.id}" must match filename/id`,
        );
      }
      spots.push(spotParsed.data);
    } else {
      spots.push(entry);
    }
  }

  for (const spot of spots) {
    if (!freqSumOk(spot)) {
      const sum = spot.actions.reduce((s, a) => s + a.frequency, 0);
      errors.push(
        `spot ${spot.id}: action frequencies sum to ${sum.toFixed(4)} (expected ~1.0)`,
      );
    }
    try {
      getBestAction(spot);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    if (spot.street !== "preflop" && !spot.board) {
      errors.push(`spot ${spot.id}: postflop spots require board`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, pack, spots };
}

export type ValidateCompactOk = {
  ok: true;
  pack: CompactDrillPack;
  nodes: CompactDrillNode[];
};
export type ValidateCompactResult = ValidateCompactOk | ValidateErr;

function mixSumOk(node: CompactDrillNode, tolerance = 0.02): boolean {
  const sum = node.actions.reduce((s, a) => s + a.m, 0);
  return Math.abs(sum - 1) <= tolerance || sum <= 1 + tolerance;
}

/**
 * Validate a compact multi-combo DrillPack (format: drill_node_v1).
 */
export function validateCompactPack(
  raw: unknown,
  resolvedNodes?: Record<string, unknown>,
): ValidateCompactResult {
  const errors: string[] = [];
  const parsed = CompactDrillPackSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const pack = parsed.data;
  const nodes: CompactDrillNode[] = [];

  for (const entry of pack.nodes) {
    if (typeof entry === "string") {
      const rawNode = resolvedNodes?.[entry];
      if (rawNode === undefined) {
        errors.push(`nodes: missing resolved node "${entry}"`);
        continue;
      }
      const nodeParsed = CompactDrillNodeSchema.safeParse(rawNode);
      if (!nodeParsed.success) {
        for (const issue of nodeParsed.error.issues) {
          errors.push(`node ${entry}.${issue.path.join(".")}: ${issue.message}`);
        }
        continue;
      }
      if (nodeParsed.data.id !== entry) {
        errors.push(
          `node ${entry}: id field "${nodeParsed.data.id}" must match filename/id`,
        );
      }
      nodes.push(nodeParsed.data);
    } else {
      nodes.push(entry);
    }
  }

  for (const node of nodes) {
    if (!mixSumOk(node)) {
      const sum = node.actions.reduce((s, a) => s + a.m, 0);
      errors.push(
        `node ${node.id}: action mixes sum to ${sum.toFixed(4)} (expected ~1.0)`,
      );
    }
    if (node.best < 0 || node.best >= node.actions.length) {
      errors.push(`node ${node.id}: best index ${node.best} out of range`);
    }
    if (node.kids.length !== node.actions.length) {
      errors.push(
        `node ${node.id}: kids length ${node.kids.length} != actions ${node.actions.length}`,
      );
    }
    if (node.st !== "preflop" && node.bd.length < 3) {
      errors.push(`node ${node.id}: postflop requires ≥3 board cards`);
    }
    if (node.actions.length > 0) {
      let argmax = 0;
      for (let i = 1; i < node.actions.length; i++) {
        if (node.actions[i]!.ev > node.actions[argmax]!.ev) argmax = i;
      }
      if (argmax !== node.best) {
        errors.push(
          `node ${node.id}: best=${node.best} but argmax EV is ${argmax}`,
        );
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, pack, nodes };
}
