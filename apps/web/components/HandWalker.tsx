"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPack } from "@/lib/load-pack";
import { sampleSpot, filterNodesByDrillId } from "@/lib/sample-spot";
import { formatActionLine, gradeDrillNode, type DrillNode, type DrillStreet } from "@/lib/drill-node";
import { formatActionLabel } from "@/lib/action-label";
import { parseCards } from "@/lib/parse-cards";
import { CardRow } from "@/components/CardRow";
import { sampleActionIndex, walkSummary, type WalkerMode, type WalkDecision } from "@/lib/hand-walker";

export function HandWalker({ mode, onModeChange, onDecision }: { mode: WalkerMode; onModeChange: (mode: WalkerMode) => void; onDecision?: (record: { mode: "street" | "full_hand"; tag: string; scenario_id: string; hand: string; chosen: string; correct: boolean }) => void }) {
  const [nodes,setNodes]=useState<DrillNode[]>([]), [current,setCurrent]=useState<DrillNode|null>(null), [heroHand,setHeroHand]=useState(""), [chosen,setChosen]=useState<number|null>(null), [decisions,setDecisions]=useState<WalkDecision[]>([]), [ended,setEnded]=useState(false), [error,setError]=useState(""), [lastGrade,setLastGrade]=useState<WalkDecision["grade"]|null>(null);
  const [street,setStreet]=useState<DrillStreet>("flop");
  const nodeMap=useMemo(()=>new Map(nodes.map(n=>[n.id,n])),[nodes]);
  const start=useCallback(async()=>{ try { const p=await loadPack("toy-6max-multistreet"); setNodes(p.nodes); const eligible=filterNodesByDrillId(p.nodes,"btn_bb_srp_full").filter(n=>mode==="street"?n.st===street&&n.hp==="BTN":n.st==="flop"&&n.hp==="BTN"); const dealt=sampleSpot(eligible,{closeOnly:false,drillId:"btn_bb_srp_full"}); if(!dealt)throw new Error("No eligible Full Hand / Street starts available"); setCurrent(dealt.node);setHeroHand(dealt.heroHand);setDecisions([]);setChosen(null);setEnded(false);setError("");setLastGrade(null); } catch(e){setError(e instanceof Error?e.message:String(e));} },[mode,street]);
  useEffect(()=>{ if(!current||current.hp==="BTN"||ended||chosen!==null)return; const timer=setTimeout(()=>{const i=sampleActionIndex(current);const childId=current.kids[i];const child=childId?nodeMap.get(childId):null; if(!child){setEnded(true);return;} if(mode==="street"&&child.st!==street){setEnded(true);return;} setCurrent(child);},350); return ()=>clearTimeout(timer); },[current,chosen,ended,mode,nodeMap,street]);
  function pick(i:number){if(!current||chosen!==null)return;const a=current.actions[i];if(!a)return;const grade=gradeDrillNode(current,a.a);onDecision?.({mode: mode === "street" ? "street" : "full_hand",tag: current.st === "flop" && current.hp === "BTN" && current.drill_id === "btn_flop_cbet" ? "cbet" : "other",scenario_id:current.id,hand:heroHand,chosen:a.a,correct:grade.isCorrect});setChosen(i);setLastGrade(grade);setDecisions(prev=>[...prev,{node:current,grade,actionIndex:i}]);const childId=current.kids[i], child=childId?nodeMap.get(childId):null;if(!child||(mode==="street"&&child.st!==street)){setEnded(true);return;}setCurrent(child);setChosen(null);}
  const summary=walkSummary(decisions);
  const line=current?formatActionLine(current):"";
  return <>
    <div className="row" role="group" aria-label="Training mode">{([['spot','Spot'],['street','Street'],['full_hand','Full Hand']] as const).map(([value,label])=><button type="button" className={mode===value?"":"secondary"} key={value} onClick={()=>onModeChange(value)}>{label}</button>)}
    {mode==="street"?<label className="field">Practice street<select value={street} onChange={e=>setStreet(e.target.value as DrillStreet)}><option value="flop">Flop</option><option value="turn">Turn</option><option value="river">River</option></select></label>:null}</div>
    <div className="card"><h2>{mode==="full_hand"?"BTN vs BB SRP · Full Hand":"BTN vs BB SRP · Street"} <span className="badge practice" title="Toy / hybrid frequencies — not solver GTO">Practice / toy</span></h2>
    {error?<p>{error}</p>:null}{current?<><div className="action-line">{line}</div>{lastGrade?<p className="meta">Previous decision: {lastGrade.label} · EV loss {lastGrade.evLossBb.toFixed(2)} bb</p>:null}<div className="metrics-bar"><div className="metric"><span className="metric__label">Accuracy</span><span className="metric__value">{summary.accuracy===null?"—":`${Math.round(summary.accuracy*100)}%`}</span></div><div className="metric"><span className="metric__label">EV loss</span><span className="metric__value">{summary.evLossBb.toFixed(2)} bb</span></div><div className="metric"><span className="metric__label">Hands</span><span className="metric__value">{decisions.length}</span></div></div>
    <div className="poker-table"><div className="poker-table__board"><CardRow cards={current.bd.flatMap(parseCards)} size="medium" label="Board" overlap={false}/></div><div className="poker-table__hero"><CardRow cards={parseCards(heroHand)} size="medium" label={`Hero BTN`} overlap/></div><div className="poker-table__meta"><span>{current.st.toUpperCase()}</span><span>vs {current.vp}</span><span>pot {current.pot}bb</span></div></div>
    {ended?<div className="result-panel"><h3>Hand summary</h3><p>{summary.decisions} decisions · Accuracy {summary.accuracy===null?"—":`${Math.round(summary.accuracy*100)}%`} · EV loss {summary.evLossBb.toFixed(2)} bb</p><button type="button" onClick={()=>void start()}>Next hand</button></div>:current.hp==="BTN"?<div className="action-grid">{current.actions.map((a,i)=><button type="button" className="action-btn" key={a.a} onClick={()=>pick(i)} disabled={chosen!==null}>{formatActionLabel(a.a,a.sizeBb)}<div className="meta">{(a.m*100).toFixed(0)}% · EV {a.ev.toFixed(2)}bb</div></button>)}</div>:<p className="meta">Villain acts from the pack mix…</p>}
    </>:<button type="button" onClick={()=>void start()}>Open hand</button>}
    </div>
  </>;
}
