/**
 * Offline TexasSolver-style dump → BurningDrill pack files.
 *
 * Reads a documented envelope around PCfrSolver::dumps() (strategy) plus
 * DiscountedCfrTrainable::dump_evs() (evs). Writes compact drill_node_v1
 * nodes and a PackManifest with CAS blobs. Never runs or vendors a solver.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const POSITIONS = new Set(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
const STREETS = new Set(["flop", "turn", "river"]);
const SOLVERS = new Set(["TexasSolver", "postflop-solver"]);
const POT_FRACTIONS = [33, 50, 67, 75, 100, 150];
const BUILDER = "pack-builder@0.1.0";

export class DumpError extends Error {
  constructor(message) {
    super(message);
    this.name = "DumpError";
  }
}

function fail(message) {
  throw new DumpError(message);
}

function roundTo(n, digits) {
  return Number(n.toFixed(digits));
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function cardId(card) {
  const norm = normalizeCard(card);
  const ri = RANKS.indexOf(norm[0]);
  const si = SUITS.indexOf(norm[1]);
  if (ri < 0 || si < 0) fail(`bad card "${card}"`);
  return ri * 4 + si;
}

function normalizeCard(card) {
  if (typeof card !== "string" || card.length !== 2) fail(`bad card "${card}"`);
  const rank = card[0].toUpperCase();
  const suit = card[1].toLowerCase();
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) fail(`bad card "${card}"`);
  return rank + suit;
}

export function normalizeHand(hand) {
  if (typeof hand !== "string") fail(`bad hand "${hand}"`);
  const cleaned = hand.replace(/\s+/g, "");
  if (cleaned.length !== 4) fail(`bad hand "${hand}"`);
  return normalizeCard(cleaned.slice(0, 2)) + normalizeCard(cleaned.slice(2, 4));
}

/** uint16 combo index 0..1325. Same bijection as apps/web/lib/combo1326.ts. */
export function comboIndexFromHand(hand) {
  const norm = normalizeHand(hand);
  const a = cardId(norm.slice(0, 2));
  const b = cardId(norm.slice(2, 4));
  if (a === b) fail(`hand "${hand}" repeats a card`);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return (hi * (hi - 1)) / 2 + lo;
}

