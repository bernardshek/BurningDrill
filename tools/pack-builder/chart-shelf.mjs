/**
 * Coach shelf: weeklock chart scenarios → compact drill nodes, plus
 * checked-in turn dumps for btn_delayed_barrel.
 *
 * Charts stay in packs/weeklock/weeklock.json. This file does not copy them
 * and does not run a solver. Grade gaps are lock distances for gradeDrillNode
 * (above the 0.03bb correct band, under the 0.15bb dump gap) so a pure chart
 * line still deals.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DumpError, comboIndexFromHand, renderPack, writePackFiles } from "./lib.mjs";

const SUITS = "cdhs";
const CHART_EV = 0.12;
const MISS_EV = 0;

function fail(message) {
  throw new DumpError(message);
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`failed to read ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

/** Every combo of a 169-class, canonical uint16 index, weight 1. */
export function combosForClass(handClass) {
  if (typeof handClass !== "string" || handClass.length < 2 || handClass.length > 3) {
    fail(`bad hand class "${handClass}"`);
  }
  const a = handClass[0];
  const b = handClass[1];
  const hands = [];
  if (a === b) {
    if (handClass.length !== 2) fail(`bad pair class "${handClass}"`);
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        hands.push(`${a}${SUITS[i]}${b}${SUITS[j]}`);
      }
    }
  } else if (handClass.endsWith("s") || handClass.endsWith("o")) {
    const suited = handClass.endsWith("s");
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (suited ? s1 === s2 : s1 !== s2) hands.push(`${a}${s1}${b}${s2}`);
      }
    }
  } else {
    fail(`bad hand class "${handClass}"`);
  }
  return hands.map((hand) => ({ c: comboIndexFromHand(hand), w: 1 }));
}

function chartList(value) {
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0 || list.some((action) => typeof action !== "string" || !action)) {
    fail("chart value must be an action or a non-empty action list");
  }
  return list;
}

function bucketRank(key) {
  if (key === "5bet_jam" || key === "4bet") return 10;
  if (key.includes("4bet") && key.includes("call")) return 20;
  if (key === "call") return 30;
  if (key === "fold") return 50;
  return 40;
}

function actionsFor(actionIds, allowed) {
  const allowedSet = new Set(allowed);
  const share = allowed.length === 1 ? 1 : Number((1 / allowed.length).toFixed(3));
  const actions = actionIds.map((id) => ({
    a: id,
    m: allowedSet.has(id) ? share : 0,
    ev: allowedSet.has(id) ? CHART_EV : MISS_EV,
  }));
  const sum = Number(actions.reduce((total, action) => total + action.m, 0).toFixed(3));
  const drift = Number((1 - sum).toFixed(3));
  if (drift !== 0) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (!allowedSet.has(actions[i].a)) continue;
      actions[i].m = Number((actions[i].m + drift).toFixed(3));
      break;
    }
  }
  let best = 0;
  for (let i = 1; i < actions.length; i++) {
    if (actions[i].ev > actions[best].ev) best = i;
  }
  let second = -Infinity;
  for (let i = 0; i < actions.length; i++) {
    if (i === best) continue;
    second = Math.max(second, actions[i].ev);
  }
  const dev = Number(Math.max(0, actions[best].ev - (second === -Infinity ? actions[best].ev : second)).toFixed(3));
  return { actions, best, dev };
}

function chartNodes(scenario, spec) {
  if (!Array.isArray(scenario.deal_from) || scenario.deal_from.length === 0) {
    fail(`${scenario.id} needs deal_from; refusing a full 169-cell chart`);
  }
  if (scenario.villain_pos == null) fail(`${scenario.id} needs a villain`);
  const groups = new Map();
  for (const handClass of scenario.deal_from) {
    const raw = Object.prototype.hasOwnProperty.call(scenario.chart, handClass)
      ? scenario.chart[handClass]
      : scenario.default;
    const allowed = chartList(raw);
    for (const action of allowed) {
      if (!scenario.actions.includes(action)) {
        fail(`${scenario.id} chart action "${action}" is not in actions`);
      }
    }
    const key = [...allowed].sort().join("_");
    if (!groups.has(key)) groups.set(key, { allowed, classes: [] });
    groups.get(key).classes.push(handClass);
  }
  const keys = [...groups.keys()].sort((a, b) => bucketRank(a) - bucketRank(b) || a.localeCompare(b));
  return keys.map((key) => {
    const group = groups.get(key);
    const seen = new Set();
    const combos = [];
    for (const handClass of [...group.classes].sort()) {
      for (const combo of combosForClass(handClass)) {
        if (seen.has(combo.c)) fail(`${scenario.id} repeats combo ${combo.c}`);
        seen.add(combo.c);
        combos.push(combo);
      }
    }
    combos.sort((a, b) => a.c - b.c);
    const built = actionsFor(scenario.actions, group.allowed);
    const steps = spec.line_steps ?? [scenario.line];
    return {
      id: `n_${scenario.id}_${key}`,
      st: "preflop",
      hp: scenario.hero_pos,
      vp: scenario.villain_pos,
      ip: spec.ip === true,
      bd: [],
      pot: spec.pot,
      eff: spec.eff,
      nf: combos.length,
      wu: false,
      best: built.best,
      dev: built.dev,
      actions: built.actions,
      kids: built.actions.map(() => null),
      combos,
      drill_id: scenario.id,
      line: scenario.line,
      line_steps: steps,
    };
  });
}

