# BurningDrill

Source of truth for the poker-trainer POC: a personal-first NLHE cash **drill trainer** (no live play, no solver in the web app). pnpm monorepo — Next.js App Router UI plus static strategy packs. **Solvers never ship** in the deployable web app or Vercel/Docker web image.

Default pack: [`packs/toy-6max-expand`](packs/toy-6max-expand) **v0.4.0** (`ships_solver_code: false`). The browser loads the copy under [`apps/web/public/packs`](apps/web/public/packs).

## Quick start

```bash
pnpm i
pnpm --filter @poker-trainer/pack-format build
pnpm test
pnpm dev          # syncs packs, then http://localhost:3000
```

No `.env` is required. Do not commit secrets.

Other commands:

| Command | What it does |
| --- | --- |
| `pnpm build` | Build pack-format, sync packs into `public/`, build Next app |
| `pnpm test` | Vitest: PackManifest + drill pack schema + scoring |
| `pnpm typecheck` | `tsc --noEmit` in packages |
| `pnpm validate-packs` | CLI validate toy packs, including `toy-6max-expand`, and weeklock |

Requires **Node 20+** and **pnpm**.

## Layout

```
apps/web/                      Next.js UI (Vercel Hobby target)
packages/pack-format/          Zod PackManifest (CDN) + compact drill spots + scoring
packs/toy-6max-expand/         Default drill pack v0.4.0 (synced → public/packs)
packs/toy-6max/                Slice-1 compact drill JSON
packs/toy-6max-multistreet/    Flop/turn/river practice nodes
packs/weeklock/                Week-lock fixture
packs/examples/…               Full PackManifest fixture (CAS blob refs)
tools/pack-builder/            Stub only — offline/CI solver runner lives here later
tools/generate-toy-expand/     Regenerates toy expand / multistreet JSON
```

`apps/web/scripts/sync-packs.mjs` copies `packs/` → `apps/web/public/packs/` (`predev` and `prebuild`).

## How packs are loaded (MVP vs production)

**MVP ($0):** compact drill packs under [`packs/`](packs/) (default [`toy-6max-expand` v0.4.0](packs/toy-6max-expand/manifest.json)) are copied to [`apps/web/public/packs`](apps/web/public/packs) and fetched by the browser. No object store required.

**Production target:** Cloudflare R2 (not wired in this slice):

```
packs/{pack_id}/{version}/manifest.json
blobs/{sha256}            # content-addressed, Cache-Control: immutable
```

Schema: `packages/pack-format/src/manifest.ts` (`schema_version`, `pack_id`, `ships_solver_code: false`, blob sha256 refs, provenance, …). Validate with `validatePackManifest`. Toy drill UI keeps a separate compact spot JSON path (`DrillPackSchema` / `validatePack`) so demos stay simple.

**Never** put AGPL solvers (TexasSolver, postflop-solver, …) in the web Docker/Vercel image. Separate **pack-builder** (offline/CI) vs **web**. Pack artifacts = manifest + blobs only. See `NOTICE` and pack `provenance.ships_solver_code: false`.

## Scoring rule

Live drills grade with `gradeDrillNode` only.

- **Best** — the highest-EV action. A line within 0.01bb of that EV is still Best.
- **Correct** — Best, or EV loss ≤ 0.03bb, or the action’s mix is at least 0.15.
- **Wrong** — anything else.

EV loss (bb) = `max(0, bestEv − chosenEv)`.

## User stub

`localStorage` key `poker-trainer:user` holds `{ id, display_name, created_at, pack_prefs }` — shape documented for a later Postgres `users` table. Saved drill settings: `poker-trainer:saved-drill`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) on push to `main` and on pull requests: `pnpm i --frozen-lockfile` → pack-format build → `pnpm test` → `pnpm typecheck` → sync packs → web build. No solver install.

## Deploy notes

- Aimed at **Vercel Hobby**; do not deploy solvers.
- AGPL: solvers offline/CI only — not legal advice; counsel before commercial launch.

## Next steps

1. `tools/pack-builder` job that emits PackManifest + blobs
2. R2 publish (`aws s3 sync` compatible) with immutable blob cache headers
3. Multi-user Postgres behind the existing `user_id` stub
4. Expand toy → real cash lines / table sizes
