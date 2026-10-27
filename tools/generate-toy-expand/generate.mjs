#!/usr/bin/env node
/**
 * Hybrid toy expand emitter (research/urgent-infinite-feel-brief-2026-10-22.md).
 *
 * Reads packs/toy-6max-expand/flops-25.json + pinned BTN open / BB defend categories,
 * emits compact DrillNode JSON (uint16 c + w) under packs/toy-6max-expand/nodes/.
 *
 * Variety = pack size × combo deal. Frequencies/EVs are *toy-consistent* (argmax EV =
 * best, mixes ≈1, close spots mixed in) — NOT solver GTO. Replace nodes via offline
 * pack-builder / TexasSolver later; never invent outside this list at sample time.
 *
 * Usage: node tools/generate-toy-expand/generate.mjs
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "../..");
const packDir = join(root, "packs/toy-6max-expand");
const nodesDir = join(packDir, "nodes");

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["c", "d", "h", "s"];
const COMBO_COUNT = 1326;
const TARGET_COMBOS_LO = 60;
const TARGET_COMBOS_HI = 120;

const RANK_I = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const SUIT_I = Object.fromEntries(SUITS.map((s, i) => [s, i]));

function cardId(card) {
  const ri = RANK_I[card[0]];
  const si = SUIT_I[card[1]];
  if (ri == null || si == null) throw new Error(`bad card ${card}`);
  return ri * 4 + si;
}
function cardStr(id) {
  return RANKS[Math.floor(id / 4)] + SUITS[id % 4];
}
function comboIndex(a, b) {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return (hi * (hi - 1)) / 2 + lo;
}
function cardsFromCombo(c) {
  let hi = Math.ceil((1 + Math.sqrt(1 + 8 * c)) / 2);
  while ((hi * (hi - 1)) / 2 > c) hi -= 1;
  while (((hi + 1) * hi) / 2 <= c) hi += 1;
  const lo = c - (hi * (hi - 1)) / 2;
  return [lo, hi];
}
function handFromCombo(c) {
  const [lo, hi] = cardsFromCombo(c);
  return cardStr(hi) + cardStr(lo);
}
function blocked(c, boardIds) {
  const [a, b] = cardsFromCombo(c);
  return boardIds.has(a) || boardIds.has(b);
}

/** Mulberry32 seeded PRNG for reproducible packs. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pinned category ranges (100bb SRP toy). Expanded to specific combos at emit.
 * Not GTO — study scaffolding until solver dumps replace nodes.
 */
const BTN_OPEN_CATS = [
  // pairs
  "22+",
  // suited broadway+
  "A2s+",
  "K2s+",
  "Q5s+",
  "J7s+",
  "T7s+",
  "97s+",
  "87s",
  "76s",
  "65s",
  // offsuit
  "A2o+",
  "K9o+",
  "Q9o+",
  "J9o+",
  "T9o",
];

const BB_DEFEND_CATS = [
  "22+",
  "A2s+",
  "K2s+",
  "Q4s+",
  "J6s+",
  "T6s+",
  "96s+",
  "85s+",
  "75s+",
  "64s+",
  "54s",
  "A2o+",
  "K7o+",
  "Q8o+",
  "J8o+",
  "T8o+",
  "98o",
];

function expandCategory(cat) {
  // Returns list of {r1,r2,suited} specs; suited true/false/null(pair)
  const out = [];
  if (/^\d\d\+$/.test(cat) || /^[2-9TJQKA]{2}\+$/.test(cat) && cat[0] === cat[1]) {
    // pairs like 22+
    const low = RANK_I[cat[0]];
    for (let r = low; r < 13; r++) out.push({ r1: r, r2: r, suited: null });
    return out;
  }
  const m = cat.match(/^([2-9TJQKA])([2-9TJQKA])(s|o)(\+)?$/);
  if (!m) throw new Error(`bad cat ${cat}`);
  const hi = RANK_I[m[1]];
  const lo = RANK_I[m[2]];
  const suited = m[3] === "s";
  const plus = Boolean(m[4]);
  if (!plus) {
    out.push({ r1: hi, r2: lo, suited });
    return out;
  }
  // A2s+ means A2s..AKs (fix A, kicker from 2 up)
  for (let k = lo; k < hi; k++) out.push({ r1: hi, r2: k, suited });
  return out;
}

