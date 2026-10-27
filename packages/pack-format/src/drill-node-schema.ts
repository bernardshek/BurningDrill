import { z } from "zod";
import { PositionSchema, StreetSchema, TableSizeSchema } from "./schema.js";

/**
 * Compact DrillNode schema (Coach lock / research/drillpack-node-v1.json).
 * Combo encoding: uint16 c ∈ 0..1325; weights w > 0.
 */
export const CompactActionSchema = z.object({
  a: z.string().min(1),
  m: z.number().min(0).max(1),
  ev: z.number(),
  sizeBb: z.number().positive().optional(),
});

export const CompactComboSchema = z.object({
  c: z.number().int().min(0).max(1325),
  w: z.number().positive(),
});

export const CompactDrillNodeSchema = z.object({
  id: z.string().min(1),
  st: StreetSchema,
  hp: PositionSchema,
  vp: PositionSchema,
  ip: z.boolean(),
  tx: z.string().optional(),
  bd: z.array(z.string().length(2)).max(5),
  pot: z.number().nonnegative(),
  eff: z.number().positive(),
  nf: z.number().positive(),
  wu: z.boolean(),
  best: z.number().int().nonnegative(),
  dev: z.number().nonnegative(),
  actions: z.array(CompactActionSchema).min(1),
  kids: z.array(z.string().nullable()),
  combos: z.array(CompactComboSchema).min(1),
  /** Named mini-drill bucket, e.g. btn_flop_cbet | bb_vs_cbet | bb_flop_donk | btn_vs_donk. */
  drill_id: z.string().min(1).optional(),
  /** Human action-line strip, e.g. "BTN open 2.5bb → BB call · Flop · Hero to act". */
  line: z.string().min(1).optional(),
  /** Ordered steps for the action-line strip. */
  line_steps: z.array(z.string().min(1)).optional(),
  /** Immediate prior action at this node (e.g. bet_33 when facing a 33% bet). */
  prior_action: z.string().min(1).optional(),
});

export const CompactDrillPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver MAJOR.MINOR.PATCH"),
  formatVersion: z.number().int().positive(),
  format: z.literal("drill_node_v1"),
  table_size: TableSizeSchema,
  game: z.literal("nlhe_cash"),
  abstraction: z.string().min(1),
  line: z.string().min(1),
  game_lines: z.array(StreetSchema).optional(),
  provenance: z
    .object({
      kind: z.string().optional(),
      practice: z.boolean().optional(),
      ships_solver_code: z.boolean().optional(),
      note: z.string().optional(),
    })
    .optional(),
  flop_subset: z.string().optional(),
  nodes: z.array(z.union([z.string().min(1), CompactDrillNodeSchema])).min(1),
});

export type CompactAction = z.infer<typeof CompactActionSchema>;
export type CompactCombo = z.infer<typeof CompactComboSchema>;
export type CompactDrillNode = z.infer<typeof CompactDrillNodeSchema>;
export type CompactDrillPack = z.infer<typeof CompactDrillPackSchema>;
