export type DecisionMode = "weeklock" | "spot" | "street" | "full_hand";
export type DecisionRecord = { ts: string; mode: DecisionMode; tag: string; scenario_id: string; hand: string; chosen: string; correct: boolean };
export const SESSION_LOG_KEY = "pt_session_log_v1";
export function readSessionLog(): DecisionRecord[] {
  if (typeof window === "undefined") return [];
  try { const x: unknown = JSON.parse(localStorage.getItem(SESSION_LOG_KEY) ?? "[]"); return Array.isArray(x) ? x.filter(isRecord) : []; } catch { return []; }
}
function isRecord(x: unknown): x is DecisionRecord { return !!x && typeof x === "object" && typeof (x as DecisionRecord).ts === "string" && typeof (x as DecisionRecord).tag === "string"; }
export function appendDecision(record: DecisionRecord): void {
  if (typeof window === "undefined") return;
  const log = readSessionLog(); log.push(record);
  try { localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(log)); } catch { /* storage may be unavailable */ }
}
export function accuracy(records: DecisionRecord[]) { return records.length ? records.filter(x => x.correct).length / records.length : null; }
export function streaks(records: DecisionRecord[]) {
  let current = 0, best = 0, run = 0;
  for (const r of records) { run = r.correct ? run + 1 : 0; best = Math.max(best, run); }
  for (let i = records.length - 1; i >= 0 && records[i]!.correct; i--) current++;
  return { current, best };
}
export function sessions(records: DecisionRecord[]) {
  const ordered = [...records].sort((a,b) => Date.parse(a.ts)-Date.parse(b.ts));
  const groups: DecisionRecord[][] = [];
  for (const item of ordered) { const group = groups[groups.length-1]; if (!group || Date.parse(item.ts)-Date.parse(group[group.length-1]!.ts)>30*60*1000) groups.push([item]); else group.push(item); }
  return groups;
}
