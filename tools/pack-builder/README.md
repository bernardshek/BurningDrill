# pack-builder

Offline emitter. It reads a TexasSolver-style JSON dump and writes BurningDrill pack files. It does not download, install, or run a solver.

Primary solver reference is TexasSolver (AGPL), personal or offline only. `postflop-solver` may be named in `provenance.solvers` when the file is already in this dump shape. DeepFold and GTOpen are not inputs. Do not copy solver sources, binaries, or WASM into `apps/web`, the Vercel project, or this repo. `NOTICE` is unchanged. Every emitted manifest sets `ships_solver_code` to false.

## Emit a pack

```bash
node tools/pack-builder/emit.mjs
```

That reads `tools/pack-builder/fixtures/texassolver-flop-srp.json` and writes `packs/solver-flop-proof/`.

```bash
node tools/pack-builder/emit.mjs --dump path/to/envelope.json --out packs/solver-flop-proof
node tools/pack-builder/emit.mjs --check
node apps/web/scripts/sync-packs.mjs
```

`--check` rebuilds in memory and diffs the output directory. It does not solve. After a real emit, sync packs so `apps/web/public/packs/` matches.

## Output

`packs/solver-flop-proof/` (the thin proof pack):

- `manifest.json` and `nodes/*.json` — compact `drill_node_v1` nodes, the same shape as `toy-6max-expand` / `gradeDrillNode` (`a`, `m`, `ev`, uint16 `c`)
- `0.1.0/manifest.json` — `PackManifest` with `provenance.solvers[]` (`name`, `version`, `license: AGPL-3.0`, `role`) and `provenance.ships_solver_code: false`
- `0.1.0/blobs/{sha256}` — per-combo strategy JSON, plus a `jsonl_v1` node index of those drill nodes

Node mixes are the weight-average of the dump’s per-hand strategy. `best` is argmax EV. Chance nodes are not walked, so a flop dump stays one street.

The checked-in fixture is dump-shaped sample data, not a production solve. CI uses it so the web job never installs TexasSolver.

## Dump envelope

`format` is `texassolver_dump_v1`. The `tree` value is the JSON from `PCfrSolver::dumps()` (`PokerSolver::dump_strategy`):

- action node: `node_type: "action_node"`, `player` (`0` = IP, `1` = OOP), `actions`, `strategy.strategy` (`"AhKd": [freq, ...]`), `childrens` keyed by the action string
- action strings look like `CHECK`, `CALL`, `FOLD`, `BET 2.145000`, `RAISE 10.000000`
- bet amounts are chips in the same unit as `spot.pot` (bb in these packs). A size within 1.5 percentage points of 33 / 50 / 67 / 75 / 100 / 150 becomes `bet_33`, `bet_75`, and so on

Stock `dump_result` does not write EVs (see TexasSolver issue 212). `gradeDrillNode` needs per-action EV, so each action node also needs `evs` in the `DiscountedCfrTrainable::dump_evs()` shape:

```json
"evs": { "actions": ["CHECK", "BET 2.145000"], "evs": { "AhKd": [0.5, 0.3] } }
```

`spot` carries what the raw dump leaves out: `board`, `pot`, `effective_stack`, `stack_bb`, positions, and street. Optional `hand_weights` maps a combo to a positive range weight; omitted hands use weight 1. `built_at` is copied into the PackManifest so the emit stays deterministic.

## Solving offline (not CI, not Vercel)

On a personal machine, a flop-only TexasSolver console session looks like this. Do not add these commands to GitHub Actions or the web image.

```text
set_pot 6.5
set_effective_stack 100
set_board Qs,Jh,2h
set_range_ip ...
set_range_oop ...
set_bet_sizes oop,flop,bet,33
set_bet_sizes ip,flop,bet,33,75
build_tree
start_solve
set_dump_rounds 1
dump_result output_result.json
```

Wrap `output_result.json` as `tree`, add `spot` / `solver` / `built_at`, and attach `dump_evs()` output on each action node. Then run the emit command above.

## CI

`.github/workflows/ci.yml` job `pack-builder-dump` runs `emit.mjs --check` and the node tests against the checked-in fixture. The `build-test` job still installs no solver and still builds the web app from pack JSON only.