function combosFromSpec(spec) {
  const ids = [];
  if (spec.suited === null) {
    // pair: C(4,2)=6
    const base = spec.r1 * 4;
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        ids.push(comboIndex(base + s1, base + s2));
      }
    }
    return ids;
  }
  const hiBase = spec.r1 * 4;
  const loBase = spec.r2 * 4;
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (spec.suited && s1 !== s2) continue;
      if (!spec.suited && s1 === s2) continue;
      ids.push(comboIndex(hiBase + s1, loBase + s2));
    }
  }
  return ids;
}

function expandRange(cats) {
  const set = new Set();
  for (const cat of cats) {
    for (const spec of expandCategory(cat)) {
      for (const c of combosFromSpec(spec)) set.add(c);
    }
  }
  return set;
}

const BTN_RANGE = expandRange(BTN_OPEN_CATS);
const BB_RANGE = expandRange(BB_DEFEND_CATS);

function textureTag(bd) {
  const ranks = bd.map((c) => RANK_I[c[0]]);
  const suits = bd.map((c) => c[1]);
  const uniqSuits = new Set(suits).size;
  const sorted = [...ranks].sort((a, b) => b - a);
  const paired = sorted[0] === sorted[1] || sorted[1] === sorted[2] || sorted[0] === sorted[2];
  const monotone = uniqSuits === 1;
  const twotone = uniqSuits === 2;
  const connected = sorted[0] - sorted[2] <= 4 && new Set(sorted).size === 3;
  const high = sorted[0] >= 12 ? "a_high" : sorted[0] >= 10 ? "broadway" : sorted[0] >= 7 ? "mid" : "low";
  if (monotone) return `mono_${high}`;
  if (paired) return `paired_${high}`;
  if (connected && twotone) return `connected_tt_${high}`;
  if (connected) return `connected_${high}`;
  if (twotone) return `twotone_${high}`;
  return `dry_${high}`;
}

/**
 * Toy weight for a combo given board — higher for made/strong draws.
 * Internally consistent scaffolding only.
 */
function toyWeight(c, boardIds, boardRanks) {
  const [a, b] = cardsFromCombo(c);
  const ra = Math.floor(a / 4);
  const rb = Math.floor(b / 4);
  const sa = a % 4;
  const sb = b % 4;
  let w = 0.15;
  if (ra === rb) w += 0.55 + ra * 0.03; // pairs
  if (ra >= 11 || rb >= 11) w += 0.25; // broadway piece
  if (ra === 12 || rb === 12) w += 0.2; // ace
  if (sa === sb) w += 0.18; // suited
  if (Math.abs(ra - rb) === 1) w += 0.12; // connector
  if (Math.abs(ra - rb) === 2) w += 0.05;
  // board interaction
  for (const br of boardRanks) {
    if (ra === br || rb === br) w += 0.45; // hit pair
  }
  // overcards
  const top = Math.max(...boardRanks);
  if (ra > top) w += 0.08;
  if (rb > top) w += 0.08;
  return w;
}

function pickCombos(rangeSet, boardIds, boardRanks, rng, target) {
  const scored = [];
  for (const c of rangeSet) {
    if (blocked(c, boardIds)) continue;
    const w = toyWeight(c, boardIds, boardRanks);
    // jitter so boards don't share identical top-N
    const jitter = 0.85 + rng() * 0.3;
    scored.push({ c, w: w * jitter });
  }
  scored.sort((x, y) => y.w - x.w);
  const n = Math.min(
    scored.length,
    TARGET_COMBOS_LO + Math.floor(rng() * (TARGET_COMBOS_HI - TARGET_COMBOS_LO + 1)),
  );
  const take = Math.max(TARGET_COMBOS_LO, Math.min(target ?? n, scored.length));
  const chosen = scored.slice(0, take);
  // normalize-ish weights to ~0.2..1.0 band
  const maxW = chosen[0]?.w ?? 1;
  return chosen.map(({ c, w }) => ({
    c,
    w: Math.round(Math.max(0.15, w / maxW) * 1000) / 1000,
  }));
}

function normalizeMix(raw) {
  const sum = raw.reduce((s, x) => s + x, 0);
  return raw.map((x) => Math.round((x / sum) * 1000) / 1000);
}

/**
 * Thin action set: check / bet_33 [ / bet_75 ].
 * Mix + EV internally consistent: best = argmax EV; mixes sum ≈1.
 */
