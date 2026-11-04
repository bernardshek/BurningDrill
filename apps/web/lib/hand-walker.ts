import { formatActionLabel } from "./action-label";
import { formatActionLine, gradeDrillNode, type DrillGrade, type DrillNode, type DrillPosition, type DrillStreet } from "./drill-node";

export type WalkerMode = "spot" | "street" | "full_hand";
export type WalkDecision = { node: DrillNode; grade: DrillGrade; actionIndex: number };
/** One action that was actually taken. Full Hand lines are built from these, not from a later node's static line. */
export type WalkActor = {
  position: DrillPosition;
  action: string;
  sizeBb?: number;
  street: DrillStreet;
};

function streetTitle(street: DrillStreet): string {
  return street.charAt(0).toUpperCase() + street.slice(1);
}

/**
 * Full Hand / Street action line.
 * Starts from the dealt node's pack `line_steps`, appends only actions taken,
 * and names the street when the current pack node has moved on.
 */
export function fullHandLine(root: DrillNode, events: readonly WalkActor[], current: DrillNode): string {
  const steps =
    root.line_steps && root.line_steps.length > 0
      ? [...root.line_steps]
      : [formatActionLine(root)];
  let street = root.st;
  for (const event of events) {
    if (event.street !== street) {
      steps.push(streetTitle(event.street));
      street = event.street;
    }
    steps.push(`${event.position} ${formatActionLabel(event.action, event.sizeBb)}`);
  }
  if (current.id !== root.id && current.st !== street) {
    steps.push(streetTitle(current.st));
  }
  return steps.join(" → ");
}
export function sampleActionIndex(node: DrillNode, random: () => number = Math.random): number {
  const total = node.actions.reduce((sum, a) => sum + a.m, 0);
  if (total <= 0) return 0;
  let pick = random() * total;
  for (let i = 0; i < node.actions.length; i++) {
    pick -= node.actions[i]!.m;
    if (pick < 0) return i;
  }
  return node.actions.length - 1;
}
export function gradeWalkerAction(node: DrillNode, actionIndex: number): DrillGrade {
  const action = node.actions[actionIndex];
  if (!action) throw new Error(`Action index ${actionIndex} not in node ${node.id}`);
  return gradeDrillNode(node, action.a);
}
export function followKid(nodes: DrillNode[], node: DrillNode, actionIndex: number, mode: WalkerMode, street: DrillStreet): DrillNode | null {
  if (mode === "spot" || (mode === "street" && node.st !== street)) return null;
  const childId = node.kids[actionIndex];
  if (!childId) return null;
  const child = nodes.find(n => n.id === childId) ?? null;
  if (child && mode === "street" && child.st !== street) return null;
  return child;
}
export function walkSummary(decisions: WalkDecision[]) {
  const count = decisions.length;
  const correct = decisions.filter(d => d.grade.isCorrect).length;
  return { decisions: count, accuracy: count ? correct / count : null, evLossBb: decisions.reduce((sum,d)=>sum+d.grade.evLossBb,0) };
}