function matchPotLabel(pct) {
  let best = null;
  let bestDist = Infinity;
  for (const target of POT_FRACTIONS) {
    const dist = Math.abs(pct - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  if (best != null && bestDist <= 1.5) return String(best);
  return String(Math.round(pct));
}

/**
 * Map a TexasSolver action string onto a drill action id.
 * BET/RAISE amounts are chips in the same unit as spot.pot.
 * Player 0 is IP and player 1 is OOP (GameTree root starts at player 1).
 */
export function parseAction(raw, pot) {
  if (typeof raw !== "string" || !raw.trim()) fail("empty action");
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (s === "CHECK" || s === "X") return { a: "check" };
  if (s === "FOLD") return { a: "fold" };
  if (s === "CALL") return { a: "call" };
  const matched = /^(BET|RAISE)\s+([0-9]+(?:\.[0-9]+)?)$/.exec(s);
  if (!matched) fail(`unrecognized TexasSolver action "${raw}"`);
  if (!(pot > 0)) fail("pot must be positive to map a bet size");
  const amount = Number(matched[2]);
  if (!(amount > 0)) fail(`non-positive bet "${raw}"`);
  const label = matchPotLabel((amount / pot) * 100);
  const kind = matched[1] === "RAISE" ? "raise" : "bet";
  return { a: `${kind}_${label}`, sizeBb: Number(amount.toFixed(3)) };
}

function textureTag(board) {
  const ranks = board.map((card) => RANKS.indexOf(card[0]));
  const suits = board.map((card) => card[1]);
  const uniqSuits = new Set(suits).size;
  const sorted = [...ranks].sort((a, b) => b - a);
  const paired =
    sorted[0] === sorted[1] ||
    sorted[1] === sorted[2] ||
    sorted[0] === sorted[sorted.length - 1];
  const monotone = uniqSuits === 1;
  const twotone = uniqSuits === 2;
  const uniqRanks = new Set(sorted).size;
  const span = sorted[0] - sorted[sorted.length - 1];
  const connected = span <= 4 && uniqRanks === sorted.length;
  const high =
    sorted[0] >= 12 ? "a_high" : sorted[0] >= 10 ? "broadway" : sorted[0] >= 7 ? "mid" : "low";
  if (monotone) return `mono_${high}`;
  if (paired) return `paired_${high}`;
  if (connected && twotone) return `connected_tt_${high}`;
  if (connected) return `connected_${high}`;
  if (twotone) return `twotone_${high}`;
  return `dry_${high}`;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function validateEnvelope(dump) {
  requireObject(dump, "dump");
  if (dump.ships_solver_code === true) {
    fail("ships_solver_code must be false; pack-builder never emits solver code");
  }
  if (dump.format !== "texassolver_dump_v1") {
    fail('dump.format must be "texassolver_dump_v1" (see tools/pack-builder/README.md)');
  }
  const solver = requireObject(dump.solver, "solver");
  if (!SOLVERS.has(solver.name)) {
    fail(
      `unsupported solver "${solver.name}". Offline dumps: TexasSolver (primary) or postflop-solver in dumps() shape. DeepFold and GTOpen are out of scope.`,
    );
  }
  if (typeof solver.version !== "string" || !solver.version.trim()) fail("solver.version is required");
  if (solver.license !== "AGPL-3.0") fail("solver.license must be AGPL-3.0");
  const role = solver.role ?? "offline_solve";
  if (role !== "offline_solve" && role !== "offline_postprocess") {
    fail('solver.role must be "offline_solve" or "offline_postprocess"');
  }
  if (typeof dump.built_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(dump.built_at)) {
    fail("built_at must be an ISO-8601 UTC timestamp (2026-11-04T06:45:00.000Z)");
  }
  const pack = requireObject(dump.pack, "pack");
  if (typeof pack.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(pack.id)) {
    fail("pack.id must match PackManifest pack_id");
  }
  if (typeof pack.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pack.version)) {
    fail("pack.version must be MAJOR.MINOR.PATCH");
  }
  if (typeof pack.name !== "string" || !pack.name.trim()) fail("pack.name is required");
  const spot = requireObject(dump.spot, "spot");
  if (!STREETS.has(spot.street)) fail('spot.street must be "flop", "turn", or "river"');
  if (!Array.isArray(spot.board) || spot.board.length < 3 || spot.board.length > 5) {
    fail("spot.board must be 3 to 5 cards");
  }
  const expectedCards = spot.street === "flop" ? 3 : spot.street === "turn" ? 4 : 5;
  if (spot.board.length !== expectedCards) {
    fail(`spot.board for ${spot.street} must have ${expectedCards} cards`);
  }
  const board = spot.board.map((card) => normalizeCard(card));
  if (new Set(board.map((card) => cardId(card))).size !== board.length) fail("spot.board has a repeated card");
  if (!(typeof spot.pot === "number" && spot.pot > 0)) fail("spot.pot must be a positive number of bb");
  if (!(typeof spot.effective_stack === "number" && spot.effective_stack > 0)) {
    fail("spot.effective_stack must be a positive number of bb");
  }
  if (!(typeof spot.stack_bb === "number" && spot.stack_bb > 0)) fail("spot.stack_bb must be positive");
  if (spot.table_size !== 6 && spot.table_size !== 9) fail("spot.table_size must be 6 or 9");
  if (!POSITIONS.has(spot.ip_position) || !POSITIONS.has(spot.oop_position)) {
    fail("spot.ip_position and spot.oop_position must be UTG, HJ, CO, BTN, SB, or BB");
  }
  if (spot.ip_position === spot.oop_position) fail("ip and oop positions must differ");
  if (spot.format != null && spot.format !== "cash") fail("pack-builder emits cash packs only");
  const abstraction = spot.abstraction ?? "hu_after_folds";
  if (typeof abstraction !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(abstraction)) {
    fail("spot.abstraction must match PackManifest abstraction id");
  }
  if (spot.preflop_line_steps != null) {
    if (!Array.isArray(spot.preflop_line_steps) || spot.preflop_line_steps.some((step) => typeof step !== "string" || !step)) {
      fail("spot.preflop_line_steps must be an array of strings");
    }
  }
  requireObject(dump.tree, "tree");
  if (dump.tree.node_type !== "action_node") fail("tree root must be an action_node");
  return {
    solver: { name: solver.name, version: solver.version.trim(), license: "AGPL-3.0", role },
    built_at: dump.built_at,
    pack,
    spot: {
      street: spot.street,
      board,
      pot: spot.pot,
      effective_stack: spot.effective_stack,
      stack_bb: spot.stack_bb,
      table_size: spot.table_size,
      ip_position: spot.ip_position,
      oop_position: spot.oop_position,
      abstraction,
      preflop_line_steps: spot.preflop_line_steps ?? [],
    },
    handWeights: weightMap(dump.hand_weights),
    tree: dump.tree,
  };
}

function weightMap(raw) {
  const byCombo = new Map();
  if (raw == null) return byCombo;
  requireObject(raw, "hand_weights");
  for (const [hand, weight] of Object.entries(raw)) {
    if (!(typeof weight === "number" && weight > 0)) fail(`hand_weights.${hand} must be positive`);
    const combo = comboIndexFromHand(hand);
    if (byCombo.has(combo)) fail(`hand_weights repeats combo ${hand}`);
    byCombo.set(combo, weight);
  }
  return byCombo;
}

function numberArray(value, label, width) {
  if (!Array.isArray(value) || value.length !== width || value.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    fail(`${label} must be ${width} finite numbers`);
  }
  return value;
}

function handsFromNode(node, pot, boardIds, handWeights) {
  const actions = node.actions;
  if (!Array.isArray(actions) || actions.length === 0) fail("action node needs actions");
  const parsed = actions.map((raw) => ({ raw, ...parseAction(raw, pot) }));
  const seen = new Set();
  for (const action of parsed) {
    if (seen.has(action.a)) fail(`actions collide on drill id "${action.a}" (${action.raw})`);
    seen.add(action.a);
  }
  const strategy = requireObject(node.strategy, "strategy");
  const evsWrap = node.evs;
  if (!evsWrap) {
    fail(
      "action node is missing evs. TexasSolver dump_result writes strategy only; attach dump_evs() output as evs (see tools/pack-builder/README.md)",
    );
  }
  requireObject(evsWrap, "evs");
  if (strategy.actions != null && JSON.stringify(strategy.actions) !== JSON.stringify(actions)) {
    fail("strategy.actions must match the node actions");
  }
  if (evsWrap.actions != null && JSON.stringify(evsWrap.actions) !== JSON.stringify(actions)) {
    fail("evs.actions must match the node actions");
  }
  const stratMap = requireObject(strategy.strategy, "strategy.strategy");
  const evMap = requireObject(evsWrap.evs, "evs.evs");
  const stratKeys = Object.keys(stratMap);
  const evKeys = Object.keys(evMap);
  if (stratKeys.length === 0) fail("strategy has no hands");
  if (stratKeys.length !== evKeys.length || stratKeys.some((key) => !Object.prototype.hasOwnProperty.call(evMap, key))) {
    fail("strategy and evs must list the same hands");
  }
  const hands = [];
  const seenCombos = new Set();
  for (const key of stratKeys) {
    const hand = normalizeHand(key);
    const combo = comboIndexFromHand(hand);
    if (seenCombos.has(combo)) fail(`duplicate combo ${hand}`);
    seenCombos.add(combo);
    const a = cardId(hand.slice(0, 2));
    const b = cardId(hand.slice(2, 4));
    if (boardIds.has(a) || boardIds.has(b)) fail(`hand ${hand} is blocked by the board`);
    const mix = numberArray(stratMap[key], `strategy ${hand}`, actions.length);
    const sum = mix.reduce((total, freq) => total + freq, 0);
    if (Math.abs(sum - 1) > 0.02) fail(`strategy for ${hand} sums to ${sum.toFixed(4)}, expected ~1`);
    if (mix.some((freq) => freq < -1e-9 || freq > 1 + 1e-9)) fail(`strategy for ${hand} is outside 0..1`);
    const ev = numberArray(evMap[key], `evs ${hand}`, actions.length);
    const weight = handWeights.has(combo) ? handWeights.get(combo) : 1;
    hands.push({ hand, c: combo, w: weight, m: mix, ev });
  }
  return { parsed, hands };
}

function aggregate(hands, width) {
  const mix = Array(width).fill(0);
  const ev = Array(width).fill(0);
  let weightSum = 0;
  for (const hand of hands) {
    weightSum += hand.w;
    for (let i = 0; i < width; i++) {
      mix[i] += hand.w * hand.m[i];
      ev[i] += hand.w * hand.ev[i];
    }
  }
  if (!(weightSum > 0)) fail("hand weights sum to 0");
  for (let i = 0; i < width; i++) {
    mix[i] /= weightSum;
    ev[i] /= weightSum;
  }
  const roundedMix = normalizeMix(mix);
  const roundedEv = ev.map((value) => roundTo(value, 3));
  let best = 0;
  for (let i = 1; i < roundedEv.length; i++) {
    if (roundedEv[i] > roundedEv[best]) best = i;
  }
  let second = best === 0 ? 1 : 0;
  for (let i = 0; i < roundedEv.length; i++) {
    if (i !== best && roundedEv[i] > roundedEv[second]) second = i;
  }
  const dev = roundedEv.length < 2 ? 0 : roundTo(roundedEv[best] - roundedEv[second], 3);
  return { mix: roundedMix, ev: roundedEv, best, dev };
}

function normalizeMix(mix) {
  const rounded = mix.map((freq) => roundTo(freq, 3));
  const sum = roundTo(rounded.reduce((total, freq) => total + freq, 0), 3);
  const drift = roundTo(1 - sum, 3);
  if (Math.abs(drift) > 0.02) fail(`action mixes sum to ${sum}, expected ~1`);
  if (drift !== 0) {
    let index = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[index]) index = i;
    }
    rounded[index] = roundTo(rounded[index] + drift, 3);
  }
  return rounded;
}

