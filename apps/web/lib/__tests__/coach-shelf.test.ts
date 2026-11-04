import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handFromComboIndex } from "../combo1326";
import { gradeDrillNode, type DrillNode } from "../drill-node";
import { handClassFromCombo } from "../weeklock";

const root = join(process.cwd(), "../..");
const packDir = join(root, "packs/coach-shelf");

function loadNodes(): DrillNode[] {
  const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
  return (manifest.nodes as string[]).map((id) =>
    JSON.parse(readFileSync(join(packDir, "nodes", `${id}.json`), "utf8")),
  );
}

function nodeFor(nodes: DrillNode[], drillId: string, handClass: string): DrillNode {
  const hits = nodes.filter(
    (node) =>
      node.drill_id === drillId &&
      node.combos.some(
        (combo) => handClassFromCombo(handFromComboIndex(combo.c)) === handClass,
      ),
  );
  expect(hits).toHaveLength(1);
  return hits[0]!;
}

describe("coach shelf pack", () => {
  const nodes = loadNodes();
  const weeklock = JSON.parse(
    readFileSync(join(root, "packs/weeklock/weeklock.json"), "utf8"),
  );
  const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));

  it("keeps the 2026-w43 allowlist on the two flop drills", () => {
    expect(weeklock.version).toBe("2026-w43");
    expect(weeklock.allowed_drill_ids).toEqual(["btn_flop_cbet", "bb_vs_cbet"]);
    expect(manifest.provenance.ships_solver_code).toBe(false);
  });

  it("leads with vs3bet and vs4bet and skips RFI and donk", () => {
    const order: string[] = [];
    for (const node of nodes) {
      if (node.drill_id && !order.includes(node.drill_id)) order.push(node.drill_id);
    }
    expect(order).toEqual([
      "vs3bet_oop",
      "vs3bet_ip",
      "vs4bet_jam",
      "vs4bet_22",
      "btn_delayed_barrel",
    ]);
    expect(nodes.some((node) => node.drill_id?.startsWith("rfi_"))).toBe(false);
    expect(
      nodes.some(
        (node) => node.drill_id === "bb_flop_donk" || node.drill_id === "btn_vs_donk",
      ),
    ).toBe(false);
  });

  it("grades the vs4bet jam lock: QQ+ and AK continue, JJ folds", () => {
    const jj = nodeFor(nodes, "vs4bet_jam", "JJ");
    expect(gradeDrillNode(jj, "fold").label).toBe("Best");
    expect(gradeDrillNode(jj, "call").label).toBe("Wrong");
    expect(gradeDrillNode(jj, "5bet_jam").label).toBe("Wrong");

    const qq = nodeFor(nodes, "vs4bet_jam", "QQ");
    expect(gradeDrillNode(qq, "call").label).toBe("Best");
    expect(gradeDrillNode(qq, "fold").label).toBe("Wrong");
    expect(gradeDrillNode(qq, "5bet_jam").label).toBe("Wrong");

    const aa = nodeFor(nodes, "vs4bet_jam", "AA");
    expect(gradeDrillNode(aa, "5bet_jam").label).toBe("Best");
    expect(gradeDrillNode(aa, "call").label).toBe("Wrong");
    expect(gradeDrillNode(aa, "fold").label).toBe("Wrong");

    const ak = nodeFor(nodes, "vs4bet_jam", "AKo");
    expect(gradeDrillNode(ak, "call").label).toBe("Best");
    expect(gradeDrillNode(ak, "5bet_jam").label).toBe("Wrong");
    expect(gradeDrillNode(ak, "fold").label).toBe("Wrong");
  });

  it("grades vs3bet OOP from the weeklock chart, including the AK mix", () => {
    const aq = nodeFor(nodes, "vs3bet_oop", "AQs");
    expect(gradeDrillNode(aq, "call").label).toBe("Best");
    expect(gradeDrillNode(aq, "4bet").label).toBe("Wrong");
    expect(gradeDrillNode(aq, "fold").label).toBe("Wrong");

    const ak = nodeFor(nodes, "vs3bet_oop", "AKs");
    expect(gradeDrillNode(ak, "4bet").label).toBe("Best");
    expect(gradeDrillNode(ak, "call").label).toBe("Best");
    expect(gradeDrillNode(ak, "fold").label).toBe("Wrong");

    const nines = nodeFor(nodes, "vs3bet_oop", "99");
    expect(gradeDrillNode(nines, "fold").label).toBe("Best");
    expect(gradeDrillNode(nines, "call").label).toBe("Wrong");

    const ipNines = nodeFor(nodes, "vs3bet_ip", "99");
    expect(gradeDrillNode(ipNines, "call").label).toBe("Best");
    expect(gradeDrillNode(ipNines, "fold").label).toBe("Wrong");
  });

  it("barrels the turn after a capped check-back and does not shove", () => {
    const barrels = nodes.filter((node) => node.drill_id === "btn_delayed_barrel");
    expect(barrels.length).toBeGreaterThanOrEqual(2);
    for (const node of barrels) {
      expect(node.st).toBe("turn");
      expect(node.hp).toBe("BTN");
      expect(node.line).toContain("check");
      expect(node.line).toContain("capped");
      expect(node.actions.some((action) => action.a.includes("jam") || action.a === "bet_100")).toBe(
        false,
      );
      const best = node.actions[node.best];
      expect(best?.a.startsWith("bet_")).toBe(true);
      expect(gradeDrillNode(node, best!.a).label).toBe("Best");
      expect(gradeDrillNode(node, "check").label).toBe("Wrong");
    }
  });
});
