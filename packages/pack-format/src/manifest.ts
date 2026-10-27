/**
 * packages/pack-format — PackManifest schema (v1)
 *
 * Intended home: packages/pack-format/src/manifest.ts
 * CI: parse every packs/{pack_id}/{version}/manifest.json; verify blob
 * hashes exist under blobs/{sha256}; reject if ships_solver_code !== false.
 *
 * Toy packs may live under apps/web/public/packs for slice 1; same schema.
 * Production publish target: Cloudflare R2 (blobs immutable CAS).
 */

import { z } from "zod";

export const PACK_SCHEMA_VERSION = 1 as const;

export const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected lowercase sha256 hex");

export const BlobRef = z.object({
  sha256: Sha256,
  bytes: z.number().int().positive(),
  content_type: z.enum([
    "application/octet-stream",
    "application/json",
    "application/x-pack-node-index",
  ]),
});

export const GameLine = z.enum([
  "preflop",
  "flop",
  "turn",
  "river",
  "full_tree",
]);

/** e.g. hu_after_folds, srp_btn_vs_bb, mtt_push_fold */
export const AbstractionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const SolverName = z.enum([
  "TexasSolver",
  "postflop-solver",
  "other",
]);

export const ProvenanceSolver = z.object({
  name: SolverName,
  version: z.string().min(1),
  license: z.literal("AGPL-3.0"),
  role: z.enum(["offline_solve", "offline_postprocess"]),
});

export const PackManifest = z
  .object({
    schema_version: z.literal(PACK_SCHEMA_VERSION),
    pack_id: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9._-]{1,63}$/,
        "pack_id: lowercase start, [a-z0-9._-], max 64",
      ),
    /** Semver of pack *data*, not the web app */
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    format: z.enum(["cash", "mtt"]),
    table_size: z.union([z.literal(6), z.literal(9)]),
    game_lines: z.array(GameLine).min(1),
    abstraction: AbstractionId,
    stack_depths_bb: z.array(z.number().positive()).min(1),
    bet_sizes: z.object({
      labels: z.array(z.string().min(1)).min(1),
    }),
    /** MTT only; cash packs must be null */
    icm: z
      .object({
        model: z.enum(["icm", "chipev", "none"]),
        notes: z.string().max(500).optional(),
      })
      .nullable(),
    blobs: z
      .object({
        strategies: BlobRef,
        node_index: BlobRef,
      })
      .catchall(BlobRef),
    node_index_format: z.enum(["jsonl_v1", "flatbuf_v1"]),
    /** e.g. street|board|pot_bb|ip_oop|facing */
    spot_key_schema: z.string().min(1),
    provenance: z.object({
      built_at: z.string().datetime(),
      builder: z.string().min(1),
      solvers: z.array(ProvenanceSolver).default([]),
      /** Solvers must never ship in web/Vercel artifacts */
      ships_solver_code: z.literal(false),
      source_note: z.string().max(1000).optional(),
    }),
    license: z.object({
      pack_data: z.string().min(1),
      notice: z.string().min(1),
    }),
  })
  .superRefine((m, ctx) => {
    if (m.format === "cash" && m.icm !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cash packs must set icm: null",
        path: ["icm"],
      });
    }
    if (m.format === "mtt" && m.icm === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mtt packs must set icm model (icm | chipev | none)",
        path: ["icm"],
      });
    }
  });

export type PackManifest = z.infer<typeof PackManifest>;
export type BlobRef = z.infer<typeof BlobRef>;

/** CDN / public path helpers */
export function manifestPath(packId: string, version: string): string {
  return `packs/${packId}/${version}/manifest.json`;
}

export function blobPath(sha256: string): string {
  return `blobs/${sha256}`;
}

/**
 * Parse + structural checks. Pass `blobSizes` from disk/CDN listing
 * (sha256 → byte length) to verify references in CI.
 */
export function validatePackManifest(
  input: unknown,
  blobSizes?: ReadonlyMap<string, number>,
): PackManifest {
  const manifest = PackManifest.parse(input);

  if (blobSizes) {
    for (const [name, ref] of Object.entries(manifest.blobs)) {
      const size = blobSizes.get(ref.sha256);
      if (size === undefined) {
        throw new Error(`missing blob for ${name}: ${ref.sha256}`);
      }
      if (size !== ref.bytes) {
        throw new Error(
          `blob size mismatch for ${name}: manifest ${ref.bytes} vs actual ${size}`,
        );
      }
    }
  }

  return manifest;
}

/** Fixture matching research example — use in unit tests */
export const EXAMPLE_MANIFEST = {
  schema_version: 1,
  pack_id: "cash6-srp-btn-bb",
  version: "1.0.0",
  format: "cash",
  table_size: 6,
  game_lines: ["flop", "turn", "river"],
  abstraction: "hu_after_folds",
  stack_depths_bb: [100],
  bet_sizes: { labels: ["33", "75", "150", "allin"] },
  icm: null,
  blobs: {
    strategies: {
      sha256:
        "a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00",
      bytes: 1048576,
      content_type: "application/octet-stream",
    },
    node_index: {
      sha256:
        "00112233445566778899aabbccddeeffa1b2c3d4e5f60718293a4b5c6d7e8f90",
      bytes: 8192,
      content_type: "application/x-pack-node-index",
    },
  },
  node_index_format: "jsonl_v1",
  spot_key_schema: "street|board|pot_bb|ip_oop|facing",
  provenance: {
    built_at: "2026-10-22T07:00:00.000Z",
    builder: "pack-builder@0.1.0",
    solvers: [
      {
        name: "TexasSolver",
        version: "0.2.0",
        license: "AGPL-3.0",
        role: "offline_solve",
      },
    ],
    ships_solver_code: false,
    source_note:
      "Solved offline; frequencies exported to pack blobs. No solver binary in this artifact.",
  },
  license: {
    pack_data: "Proprietary",
    notice:
      "Strategy frequencies are trainer data. AGPL solvers were used offline only and are not included.",
  },
} as const satisfies z.input<typeof PackManifest>;
