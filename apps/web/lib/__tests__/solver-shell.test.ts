import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handFromComboIndex } from "../combo1326";
import { gradeDrillNode, type DrillNode } from "../drill-node";
import {
  buildSolverShellResponse,
  parseSolverShellQuery,
  projectSolverShellNode,
  projectSolverShellPack,
  SolverShellError,
} from "../solver-shell";
import {
  findPacksRoot,
  loadSolverShell,
  readSolverShellPackFromDisk,
} from "../solver-shell-load";

const packsRoot = join(process.cwd(), "../../packs");

function loadProofNode(id: string): DrillNode {
  return JSON.parse(
    readFileSync(join(packsRoot, "solver-flop-proof/nodes", `${id}.json`), "utf8"),
  ) as DrillNode;
}

describe("solver shell", () => {
  it("copies pack mix and EV and grades with gradeDrillNode", () => {
    const raw = loadProofNode("n_btn_bb_f_qsjh2h_btn");
    const view = projectSolverShellNode(raw);
    expect(view.bestAction).toBe("bet_33");
    expect(view.actions.map((action) => [action.id, action.mix, action.evBb, action.grade])).toEqual([
      ["check", 0.1, 0.2, "Wrong"],
      ["bet_33", 0.75, 0.8, "Best"],
      ["bet_75", 0.15, 0.7, "Correct"],
    ]);
    for (const action of view.actions) {
      const packed = raw.actions.find((candidate) => candidate.a === action.id);
      expect(packed).toBeTruthy();
      expect(action.mix).toBe(packed!.m);
      expect(action.evBb).toBe(packed!.ev);
      expect(action.evLossBb).toBe(gradeDrillNode(raw, action.id).evLossBb);
      expect(action.grade).toBe(gradeDrillNode(raw, action.id).label);
      expect(action.kid).toBeNull();
    }
    expect(view.range[0]).toEqual({
      hand: handFromComboIndex(raw.combos[0]!.c),
      weight: raw.combos[0]!.w,
    });
  });

  it("follows a pack kid and refuses packs that ship solver code", () => {
    expect(() =>
      projectSolverShellPack({
        id: "x",
        name: "x",
        version: "0.0.1",
        provenance: { ships_solver_code: true },
      }),
    ).toThrow(SolverShellError);
    expect(() =>
      projectSolverShellPack({ id: "x", name: "x", version: "0.0.1" }),
    ).toThrow(/ships_solver_code/);

    const loaded = readSolverShellPackFromDisk(packsRoot, "solver-flop-proof");
    expect(loaded.manifest.provenance?.ships_solver_code).toBe(false);
    const body = buildSolverShellResponse(loaded.manifest, loaded.nodes, {
      drillId: null,
      nodeId: "n_btn_bb_f_qsjh2h_bb_donk",
    });
    expect("nodes" in body).toBe(false);
    if ("nodes" in body) return;
    expect(body.liveSolve).toBe(false);
    expect(body.shipsSolverCode).toBe(false);
    expect(body.source).toBe("pack");
    expect(body.gradedBy).toBe("gradeDrillNode");
    expect(body.node.actions.find((action) => action.id === "check")?.kid).toBe(
      "n_btn_bb_f_qsjh2h_btn",
    );
    expect(body.node.actions.find((action) => action.id === "check")?.grade).toBe("Best");
  });

  it("lists a named drill without widening it to the rest of the pack", () => {
    const loaded = readSolverShellPackFromDisk(packsRoot, "toy-6max-expand");
    const catalog = buildSolverShellResponse(loaded.manifest, loaded.nodes, {
      drillId: "btn_flop_cbet",
      nodeId: null,
    });
    expect("nodes" in catalog).toBe(true);
    if (!("nodes" in catalog)) return;
    expect(catalog.nodes).toHaveLength(25);
    expect(catalog.nodes.every((node) => node.drillId === "btn_flop_cbet")).toBe(true);
    expect(catalog.drills.map((drill) => drill.id)).toEqual([
      "btn_flop_cbet",
      "bb_vs_cbet",
      "bb_flop_donk",
      "btn_vs_donk",
    ]);
    expect(catalog.node?.drillId).toBe("btn_flop_cbet");
    expect(() =>
      buildSolverShellResponse(loaded.manifest, loaded.nodes, {
        drillId: "bb_vs_cbet",
        nodeId: "n_btn_bb_f_ahkd2c_btn",
      }),
    ).toThrow(/not in drill/);
  });

  it("rejects unknown packs and ids that could escape the pack directory", () => {
    expect(() =>
      parseSolverShellQuery({ packId: "../weeklock", drillId: null, nodeId: null }),
    ).toThrow(/Unknown pack/);
    expect(() =>
      parseSolverShellQuery({ packId: "weeklock", drillId: null, nodeId: null }),
    ).toThrow(/Unknown pack/);
    expect(() =>
      parseSolverShellQuery({
        packId: "solver-flop-proof",
        drillId: "btn/flop",
        nodeId: null,
      }),
    ).toThrow(/Invalid drill/);
    expect(() =>
      parseSolverShellQuery({
        packId: "solver-flop-proof",
        drillId: null,
        nodeId: "../manifest",
      }),
    ).toThrow(/Invalid node/);
  });

  it("leaves week lock 2026-w43 at the two flop drills and ships_solver_code false", () => {
    const weeklock = JSON.parse(
      readFileSync(join(packsRoot, "weeklock/weeklock.json"), "utf8"),
    ) as { version: string; allowed_drill_ids: string[] };
    expect(weeklock.version).toBe("2026-w43");
    expect(weeklock.allowed_drill_ids).toEqual(["btn_flop_cbet", "bb_vs_cbet"]);
    for (const id of [
      "toy-6max-expand",
      "coach-shelf",
      "toy-6max-multistreet",
      "solver-flop-proof",
    ]) {
      const manifest = JSON.parse(
        readFileSync(join(packsRoot, id, "manifest.json"), "utf8"),
      ) as { provenance: { ships_solver_code: boolean } };
      expect(manifest.provenance.ships_solver_code).toBe(false);
    }
    expect(findPacksRoot()).toBeTruthy();
  });

  it("loads the proof node through the same reader the API uses", async () => {
    const body = await loadSolverShell({
      packId: "solver-flop-proof",
      drillId: "btn_flop_cbet",
      nodeId: "n_btn_bb_f_qsjh2h_btn",
    });
    expect("nodes" in body).toBe(false);
    if ("nodes" in body) return;
    expect(body.node.id).toBe("n_btn_bb_f_qsjh2h_btn");
    expect(body.node.actions.find((action) => action.id === "bet_33")?.grade).toBe("Best");
    expect(body.liveSolve).toBe(false);
    expect(body.shipsSolverCode).toBe(false);
  });

  it("does not reference a solver runtime", () => {
    const files = [
      join(process.cwd(), "lib/solver-shell.ts"),
      join(process.cwd(), "lib/solver-shell-load.ts"),
      join(process.cwd(), "app/api/solver-shell/route.ts"),
      join(process.cwd(), "components/SolverShellClient.tsx"),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8").toLowerCase();
      expect(src).not.toMatch(/wasm|texassolver|postflop-solver|child_process|worker_threads/);
    }
  });
});
