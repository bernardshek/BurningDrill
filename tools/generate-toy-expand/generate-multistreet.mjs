#!/usr/bin/env node
/** Deterministic, deliberately thin Practice/toy Full Hand tree emitter. */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "packs/toy-6max-expand");
const out = join(root, "packs/toy-6max-multistreet");
const flops = JSON.parse(readFileSync(join(source, "flops-25.json"), "utf8")).flops.slice(0, 4);
const R = "23456789TJQKA", S = "cdhs";
const SEED = Number(process.env.TOY_MULTISTREET_SEED ?? 0xb1);
function mulberry32(seed){let t=seed>>>0;return()=>{t=(t+0x6d2b79f5)>>>0;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return((r^(r>>>14))>>>0)/4294967296;};}
const rng=mulberry32(SEED);
function combo(a,b){ let c=R.indexOf(a[0])*4+S.indexOf(a[1]),d=R.indexOf(b[0])*4+S.indexOf(b[1]); if(c>d)[c,d]=[d,c]; return d*(d-1)/2+c; }
function actions(list){ const weights=list.map(x=>x.m*(.98+rng()*.04)),sum=weights.reduce((a,b)=>a+b,0); const varied=list.map((x,i)=>({...x,m:+(weights[i]/sum).toFixed(3),ev:+(x.ev+(rng()-.5)*.02).toFixed(3)})); const correction=+(1-varied.reduce((a,x)=>a+x.m,0)).toFixed(3); varied[varied.length-1].m=+(varied[varied.length-1].m+correction).toFixed(3); const max=Math.max(...varied.map(x=>x.ev)); return { actions:varied,best:varied.findIndex(x=>x.ev===max),dev:+(max-Math.min(...varied.map(x=>x.ev))).toFixed(3),wu:false }; }
const nodes=[];
let handCombos=[];
function add(id,st,hp,bd,pot,acts,kids,line,prior){ const a=actions(acts); const n={id,st,hp,vp:hp==="BTN"?"BB":"BTN",ip:hp==="BTN",bd,pot,eff:100,nf:1/32,wu:a.wu,...a,kids,combos:handCombos,drill_id:"btn_bb_srp_full",line_steps:line,line:line.join(" → ")}; if(prior)n.prior_action=prior; nodes.push(n); }
function act(a,m,ev,sizeBb){return {a,m,ev,...(sizeBb?{sizeBb}:{})};}
rmSync(out,{recursive:true,force:true}); mkdirSync(join(out,"nodes"),{recursive:true});
const turns=["3c","4d","5h","6s"];
const rivers=["4c","5d","6h","7s"];
for(let f=0;f<4;f++){
 const bd=flops[f], slug=bd.join("").toLowerCase(), t=turns[f], r=rivers[f];
 const turn=bd.concat(t), river=turn.concat(r), base=`ms_${f}_${slug}`;
 const blocked=new Set(river), candidates=[["As","Kd"],["Qh","Jd"],["9s","8s"],["Tc","9c"],["7s","6s"],["Jc","Tc"]].filter(hand=>hand.every(card=>!blocked.has(card))).slice(0,2);
 handCombos=candidates.map(([a,b],i)=>({c:combo(a,b),w:i===0?1:.7}));
 const L=["BTN open 2.5bb","BB call","Flop"];
 const riverCheck=`${base}_river_check`, riverBet=`${base}_river_bet`, turnCheck=`${base}_turn_check`, turnCall=`${base}_turn_call`, flopCheck=`${base}_flop_check`, flopCall=`${base}_flop_call`, flop=`${base}_flop`;
 add(riverCheck,"river","BTN",river,8,[act("check",.65,.32),act("bet_33",.35,.36,2.7)],[null,null],[...L,"BTN check","Turn","BB check","River"]);
 add(riverBet,"river","BB",river,11,[act("fold",.2,0),act("call",.7,.4),act("raise_2.5x",.1,.25,8.2)],[null,null,null],[...L,"BTN bet 33%","BB call","Turn","BTN check","River"],"bet_33");
 add(turnCheck,"turn","BTN",turn,8,[act("check",.6,.3),act("bet_33",.4,.32,2.7)],[riverCheck,riverBet],[...L,"BTN check","Turn" ]);
 add(turnCall,"turn","BTN",turn,11,[act("check",.55,.38),act("bet_33",.45,.4,3.7)],[riverCheck,riverBet],[...L,"BTN bet 33%","BB call","Turn"],"call");
 add(flopCheck,"flop","BB",bd,6.5,[act("check",.72,.35),act("bet_33",.28,.33,2.2)],[turnCheck,null],[...L,"BTN check"]);
 add(flopCall,"flop","BB",bd,8.7,[act("fold",.2,0),act("call",.7,.44),act("raise_2.5x",.1,.3,7.5)],[null,turnCall,null],[...L,"BTN bet 33%","BB to act"],"bet_33");
 add(flop,"flop","BTN",bd,6.5,[act("check",.55,.42),act("bet_33",.35,.45,2.2),act("bet_75",.1,.2,4.9)],[flopCheck,flopCall,null],L);
}
for(const n of nodes) writeFileSync(join(out,"nodes",`${n.id}.json`),JSON.stringify(n,null,2)+"\n");
const manifest={id:"toy-6max-multistreet",name:"Toy 6-max · BTN vs BB SRP Full Hand",version:"0.1.0",formatVersion:1,format:"drill_node_v1",table_size:6,game:"nlhe_cash",abstraction:"hu_after_folds",line:"BTN_vs_BB_SRP",game_lines:["flop","turn","river"],provenance:{kind:"toy_hybrid",practice:true,ships_solver_code:false,note:"Deterministic toy frequencies and EVs for Practice UX; not solver GTO."},flop_subset:"first four flops from toy-6max-expand/flops-25.json",nodes:nodes.map(n=>n.id)};
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(`${nodes.length} nodes (seed ${SEED}); wrote ${out}`);
