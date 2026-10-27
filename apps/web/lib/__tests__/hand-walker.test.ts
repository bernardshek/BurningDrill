import { describe, expect, it } from "vitest";
import type { DrillNode } from "../drill-node";
import { followKid, gradeWalkerAction, sampleActionIndex, walkSummary } from "../hand-walker";
const n=(id:string,kids:(string|null)[],actions=[{a:"check",m:.25,ev:1},{a:"bet_33",m:.75,ev:0}]):DrillNode=>({id,st:"flop",hp:"BTN",vp:"BB",ip:true,bd:["Ah","Kd","2c"],pot:6.5,eff:100,nf:1,wu:false,best:0,dev:1,actions,kids,combos:[{c:100,w:1}]});
describe("pure hand walker",()=>{
 it("terminates on null kids and Spot ignores all kids",()=>{const root=n("root",["child",null]),child=n("child",[null,null]);expect(followKid([root,child],root,1,"full_hand","flop")).toBeNull();expect(followKid([root,child],root,0,"spot","flop")).toBeNull();expect(followKid([root,child],root,0,"full_hand","flop")?.id).toBe("child");});
 it("stops Street mode at the first street transition",()=>{const root=n("flop",["turn"]),turn={...n("turn",[null,null]),st:"turn" as const,bd:["Ah","Kd","2c","3d"]};expect(followKid([root,turn],root,0,"street","flop")).toBeNull();});
 it("samples villain actions in proportion to m",()=>{const node=n("villain",[null,null]);let high=0;for(let i=0;i<100;i++)if(sampleActionIndex(node,()=> (i+.5)/100)===1)high++;expect(high).toBe(75);});
 it("grades against pack best and summarizes hero decisions",()=>{const node=n("grade",[null,null],[{a:"check",m:.9,ev:1},{a:"bet_33",m:.1,ev:0}]);const grade=gradeWalkerAction(node,1);expect(grade.isCorrect).toBe(false);expect(grade.evLossBb).toBe(1);expect(walkSummary([{node,grade,actionIndex:1}])).toEqual({decisions:1,accuracy:0,evLossBb:1});});
});