function makeActions(kind, rng, closeBias) {
  // kind: 'btn_cbet' | 'bb_donk' | 'bb_vs_cbet' | 'btn_vs_donk'
  // bb_donk reuses the check / bet_33 / bet_75 toy mixes (OOP lead).
  // btn_vs_donk reuses fold / call / raise facing a 33% bet.
  const wantClose = closeBias || rng() < 0.35;
  if (kind === "btn_cbet" || kind === "bb_donk") {
    if (wantClose) {
      // close check vs bet33
      const m = normalizeMix([0.42 + rng() * 0.16, 0.42 + rng() * 0.16]);
      // tiny EV gap
      const gap = 0.03 + rng() * 0.05;
      const checkEv = 0.08 + rng() * 0.25;
      const betBetter = rng() < 0.55;
      const actions = [
        { a: "check", m: m[0], ev: betBetter ? checkEv : checkEv + gap },
        { a: "bet_33", m: m[1], ev: betBetter ? checkEv + gap : checkEv, sizeBb: 2.2 },
      ];
      return finalize(actions);
    }
    // clearer c-bet or check-heavy
    if (rng() < 0.55) {
      const m = normalizeMix([0.25 + rng() * 0.15, 0.55 + rng() * 0.2, 0.08 + rng() * 0.1]);
      const base = 0.15 + rng() * 0.3;
      const actions = [
        { a: "check", m: m[0], ev: base },
        { a: "bet_33", m: m[1], ev: base + 0.12 + rng() * 0.2, sizeBb: 2.2 },
        { a: "bet_75", m: m[2], ev: base - 0.05 + rng() * 0.1, sizeBb: 4.9 },
      ];
      return finalize(actions);
    }
    const m = normalizeMix([0.55 + rng() * 0.25, 0.2 + rng() * 0.2]);
    const base = 0.1 + rng() * 0.2;
    const actions = [
      { a: "check", m: m[0], ev: base + 0.08 + rng() * 0.1 },
      { a: "bet_33", m: m[1], ev: base, sizeBb: 2.2 },
    ];
    return finalize(actions);
  }
  // Facing bet_33 — fold / call / raise (bb_vs_cbet and btn_vs_donk).
  // Check isn't legal facing a bet. raise_2.5x stays the thin toy raise.
  if (kind !== "bb_vs_cbet" && kind !== "btn_vs_donk") {
    throw new Error(`unknown action kind ${kind}`);
  }
  if (wantClose) {
    const m = normalizeMix([0.35 + rng() * 0.15, 0.35 + rng() * 0.2, 0.1 + rng() * 0.1]);
    const gap = 0.03 + rng() * 0.05;
    const callEv = -0.05 + rng() * 0.2;
    const callBest = rng() < 0.5;
    const actions = [
      { a: "fold", m: m[0], ev: 0 },
      { a: "call", m: m[1], ev: callBest ? callEv + gap : callEv },
      { a: "raise_2.5x", m: m[2], ev: callBest ? callEv : callEv + gap, sizeBb: 7.5 },
    ];
    return finalize(actions);
  }
  const m = normalizeMix([0.45 + rng() * 0.25, 0.3 + rng() * 0.2, 0.05 + rng() * 0.1]);
  const callEv = -0.1 + rng() * 0.35;
  const actions = [
    { a: "fold", m: m[0], ev: 0 },
    { a: "call", m: m[1], ev: callEv },
    { a: "raise_2.5x", m: m[2], ev: callEv - 0.15 + rng() * 0.25, sizeBb: 7.5 },
  ];
  return finalize(actions);
}

function finalize(actions) {
  // ensure mixes sum ~1
  const mix = normalizeMix(actions.map((a) => a.m));
  const out = actions.map((a, i) => {
    const o = { a: a.a, m: mix[i], ev: Math.round(a.ev * 1000) / 1000 };
    if (a.sizeBb != null) o.sizeBb = a.sizeBb;
    return o;
  });
  let best = 0;
  for (let i = 1; i < out.length; i++) {
    if (out[i].ev > out[best].ev) best = i;
  }
  let second = -Infinity;
  for (let i = 0; i < out.length; i++) {
    if (i === best) continue;
    second = Math.max(second, out[i].ev);
  }
  const dev = Math.round(Math.max(0, out[best].ev - (second === -Infinity ? out[best].ev : second)) * 1000) / 1000;
  const wu = out[best].m >= 0.95 && dev >= 0.15;
  return { actions: out, best, dev, wu };
}


const DRILL_BTN = "btn_flop_cbet";
const DRILL_BB = "bb_vs_cbet";
const DRILL_BB_DONK = "bb_flop_donk";
const DRILL_BTN_VS_DONK = "btn_vs_donk";
const PACK_VERSION = "0.5.0";

