import { z } from "zod";

const ranks = "AKQJT98765432";
const handClasses = new Set<string>();
for (let i = 0; i < ranks.length; i++) for (let j = i; j < ranks.length; j++) {
  if (i === j) handClasses.add(`${ranks[i]}${ranks[j]}`);
  else { handClasses.add(`${ranks[i]}${ranks[j]}s`); handClasses.add(`${ranks[i]}${ranks[j]}o`); }
}
export const HandClassSchema = z.string().refine((v) => handClasses.has(v), "invalid hand class");
const PositionSchema = z.enum(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
export const WeeklockScenarioSchema = z.object({
  id: z.string().min(1), tag: z.enum(["RFI", "vs3bet", "vs4bet", "cbet"]),
  hero_pos: PositionSchema, villain_pos: PositionSchema.nullable(), line: z.string().min(1),
  actions: z.array(z.string().min(1)).min(2), default: z.string().min(1),
  chart: z.record(z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])),
  deal_from: z.array(HandClassSchema).min(1).optional(),
  focus: z.array(HandClassSchema).min(1).optional(),
  focus_rate: z.number().min(0).max(1).optional(),
  weight: z.number().positive(), note: z.string(),
}).superRefine((scenario, ctx) => {
  const actions = new Set(scenario.actions);
  if (actions.size !== scenario.actions.length) ctx.addIssue({ code: "custom", message: "actions must be unique", path: ["actions"] });
  if (!actions.has(scenario.default)) ctx.addIssue({ code: "custom", message: "default must be in actions", path: ["default"] });
  for (const [hand, values] of Object.entries(scenario.chart)) {
    if (!handClasses.has(hand)) ctx.addIssue({ code: "custom", message: `invalid hand class ${hand}`, path: ["chart", hand] });
    for (const action of Array.isArray(values) ? values : [values]) if (!actions.has(action)) ctx.addIssue({ code: "custom", message: `unknown action ${action}`, path: ["chart", hand] });
  }
  if (scenario.focus_rate !== undefined && scenario.focus === undefined) ctx.addIssue({ code: "custom", message: "focus_rate requires focus", path: ["focus_rate"] });
});
export const WeeklockPackSchema = z.object({
  pack: z.literal("weeklock-nl5"), version: z.string().min(1), stakes: z.string().min(1),
  placeholder: z.boolean().optional(), rules: z.array(z.string().min(1)).optional(), scenarios: z.array(WeeklockScenarioSchema).min(1),
}).superRefine((pack, ctx) => {
  const ids = new Set<string>();
  pack.scenarios.forEach((s, i) => { if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `duplicate scenario id ${s.id}`, path: ["scenarios", i, "id"] }); ids.add(s.id); });
});
export type WeeklockPack = z.infer<typeof WeeklockPackSchema>;
export function validateWeeklockPack(input: unknown) { return WeeklockPackSchema.safeParse(input); }
