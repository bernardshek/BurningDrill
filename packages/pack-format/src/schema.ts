import { z } from "zod";

/**
 * Compact drill-pack schema for slice-1 UI (public/packs JSON spots).
 * Production CDN packs use PackManifest in ./manifest.ts (CAS blobs).
 */

export const TableSizeSchema = z.union([z.literal(6), z.literal(9)]);

export const StreetSchema = z.enum(["preflop", "flop", "turn", "river"]);

export const PositionSchema = z.enum([
  "UTG",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
]);

/**
 * One legal action in a spot with frequency + EV (bb).
 * Scoring rule: correct action = highest frequency; EV loss = bestEv - chosenEv.
 */
export const SpotActionSchema = z.object({
  action: z.string().min(1),
  sizeBb: z.number().positive().optional(),
  frequency: z.number().min(0).max(1),
  evBb: z.number(),
});

export const SpotSchema = z.object({
  id: z.string().min(1),
  street: StreetSchema,
  board: z.string().optional(),
  hero_position: PositionSchema,
  villain_position: PositionSchema,
  hero_hand: z.string().min(2),
  potBb: z.number().positive().optional(),
  stackBb: z.number().positive().optional(),
  actions: z.array(SpotActionSchema).min(1),
});

/** Slice-1 embedded/toy pack served from public/packs — not the CDN PackManifest. */
export const DrillPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver MAJOR.MINOR.PATCH"),
  formatVersion: z.number().int().positive(),
  table_size: TableSizeSchema,
  game: z.literal("nlhe_cash"),
  abstraction: z.string().min(1),
  line: z.string().min(1),
  spots: z.array(z.union([z.string().min(1), SpotSchema])).min(1),
});

export type TableSize = z.infer<typeof TableSizeSchema>;
export type Street = z.infer<typeof StreetSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type SpotAction = z.infer<typeof SpotActionSchema>;
export type Spot = z.infer<typeof SpotSchema>;
export type DrillPack = z.infer<typeof DrillPackSchema>;

/**
 * Future Postgres users table shape (stub documentation only).
 * Not persisted server-side in this slice.
 */
export type UserRowStub = {
  id: string;
  display_name: string | null;
  created_at: string;
  pack_prefs: Record<string, string>;
};