function lineForBtn() {
  const steps = [
    "BTN open 2.5bb",
    "BB call",
    "Flop",
    "Hero BTN to act",
  ];
  return {
    drill_id: DRILL_BTN,
    line_steps: steps,
    line: "BTN open 2.5bb → BB call · Flop · Hero BTN to act",
  };
}

function lineForBb() {
  const steps = [
    "BTN open 2.5bb",
    "BB call",
    "Flop",
    "BTN bet 33%",
    "Hero BB to act",
  ];
  return {
    drill_id: DRILL_BB,
    line_steps: steps,
    line: "BTN open 2.5bb → BB call · Flop · BTN bet 33% · Hero BB to act",
    prior_action: "bet_33",
  };
}

function lineForBbDonk() {
  const steps = [
    "BTN open 2.5bb",
    "BB call",
    "Flop",
    "Hero BB to act",
  ];
  return {
    drill_id: DRILL_BB_DONK,
    line_steps: steps,
    line: "BTN open 2.5bb → BB call · Flop · Hero BB to act",
  };
}

function lineForBtnVsDonk() {
  const steps = [
    "BTN open 2.5bb",
    "BB call",
    "Flop",
    "BB bet 33%",
    "Hero BTN to act",
  ];
  return {
    drill_id: DRILL_BTN_VS_DONK,
    line_steps: steps,
    line: "BTN open 2.5bb → BB call · Flop · BB bet 33% · Hero BTN to act",
    prior_action: "bet_33",
  };
}

function boardIdSlug(bd) {
  return bd.join("").toLowerCase();
}

