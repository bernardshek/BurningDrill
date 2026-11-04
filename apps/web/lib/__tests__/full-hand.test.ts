import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DrillNode, DrillStreet } from "../drill-node";
import { followKid, fullHandLine, gradeWalkerAction, walkSummary, type WalkActor, type WalkDecision } from "../hand-walker";

const packDir = join(process.cwd(), "../../packs/toy-6max-multistreet");
const weeklockPath = join(process.cwd(), "../../packs/weeklock/weeklock.json");

const STREET_ORDER: Record<DrillStreet, number> = {
  preflop: 0,
  flop: 1,
  turn: 2,
  river: 3,
};

function loadPack(): { manifest: { nodes: string[]; provenance: { ships_solver_code: boolean }; game_lines: string[]; version: string }; nodes: DrillNode[] } {
  const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
  const nodes = (manifest.nodes as string[]).map(
    (id) => JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")) as DrillNode,
  );
  return { manifest, nodes };
}

function byId(nodes: DrillNode[]): Map<string, DrillNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

describe("toy-6max-multistreet Full Hand", () => {
  const { manifest, nodes } = loadPack();
  const ids = byId(nodes);

  it("ships no solver code and leaves the week lock allowlist unchanged", () => {
    expect(manifest.provenance.ships_solver_code).toBe(false);
    expect(manifest.game_lines).toEqual(["flop", "turn", "river"]);
    expect(manifest.version).toBe("0.1.1");
    const weeklock = JSON.parse(readFileSync(weeklockPath, "utf8")) as { allowed_drill_ids: string[] };
    expect(weeklock.allowed_drill_ids).toEqual(["btn_flop_cbet", "bb_vs_cbet"]);
  });

  it("follows only pack edges, and each child line continues its parent", () => {
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    expect(nodes).toHaveLength(32);
    for (const node of nodes) {
      expect(node.drill_id).toBe("btn_bb_srp_full");
      expect(node.kids).toHaveLength(node.actions.length);
      node.kids.forEach((kid, index) => {
        if (!kid) return;
        const child = ids.get(kid);
        expect(child, `${node.id} → ${kid}`).toBeDefined();
        if (!child) return;
        expect(STREET_ORDER[child.st]).toBeGreaterThanOrEqual(STREET_ORDER[node.st]);
        expect(child.bd.slice(0, node.bd.length)).toEqual(node.bd);
        if (child.st === node.st) {
          expect(child.bd).toEqual(node.bd);
        } else {
          expect(child.bd).toHaveLength(node.bd.length + 1);
        }
        const prior = priorSteps(node.line_steps);
        expect(child.line_steps?.slice(0, prior.length)).toEqual(prior);
        expect(node.actions[index]).toBeDefined();
      });
    }
  });

  it("deals four BTN flop roots and reaches the river on check-check and called c-bet", () => {
    const roots = nodes.filter((node) => node.st === "flop" && node.hp === "BTN");
    expect(roots.map((node) => node.id).sort()).toEqual([
      "ms_0_ahkd2c_flop",
      "ms_1_ah7d2c_flop",
      "ms_2_ksqd2h_flop",
      "ms_3_qh7d2c_flop",
    ]);

    const root = ids.get("ms_0_ahkd2c_flop");
    expect(root).toBeDefined();
    if (!root) return;

    const checked = walk(nodes, root, [0, 0, 0]);
    expect(checked.node.st).toBe("river");
    expect(checked.node.hp).toBe("BTN");
    expect(checked.node.id).toBe("ms_0_ahkd2c_river_check");
    expect(checked.node.bd).toEqual(["Ah", "Kd", "2c", "3c", "4c"]);
    expect(checked.heroDecisions).toBe(2);
    expect(checked.line.endsWith("Turn → BTN Check → River")).toBe(true);
    expect(checked.line).toContain("BB Check");
    expect(checked.line).not.toContain("bet 33%");
    const riverCheck = gradeWalkerAction(checked.node, 0);
    expect(walkSummary([...checked.grades, { node: checked.node, grade: riverCheck, actionIndex: 0 }]).decisions).toBe(3);
    expect(followKid(nodes, checked.node, 0, "full_hand", "flop")).toBeNull();

    const called = walk(nodes, root, [1, 1, 0, 1]);
    expect(called.node.id).toBe("ms_0_ahkd2c_river_bet");
    expect(called.node.hp).toBe("BB");
    expect(called.node.st).toBe("river");
    expect(called.node.bd).toHaveLength(5);
    expect(called.heroDecisions).toBe(3);
    expect(called.line).toContain("BTN Bet 33%");
    expect(called.line).toContain("BB Call");
    expect(followKid(nodes, called.node, 0, "full_hand", "flop")).toBeNull();
    expect(followKid(nodes, called.node, 1, "full_hand", "flop")).toBeNull();
    expect(followKid(nodes, called.node, 2, "full_hand", "flop")).toBeNull();

    const turnCheck = ids.get("ms_0_ahkd2c_turn_check");
    const turnCall = ids.get("ms_0_ahkd2c_turn_call");
    expect(turnCheck?.kids[1]).toBeNull();
    expect(turnCall?.kids[1]).toBeNull();
    expect(followKid(nodes, root, 2, "full_hand", "flop")).toBeNull();
  });

  it("stops Street mode before the next street", () => {
    const root = ids.get("ms_1_ah7d2c_flop");
    expect(root).toBeDefined();
    if (!root) return;
    const villain = followKid(nodes, root, 0, "street", "flop");
    expect(villain?.st).toBe("flop");
    expect(villain?.hp).toBe("BB");
    if (!villain) return;
    expect(followKid(nodes, villain, 0, "street", "flop")).toBeNull();
    expect(followKid(nodes, villain, 0, "full_hand", "flop")?.st).toBe("turn");
  });
});

/** Drop a trailing "to act" prompt so the child line can record the action that was taken. */
function priorSteps(steps: string[] | undefined): string[] {
  const list = steps ?? [];
  const last = list[list.length - 1];
  if (last && last.endsWith("to act")) return list.slice(0, -1);
  return list;
}

function walk(nodes: DrillNode[], root: DrillNode, indexes: number[]) {
  let node = root;
  const events: WalkActor[] = [];
  const grades: WalkDecision[] = [];
  for (const index of indexes) {
    const action = node.actions[index];
    if (!action) throw new Error(`${node.id} missing action ${index}`);
    if (node.hp === "BTN") {
      grades.push({ node, grade: gradeWalkerAction(node, index), actionIndex: index });
    }
    events.push({ position: node.hp, action: action.a, sizeBb: action.sizeBb, street: node.st });
    const next = followKid(nodes, node, index, "full_hand", "flop");
    if (!next) return { node, events, grades, heroDecisions: grades.length, line: fullHandLine(root, events, node), ended: true };
    node = next;
  }
  return { node, events, grades, heroDecisions: grades.length, line: fullHandLine(root, events, node), ended: false };
}