function facingAction(path, pot) {
  if (path.length === 0) return null;
  const parsed = parseAction(path[path.length - 1], pot);
  if (parsed.a === "check" || parsed.a === "call" || parsed.a === "fold") return null;
  return parsed;
}

function idSuffix(spot, player, path) {
  const facing = facingAction(path, spot.pot);
  const hero = player === 0 ? spot.ip_position : spot.oop_position;
  if (spot.street === "flop" && spot.ip_position === "BTN" && spot.oop_position === "BB") {
    if (player === 0 && !facing) return "btn";
    if (player === 1 && !facing) return "bb_donk";
    if (player === 1 && facing) return "bb";
    if (player === 0 && facing) return "btn_vs_donk";
  }
  const pos = hero.toLowerCase();
  return facing ? `${pos}_vs_bet` : pos;
}

function drillIdFor(spot, player, facing) {
  if (spot.street === "flop" && spot.ip_position === "BTN" && spot.oop_position === "BB") {
    if (player === 0 && !facing) return "btn_flop_cbet";
    if (player === 1 && !facing) return "bb_flop_donk";
    if (player === 1 && facing) return "bb_vs_cbet";
    if (player === 0 && facing) return "btn_vs_donk";
  }
  return player === 0 ? `${spot.street}_ip` : `${spot.street}_oop`;
}