function main() {
  const flopsDoc = JSON.parse(readFileSync(join(packDir, "flops-25.json"), "utf8"));
  const flops = flopsDoc.flops;
  if (flops.length < 25) throw new Error(`need ≥25 flops, got ${flops.length}`);

  if (existsSync(nodesDir)) rmSync(nodesDir, { recursive: true });
  mkdirSync(nodesDir, { recursive: true });

  const rng = mulberry32(0x25f10b); // fixed seed
  const nodes = [];
  let totalCombos = 0;

  for (let i = 0; i < flops.length; i++) {
    const bd = flops[i];
    const boardIds = new Set(bd.map(cardId));
    const boardRanks = bd.map((c) => RANK_I[c[0]]);
    const tx = textureTag(bd);
    const slug = boardIdSlug(bd);

    // Node 1: BTN IP c-bet (always)
    {
      const combos = pickCombos(BTN_RANGE, boardIds, boardRanks, rng);
      const { actions, best, dev, wu } = makeActions("btn_cbet", rng, i % 4 === 0);
      const id = `n_btn_bb_f_${slug}_btn`;
      const lineMeta = lineForBtn();
      const node = {
        id,
        st: "flop",
        hp: "BTN",
        vp: "BB",
        ip: true,
        tx,
        bd,
        pot: 6.5,
        eff: 100,
        nf: 1, // renormalized later
        wu,
        best,
        dev,
        actions,
        kids: actions.map(() => null),
        combos,
        drill_id: lineMeta.drill_id,
        line: lineMeta.line,
        line_steps: lineMeta.line_steps,
      };
      nodes.push(node);
      totalCombos += combos.length;
      writeFileSync(join(nodesDir, `${id}.json`), JSON.stringify(node, null, 2) + "\n");
    }

    // Node 2 (optional stretch): BB OOP vs c-bet — emit for every board (2 nodes/flop)
    {
      const combos = pickCombos(BB_RANGE, boardIds, boardRanks, rng);
      const { actions, best, dev, wu } = makeActions("bb_vs_cbet", rng, i % 5 === 0);
      const id = `n_btn_bb_f_${slug}_bb`;
      const lineMeta = lineForBb();
      const node = {
        id,
        st: "flop",
        hp: "BB",
        vp: "BTN",
        ip: false,
        tx,
        bd,
        pot: 8.7,
        eff: 97.8,
        nf: 1,
        wu,
        best,
        dev,
        actions,
        kids: actions.map(() => null),
        combos,
        drill_id: lineMeta.drill_id,
        line: lineMeta.line,
        line_steps: lineMeta.line_steps,
        prior_action: lineMeta.prior_action,
      };
      nodes.push(node);
      totalCombos += combos.length;
      writeFileSync(join(nodesDir, `${id}.json`), JSON.stringify(node, null, 2) + "\n");
    }
  }

  // Second pass: donk shelf. Runs after the c-bet nodes so the seeded mixes
  // for btn_flop_cbet / bb_vs_cbet stay the same (only nf is rewritten, 1/N).
  for (let i = 0; i < flops.length; i++) {
    const bd = flops[i];
    const boardIds = new Set(bd.map(cardId));
    const boardRanks = bd.map((c) => RANK_I[c[0]]);
    const tx = textureTag(bd);
    const slug = boardIdSlug(bd);

    // Node 3: BB OOP donk — check or lead into BTN (pot still the SRP flop pot).
    {
      const combos = pickCombos(BB_RANGE, boardIds, boardRanks, rng);
      const { actions, best, dev, wu } = makeActions("bb_donk", rng, i % 4 === 0);
      const id = `n_btn_bb_f_${slug}_bb_donk`;
      const lineMeta = lineForBbDonk();
      const node = {
        id,
        st: "flop",
        hp: "BB",
        vp: "BTN",
        ip: false,
        tx,
        bd,
        pot: 6.5,
        eff: 100,
        nf: 1,
        wu,
        best,
        dev,
        actions,
        kids: actions.map(() => null),
        combos,
        drill_id: lineMeta.drill_id,
        line: lineMeta.line,
        line_steps: lineMeta.line_steps,
      };
      nodes.push(node);
      totalCombos += combos.length;
      writeFileSync(join(nodesDir, `${id}.json`), JSON.stringify(node, null, 2) + "\n");
    }

    // Node 4: BTN IP faces the 33% donk — fold / call / raise.
    {
      const combos = pickCombos(BTN_RANGE, boardIds, boardRanks, rng);
      const { actions, best, dev, wu } = makeActions("btn_vs_donk", rng, i % 5 === 0);
      const id = `n_btn_bb_f_${slug}_btn_vs_donk`;
      const lineMeta = lineForBtnVsDonk();
      const node = {
        id,
        st: "flop",
        hp: "BTN",
        vp: "BB",
        ip: true,
        tx,
        bd,
        pot: 8.7,
        eff: 97.8,
        nf: 1,
        wu,
        best,
        dev,
        actions,
        kids: actions.map(() => null),
        combos,
        drill_id: lineMeta.drill_id,
        line: lineMeta.line,
        line_steps: lineMeta.line_steps,
        prior_action: lineMeta.prior_action,
      };
      nodes.push(node);
      totalCombos += combos.length;
      writeFileSync(join(nodesDir, `${id}.json`), JSON.stringify(node, null, 2) + "\n");
    }
  }

  // Uniform nf
  const nf = 1 / nodes.length;
  for (const n of nodes) {
    n.nf = Math.round(nf * 1e6) / 1e6;
    writeFileSync(join(nodesDir, `${n.id}.json`), JSON.stringify(n, null, 2) + "\n");
  }

  const manifest = {
    id: "toy-6max-expand",
    name: "Toy 6-max · 25-flop BTN vs BB SRP",
    version: PACK_VERSION,
    formatVersion: 1,
    format: "drill_node_v1",
    table_size: 6,
    game: "nlhe_cash",
    abstraction: "hu_after_folds",
    line: "BTN_vs_BB_SRP",
    provenance: {
      kind: "toy_hybrid",
      practice: true,
      ships_solver_code: false,
      note: "Toy-consistent mix/EV for study UX. Not solver GTO. Named drills (btn_flop_cbet / bb_vs_cbet / bb_flop_donk / btn_vs_donk) + line_steps for action chrome. True GTO needs offline solver expand later.",
    },
    flop_subset: "flops-25.json",
    nodes: nodes.map((n) => n.id),
  };
  writeFileSync(join(packDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const avg = totalCombos / nodes.length;
  const byDrill = {};
  for (const n of nodes) {
    byDrill[n.drill_id] = (byDrill[n.drill_id] || 0) + 1;
  }
  const summary = {
    nodes: nodes.length,
    flops: flops.length,
    totalCombos,
    avgCombosPerNode: Math.round(avg * 10) / 10,
    minCombos: Math.min(...nodes.map((n) => n.combos.length)),
    maxCombos: Math.max(...nodes.map((n) => n.combos.length)),
    btnRangeSize: BTN_RANGE.size,
    bbRangeSize: BB_RANGE.size,
    effectiveDealsApprox: Math.round(totalCombos),
    byDrill,
    version: PACK_VERSION,
  };
  writeFileSync(join(packDir, "emit-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main();
