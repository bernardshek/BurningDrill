import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gradeDrillNode, type DrillNode } from "../drill-node";

const packDir = join(process.cwd(), "../../packs/solver-flop-proof");

function loadNode(id: string): DrillNode {
  return JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")) as DrillNode;
}

describe("solver-flop-proof grades with gradeDrillNode", () => {
  it("keeps solver code out of the pack and grades the dumped flop nodes", () => {
    const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
    expect(manifest.format).toBe("drill_node_v1");
    expect(manifest.provenance.ships_solver_code).toBe(false);

    const btn = loadNode("n_btn_bb_f_qsjh2h_btn");
    expect(gradeDrillNode(btn, "bet_33").label).toBe("Best");
    expect(gradeDrillNode(btn, "bet_75").label).toBe("Correct");
    expect(gradeDrillNode(btn, "check").label).toBe("Wrong");

    const donk = loadNode("n_btn_bb_f_qsjh2h_bb_donk");
    expect(gradeDrillNode(donk, "check").label).toBe("Best");
    expect(gradeDrillNode(donk, "bet_33").label).toBe("Correct");
    expect(donk.kids[0]).toBe(btn.id);
  });
});