function humanFacing(actor, facing) {
  if (facing.a.startsWith("bet_")) return `${actor} bet ${facing.a.slice(4)}%`;
  if (facing.a.startsWith("raise_")) return `${actor} raise ${facing.a.slice(6)}%`;
  return `${actor} ${facing.a}`;
}

function lineFor(spot, player, facing) {
  const hero = player === 0 ? spot.ip_position : spot.oop_position;
  const other = player === 0 ? spot.oop_position : spot.ip_position;
  const streetLabel = spot.street[0].toUpperCase() + spot.street.slice(1);
  const tail = [];
  if (facing) tail.push(humanFacing(other, facing));
  tail.push(`Hero ${hero} to act`);
  const pre = spot.preflop_line_steps;
  const line_steps = [...pre, streetLabel, ...tail];
  const head = pre.join(" → ");
  const rest = [streetLabel, ...tail].join(" · ");
  const line = head ? `${head} · ${rest}` : rest;
  return { line, line_steps };
}

function pathKey(path) {
  return path.join("\n");
}

function collectActionNodes(node, path, acc) {
  if (!node || node.node_type !== "action_node") fail("expected an action_node");
  if (node.player !== 0 && node.player !== 1) fail("action node player must be 0 (IP) or 1 (OOP)");
  acc.push({ node, path: [...path] });
  const children = node.childrens ?? {};
  if (Array.isArray(children)) {
    fail("childrens must be an object keyed by action string (TexasSolver PCfrSolver::dumps)");
  }
  if (children && typeof children === "object") {
    const actionSet = new Set(node.actions ?? []);
    for (const key of Object.keys(children)) {
      if (!actionSet.has(key)) fail(`childrens key "${key}" is not in actions`);
    }
    for (const action of node.actions ?? []) {
      const child = children[action];
      if (child == null) continue;
      if (child.node_type === "chance_node") continue;
      if (child.node_type === "terminal_node" || child.node_type === "showdown_node") continue;
      if (child.node_type !== "action_node") fail(`unsupported child node_type "${child.node_type}"`);
      collectActionNodes(child, [...path, action], acc);
    }
  }
}