function validateSpec(spec) {
  if (!spec || spec.format !== "chart_shelf_v1") fail('shelf format must be "chart_shelf_v1"');
  if (typeof spec.weeklock !== "string" || !spec.weeklock) fail("weeklock path is required");
  if (typeof spec.turn_dumps !== "string" || !spec.turn_dumps) fail("turn_dumps path is required");
  const pack = spec.pack;
  if (!pack || typeof pack.id !== "string" || typeof pack.version !== "string" || typeof pack.name !== "string") {
    fail("pack.id, pack.version, and pack.name are required");
  }
  if (!Array.isArray(spec.scenarios) || spec.scenarios.length === 0) fail("scenarios are required");
  const seen = new Set();
  for (const row of spec.scenarios) {
    if (!row || typeof row.id !== "string") fail("each scenario needs an id");
    if (row.id.startsWith("rfi_") || row.id === "all") fail(`refusing shelf scenario ${row.id}`);
    if (seen.has(row.id)) fail(`duplicate scenario ${row.id}`);
    seen.add(row.id);
    if (row.ip !== true && row.ip !== false) fail(`${row.id} needs ip true or false`);
    if (!(typeof row.pot === "number" && row.pot > 0)) fail(`${row.id} pot must be positive`);
    if (!(typeof row.eff === "number" && row.eff > 0)) fail(`${row.id} eff must be positive`);
    if (!Array.isArray(row.line_steps) || row.line_steps.some((step) => typeof step !== "string" || !step)) {
      fail(`${row.id} line_steps must be non-empty strings`);
    }
  }
}

/**
 * @param {unknown} spec
 * @param {{ root: string, dumpDir: string }} paths
 */
export function renderCoachShelf(spec, paths) {
  validateSpec(spec);
  const weeklock = readJson(join(paths.root, spec.weeklock));
  const byId = new Map((weeklock.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  const nodes = [];
  for (const row of spec.scenarios) {
    const scenario = byId.get(row.id);
    if (!scenario) fail(`weeklock has no scenario ${row.id}`);
    if (scenario.id.startsWith("rfi_")) fail(`refusing rfi scenario ${scenario.id}`);
    nodes.push(...chartNodes(scenario, row));
  }
  const dumpFile = readJson(join(paths.dumpDir, spec.turn_dumps));
  const dumps = dumpFile.dumps;
  if (!Array.isArray(dumps) || dumps.length === 0) fail("turn_dumps file needs a dumps array");
  for (const dump of dumps) {
    const rendered = renderPack(dump);
    for (const node of rendered.nodes) {
      if (node.drill_id !== "btn_delayed_barrel") {
        fail(`turn dump node ${node.id} must be btn_delayed_barrel, got ${node.drill_id}`);
      }
      if (node.st !== "turn") fail(`delayed barrel node ${node.id} must be a turn node`);
      nodes.push(node);
    }
  }
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) fail(`duplicate node id ${node.id}`);
    ids.add(node.id);
    if (typeof node.drill_id === "string" && node.drill_id.startsWith("rfi_")) {
      fail(`refusing rfi drill ${node.drill_id}`);
    }
  }
  const streets = [];
  for (const street of ["preflop", "flop", "turn", "river"]) {
    if (nodes.some((node) => node.st === street)) streets.push(street);
  }
  const compact = {
    id: spec.pack.id,
    name: spec.pack.name,
    version: spec.pack.version,
    formatVersion: 1,
    format: "drill_node_v1",
    table_size: 6,
    game: "nlhe_cash",
    abstraction: "coach_nl5",
    line: "COACH_SHELF",
    game_lines: streets,
    provenance: {
      kind: "coach_chart",
      practice: true,
      ships_solver_code: false,
      note: "Preflop nodes are the weeklock charts for vs3bet_oop, vs3bet_ip, vs4bet_jam, and vs4bet_22 (deal_from only, no RFI). Action EV is a lock gap so gradeDrillNode matches the chart, not a solver solve. btn_delayed_barrel is emitted from a checked-in turn dump fixture. No solver code ships.",
    },
    nodes: nodes.map((node) => node.id),
  };
  const files = { "manifest.json": pretty(compact) };
  for (const node of nodes) files[`nodes/${node.id}.json`] = pretty(node);
  return { files, nodes, compact };
}

export function writeCoachShelf(dir, rendered) {
  writePackFiles(dir, rendered.files);
}
