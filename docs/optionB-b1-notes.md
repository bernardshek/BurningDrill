# Option B B1: thin multi-street Full Hand

## What changed

- Added `packs/toy-6max-multistreet`, a deterministic Practice/toy pack covering four boards from `toy-6max-expand/flops-25.json`. The 28 nodes include flop decisions, turn transitions, and river decisions; continuing children are encoded in `kids[]` parallel to `actions[]`, and terminal edges are null.
- Added `tools/generate-toy-expand/generate-multistreet.mjs` to reproduce the pack. Run `node tools/generate-toy-expand/generate-multistreet.mjs` from the repository root.
- Added `game_lines` to compact pack validation and set it to flop, turn, river for this pack. Every node uses `btn_bb_srp_full`; provenance is `toy_hybrid`, `practice: true`, and `ships_solver_code: false`.
- Added pure walker helpers and tests, plus a Street / Full Hand interface. Full Hand starts from a sampled BTN flop root, grades hero choices against pack EV/best data, samples villain actions according to pack mixes, and follows only pack kids. Street mode samples a hero decision on the selected street using the stored prior line. Spot mode remains the existing P0 interaction.

## Schema and tree decisions

- `kids[i]` is the child reached after `actions[i]`; null means terminal or no continuation is emitted.
- At most two actions per node have kids. The flop BTN root has check and bet 33% continuations; the tertiary bet size terminates. Villain choices are sampled from `actions[].m` and then follow the matching kid.
- Board changes are carried only by child `bd` values. The four boards use distinct deterministic turn and river cards.
- Toy action EV values and frequencies are generated as fixed pack data from a reproducible seed (`TOY_MULTISTREET_SEED`, default `0xb1`). They are not solver truth and no solver or dynamic grading code is in the web runtime.

## Known gaps

- This is a small UX proof pack, not a complete BTN/BB game tree or solver-derived strategy. Some branches terminate at the thin-tree boundary.
- Street mode starts from a stored decision on the selected street; its node's line metadata represents the fixed prior path rather than replaying every prior action onscreen.
- Villain actions advance automatically; the interface currently shows the next node after a short delay rather than a separate animation/history log.
- This checkout currently has no installed dependencies, so pnpm validation/typecheck/build/test commands may fail before execution until dependencies are available.