function spotKey(spot, player, facing) {
  const board = spot.board.join("");
  const side = player === 0 ? "ip" : "oop";
  const face = facing ? facing.a : "none";
  return `${spot.street}|${board}|${spot.pot}|${side}|${face}`;
}

/**
 * @param {unknown} dump
 * @returns {{ files: Record<string, string>, nodes: object[], compact: object, cdn: object }}
 */
export function renderPack(dump) {
  const env = validateEnvelope(dump);
  const { spot } = env;
  const boardIds = new Set(spot.board.map((card) => cardId(card)));
  const boardSlug = spot.board.map((card) => card.toLowerCase()).join("");
  const collected = [];
  collectActionNodes(env.tree, [], collected);

  const records = collected.map((rec) => {
    const facing = facingAction(rec.path, spot.pot);
    const id = `n_${spot.ip_position.toLowerCase()}_${spot.oop_position.toLowerCase()}_${spot.street[0]}_${boardSlug}_${idSuffix(spot, rec.node.player, rec.path)}`;
    return { ...rec, facing, id };
  });
  const ids = new Set();
  for (const rec of records) {
    if (ids.has(rec.id)) fail(`duplicate node id ${rec.id}`);
    ids.add(rec.id);
  }
  const idByPath = new Map(records.map((rec) => [pathKey(rec.path), rec.id]));

  const betLabels = [];
  const nodes = [];
  const strategyNodes = [];
  let reachParent = new Map([[pathKey([]), 1]]);

  for (const rec of records) {
    const { parsed, hands } = handsFromNode(rec.node, spot.pot, boardIds, env.handWeights);
    const agg = aggregate(hands, parsed.length);
    const nf = roundTo(reachParent.get(pathKey(rec.path)) ?? 1, 3);
    if (!(nf > 0)) fail(`node reach for ${rec.id} is not positive`);
    const hero = rec.node.player === 0 ? spot.ip_position : spot.oop_position;
    const villain = rec.node.player === 0 ? spot.oop_position : spot.ip_position;
    const actions = parsed.map((action, index) => {
      const out = { a: action.a, m: agg.mix[index], ev: agg.ev[index] };
      if (action.sizeBb != null) out.sizeBb = action.sizeBb;
      const label = action.a.startsWith("bet_")
        ? action.a.slice(4)
        : action.a.startsWith("raise_")
          ? action.a.slice(6)
          : null;
      if (label && !betLabels.includes(label)) betLabels.push(label);
      return out;
    });
    const children = rec.node.childrens ?? {};
    const kids = parsed.map((action) => {
      const child = children[action.raw];
      if (!child || child.node_type !== "action_node") return null;
      return idByPath.get(pathKey([...rec.path, action.raw])) ?? null;
    });
    const { line, line_steps } = lineFor(spot, rec.node.player, rec.facing);
    const combos = [...hands]
      .sort((a, b) => a.c - b.c)
      .map((hand) => ({ c: hand.c, w: hand.w }));
    const node = {
      id: rec.id,
      st: spot.street,
      hp: hero,
      vp: villain,
      ip: rec.node.player === 0,
      tx: textureTag(spot.board),
      bd: spot.board,
      pot: spot.pot,
      eff: spot.effective_stack,
      nf,
      wu: false,
      best: agg.best,
      dev: agg.dev,
      actions,
      kids,
      combos,
      drill_id: drillIdFor(spot, rec.node.player, rec.facing),
      line,
      line_steps,
    };
    if (rec.facing) node.prior_action = rec.facing.a;
    nodes.push(node);

    const nextReach = new Map(reachParent);
    parsed.forEach((action, index) => {
      nextReach.set(pathKey([...rec.path, action.raw]), roundTo(nf * agg.mix[index], 3));
    });
    reachParent = nextReach;

    strategyNodes.push({
      id: rec.id,
      spot_key: spotKey(spot, rec.node.player, rec.facing),
      actions: actions.map((action) => action.a),
      hands: [...hands]
        .sort((a, b) => a.c - b.c)
        .map((hand) => ({
          hand: hand.hand,
          c: hand.c,
          w: hand.w,
          m: hand.m.map((freq) => roundTo(freq, 6)),
          ev: hand.ev.map((value) => roundTo(value, 6)),
        })),
    });
  }

  if (betLabels.length === 0) fail("pack needs at least one bet or raise size");

  const compact = {
    id: env.pack.id,
    name: env.pack.name,
    version: env.pack.version,
    formatVersion: 1,
    format: "drill_node_v1",
    table_size: spot.table_size,
    game: "nlhe_cash",
    abstraction: spot.abstraction,
    line: `${spot.ip_position}_vs_${spot.oop_position}_SRP`,
    game_lines: [spot.street],
    provenance: {
      kind: "offline_solver_dump",
      practice: true,
      ships_solver_code: false,
      note: `Emitted by tools/pack-builder from a checked-in TexasSolver-style dump. Not a live solve and not solver source. provenance.solvers is on ${env.pack.version}/manifest.json.`,
    },
    nodes: nodes.map((node) => node.id),
  };

  const strategiesText = pretty({
    spot_key_schema: "street|board|pot_bb|ip_oop|facing",
    nodes: strategyNodes,
  });
  const indexText = `${nodes.map((node) => JSON.stringify(node)).join("\n")}\n`;
  const strategiesHash = sha256(strategiesText);
  const indexHash = sha256(indexText);

  const cdn = {
    schema_version: 1,
    pack_id: env.pack.id,
    version: env.pack.version,
    format: "cash",
    table_size: spot.table_size,
    game_lines: [spot.street],
    abstraction: spot.abstraction,
    stack_depths_bb: [spot.stack_bb],
    bet_sizes: { labels: betLabels },
    icm: null,
    blobs: {
      strategies: {
        sha256: strategiesHash,
        bytes: Buffer.byteLength(strategiesText, "utf8"),
        content_type: "application/json",
      },
      node_index: {
        sha256: indexHash,
        bytes: Buffer.byteLength(indexText, "utf8"),
        content_type: "application/x-pack-node-index",
      },
    },
    node_index_format: "jsonl_v1",
    spot_key_schema: "street|board|pot_bb|ip_oop|facing",
    provenance: {
      built_at: env.built_at,
      builder: BUILDER,
      solvers: [
        {
          name: env.solver.name,
          version: env.solver.version,
          license: "AGPL-3.0",
          role: env.solver.role,
        },
      ],
      ships_solver_code: false,
      source_note: `Emitted from a checked-in ${env.solver.name} dump envelope (dumps() strategy + dump_evs-shaped evs). CI does not install or run a solver. This artifact is pack data only.`,
    },
    license: {
      pack_data: "Proprietary",
      notice:
        "Strategy frequencies are trainer data. AGPL solvers were used offline only and are not included.",
    },
  };

  const files = {
    "manifest.json": pretty(compact),
    [`${env.pack.version}/manifest.json`]: pretty(cdn),
    [`${env.pack.version}/blobs/${strategiesHash}`]: strategiesText,
    [`${env.pack.version}/blobs/${indexHash}`]: indexText,
  };
  for (const node of nodes) files[`nodes/${node.id}.json`] = pretty(node);
  return { files, nodes, compact, cdn };
}

export function walkFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(abs, base));
    else if (ent.isFile()) out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

export function diffPackFiles(dir, files) {
  const diffs = [];
  if (!existsSync(dir)) {
    diffs.push(`missing directory ${dir}`);
    return diffs;
  }
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) diffs.push(`missing ${rel}`);
    else if (readFileSync(abs, "utf8") !== text) diffs.push(`changed ${rel}`);
  }
  for (const rel of walkFiles(dir)) {
    if (!Object.prototype.hasOwnProperty.call(files, rel)) diffs.push(`extra ${rel}`);
  }
  return diffs;
}

export function writePackFiles(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  for (const rel of walkFiles(dir)) {
    if (!Object.prototype.hasOwnProperty.call(files, rel)) rmSync(join(dir, rel));
  }
}
