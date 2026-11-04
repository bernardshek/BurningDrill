import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderCoachShelf } from "./chart-shelf.mjs";
import {
  DumpError,
  comboIndexFromHand,
  diffPackFiles,
  parseAction,
  renderPack,
  walkFiles,
} from "./lib.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "../..");
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures/texassolver-flop-srp.json"), "utf8"),
);

test("combo index matches the drill uint16 bijection", () => {
  assert.equal(comboIndexFromHand("AhKd"), 1270);
  assert.equal(comboIndexFromHand("KdAh"), 1270);
  assert.equal(comboIndexFromHand("7c6c"), 206);
});

test("maps TexasSolver action strings onto drill action ids", () => {
  assert.deepEqual(parseAction("CHECK", 6.5), { a: "check" });
  assert.deepEqual(parseAction("BET 2.145000", 6.5), { a: "bet_33", sizeBb: 2.145 });
  assert.deepEqual(parseAction("BET 4.875000", 6.5), { a: "bet_75", sizeBb: 4.875 });
});

test("fixture emit matches the committed proof pack and its public mirror", () => {
  const { files, cdn, nodes } = renderPack(fixture);
  assert.equal(cdn.provenance.ships_solver_code, false);
  assert.deepEqual(cdn.provenance.solvers, [
    {
      name: "TexasSolver",
      version: "0.2.0",
      license: "AGPL-3.0",
      role: "offline_solve",
    },
  ]);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].id, "n_btn_bb_f_qsjh2h_bb_donk");
  assert.equal(nodes[0].drill_id, "bb_flop_donk");
  assert.equal(nodes[0].ip, false);
  assert.equal(nodes[0].kids[0], "n_btn_bb_f_qsjh2h_btn");
  assert.equal(nodes[0].kids[1], null);
  assert.equal(nodes[1].drill_id, "btn_flop_cbet");
  assert.equal(nodes[1].ip, true);
  assert.equal(nodes[1].hp, "BTN");
  assert.equal(nodes[1].actions[0].m, 0.1);
  assert.equal(nodes[1].actions[1].a, "bet_33");
  assert.equal(nodes[1].actions[1].m, 0.75);
  assert.equal(nodes[1].actions[1].ev, 0.8);
  assert.equal(nodes[1].actions[2].m, 0.15);
  assert.equal(nodes[1].best, 1);
  assert.equal(nodes[1].tx, "twotone_broadway");
  assert.deepEqual(nodes[1].kids, [null, null, null]);
  const packDiff = diffPackFiles(join(root, "packs/solver-flop-proof"), files);
  assert.deepEqual(packDiff, []);
  const publicDiff = diffPackFiles(join(root, "apps/web/public/packs/solver-flop-proof"), files);
  assert.deepEqual(publicDiff, []);
});

test("does not walk chance nodes into later streets", () => {
  const dump = structuredClone(fixture);
  dump.tree.childrens.CHECK = {
    node_type: "chance_node",
    deal_number: 1,
    dealcards: {
      "2c": {
        node_type: "action_node",
        player: 0,
        actions: ["CHECK"],
        strategy: { actions: ["CHECK"], strategy: { AhKd: [1] } },
        evs: { actions: ["CHECK"], evs: { AhKd: [1] } },
      },
    },
  };
  const { nodes } = renderPack(dump);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].st, "flop");
  assert.deepEqual(nodes[0].kids, [null, null]);
});

test("rejects a strategy dump that has no per-action evs", () => {
  const dump = structuredClone(fixture);
  delete dump.tree.evs;
  assert.throws(() => renderPack(dump), (error) => error instanceof DumpError && /evs/.test(error.message));
});

test("rejects solver code and solvers outside the offline dump list", () => {
  const shipped = structuredClone(fixture);
  shipped.ships_solver_code = true;
  assert.throws(() => renderPack(shipped), /ships_solver_code/);
  const deepfold = structuredClone(fixture);
  deepfold.solver = { ...deepfold.solver, name: "DeepFold" };
  assert.throws(() => renderPack(deepfold), /unsupported solver/);
});

test("weights hands when aggregating mix and ev", () => {
  const dump = structuredClone(fixture);
  dump.tree.childrens = undefined;
  dump.hand_weights = { AhKd: 1, AsKs: 3 };
  dump.tree.strategy.strategy = { AhKd: [1, 0], AsKs: [0, 1] };
  dump.tree.evs.evs = { AhKd: [1, 0], AsKs: [0, 4] };
  delete dump.tree.strategy.strategy["9c9d"];
  delete dump.tree.strategy.strategy["7c6c"];
  delete dump.tree.evs.evs["9c9d"];
  delete dump.tree.evs.evs["7c6c"];
  const { nodes } = renderPack(dump);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].actions[0].m, 0.25);
  assert.equal(nodes[0].actions[1].m, 0.75);
  assert.equal(nodes[0].actions[0].ev, 0.25);
  assert.equal(nodes[0].actions[1].ev, 3);
  assert.equal(nodes[0].best, 1);
});

test("coach shelf emit matches the committed pack and does not ship solver code", () => {
  const spec = JSON.parse(readFileSync(join(here, "fixtures/coach-shelf.json"), "utf8"));
  const { files, compact, nodes } = renderCoachShelf(spec, {
    root,
    dumpDir: join(here, "fixtures"),
  });
  assert.equal(compact.provenance.ships_solver_code, false);
  assert.equal(nodes.some((node) => String(node.drill_id).startsWith("rfi_")), false);
  assert.equal(nodes.some((node) => node.drill_id === "bb_flop_donk" || node.drill_id === "btn_vs_donk"), false);
  const order = [];
  for (const node of nodes) {
    if (!order.includes(node.drill_id)) order.push(node.drill_id);
  }
  assert.deepEqual(order, [
    "vs3bet_oop",
    "vs3bet_ip",
    "vs4bet_jam",
    "vs4bet_22",
    "btn_delayed_barrel",
  ]);
  const names = Object.keys(files);
  assert.ok(names.every((name) => !/\.(cpp|cc|h|hpp|exe|wasm|so|dylib|dll)$/i.test(name)));
  assert.deepEqual(diffPackFiles(join(root, "packs/coach-shelf"), files), []);
  assert.deepEqual(diffPackFiles(join(root, "apps/web/public/packs/coach-shelf"), files), []);
});

test("proof pack contains no solver binary or source", () => {
  const names = walkFiles(join(root, "packs/solver-flop-proof"));
  assert.ok(names.length > 0);
  assert.ok(names.every((name) => !/\.(cpp|cc|h|hpp|exe|wasm|so|dylib|dll)$/i.test(name)));
});

test("ci does not install a solver", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /pack-builder-dump/);
  assert.match(ci, /NO solver install/);
  assert.doesNotMatch(ci, /bupticybee|wget |curl |apt-get|pip install/i);
});
