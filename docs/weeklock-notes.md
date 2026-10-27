# Week lock notes

The Coach pack lives at `packs/weeklock/weeklock.json`. Run `pnpm validate-packs` to validate it, then `pnpm build`; the web build syncs `packs/` into `apps/web/public/packs/` before compiling. The UI loads this static JSON in the browser; no server database is used.

## Schema

The root contains `pack: "weeklock-nl5"`, a version, stakes, optional `rules` (strings), optional legacy `placeholder`, and scenarios. Each scenario has a unique `id`, tag (`RFI`, `vs3bet`, `vs4bet`, or `cbet`), hero and nullable villain positions, line text, unique action IDs, a default action, chart, positive weight, and note. Chart keys must be one of the 169 classes (`AA`, `AKs`, `AKo`); values are one action ID or a non-empty list of acceptable action IDs. Defaults and every chart action must be declared in the scenario action list. Optional `deal_from` restricts deals to listed hand classes. Optional `focus` with `focus_rate` (0–1) adds probability-weighted focus sampling; hand classes are weighted by combo count. `deal_from` takes precedence over focus sampling. Run `pnpm validate-packs` to validate this pack as well as the toy packs.

## Known gaps

- The active week lock content is the Coach-provided pack; maintain its source JSON as Coach-authored data.
- Week lock currently appears within the Spot page; the mode toggle is stored separately in localStorage.
- The browser log is device-local, can be cleared by the user, and has no account sync.
- Date buckets use the browser's local timezone; session boundaries are a gap greater than 30 minutes.
