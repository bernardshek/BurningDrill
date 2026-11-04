# generate-toy-expand

Emits `packs/toy-6max-expand/` compact DrillNodes from the pinned `flops-25.json`
list + toy BTN open / BB defend ranges. v0.5.0 is four named flop drills
(btn_flop_cbet, bb_vs_cbet, bb_flop_donk, btn_vs_donk) — 25 nodes each.
Dry and paired `bb_vs_cbet` nodes raise the 33% c-bet: raise is best, call stays in the mix, fold is the miss.

```bash
node tools/generate-toy-expand/generate.mjs
```

Frequencies/EV are **toy-consistent** (not solver GTO). A separate offline
dump emitter lives in `tools/pack-builder` (`node tools/pack-builder/emit.mjs`).
Never runs on Vercel.

The separate thin Full Hand pack can be regenerated with:

```bash
node tools/generate-toy-expand/generate-multistreet.mjs
```

It reads the first four pinned boards from the expand pack's `flops-25.json`.
The default seed is `0xb1`; set `TOY_MULTISTREET_SEED` to reproduce a different
deterministic toy mix. Output goes to `packs/toy-6max-multistreet/`.
