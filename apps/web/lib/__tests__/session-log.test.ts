import { describe, expect, it } from "vitest";
import { accuracy, sessions, streaks, type DecisionRecord } from "../session-log";
const rec = (ts: string, correct: boolean): DecisionRecord => ({ ts, mode: "weeklock", tag: "RFI", scenario_id: "rfi", hand: "AsAh", chosen: "raise", correct });
describe("session log helpers", () => {
  it("computes accuracy and correct streaks", () => { const xs=[rec("2026-01-01T00:00:00Z",true),rec("2026-01-01T00:01:00Z",false),rec("2026-01-01T00:02:00Z",true)]; expect(accuracy(xs)).toBeCloseTo(2/3); expect(streaks(xs)).toEqual({current:1,best:1}); });
  it("splits sessions after 30 minutes", () => expect(sessions([rec("2026-01-01T00:00:00Z",true),rec("2026-01-01T00:30:01Z",true)]).length).toBe(2));
});
