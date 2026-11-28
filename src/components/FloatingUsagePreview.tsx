import { type MouseEventHandler } from "react";
import { accountWindowLabel } from "../accountPrefs";
import { AppGlyph } from "../logos";
import { Button } from "./ui/button";
import { remainingPercent } from "../usage";
import type { FloatingUsageSnapshot } from "../types";
import { useAccountClock } from "../useAccountClock";

export function floatingArc(start:number,length:number) {
 const point=(n:number)=>{const a=n*Math.PI/50-Math.PI/2;return `${30+24*Math.cos(a)} ${30+24*Math.sin(a)}`;};
 if(length>50)return `M ${point(start)} A 24 24 0 0 1 ${point(start+length/2)} A 24 24 0 0 1 ${point(start+length)}`;
 return `M ${point(start)} A 24 24 0 0 1 ${point(start+length)}`;
}

export function FloatingUsagePreview({snapshot,error,onOpen,onDragStart,decorative=false}: {
 snapshot: FloatingUsageSnapshot|null; error?:string|null; onOpen?:()=>void;
 onDragStart?:MouseEventHandler<Element>; decorative?:boolean;
}) {
 const items=(snapshot?.items ?? (snapshot?[snapshot]:[])).slice(0,3);
 const now=useAccountClock(items.flatMap(item=>item.limits.map(limit=>limit.resetsAt)));
 const readings=items.map(item=>{
   const limit=item.limits[0],used=limit?.used,deadline=Date.parse(limit?.resetsAt??"");
   const value=used!=null&&Number.isFinite(used)&&used>=0&&used<=100&&(!Number.isFinite(deadline)||deadline>now)
     ?item.showRemaining?remainingPercent(used):Math.round(used):null;
   const provider={codex:"Codex",claude:"Claude",antigravity:"Antigravity"}[item.provider]??item.provider;
   return {item,value,label:`${provider} · ${item.accountName??"No active account"} · ${limit?accountWindowLabel(limit.label):"Usage unavailable"}: ${value==null?"unavailable":`${value}% ${item.showRemaining?"remaining":"used"}`}`};
 });
 const summary=error??readings.map(r=>r.label+(r.item.message?` · ${r.item.message}`:"")).join(" · ");
 const content=<>
   <svg className="floating-orb-rings" viewBox="0 0 60 60" aria-hidden="true" onMouseDown={onDragStart}>
     {readings.map(({item,value},index)=>{
       const segment=100/readings.length;
       // Preserve a visible seam at twelve o’clock, even for one full provider.
       const gap=7;
       const length=segment-gap;
       const start=index*segment+gap/2;
       const color=item.limits[0]?.warningColor ?? (item.provider==='antigravity'?"#3186FF":"currentColor");
       return <g key={item.provider} data-provider={item.provider} data-state={value==null?'unavailable':'ready'}>
         <path className="floating-orb-track" d={floatingArc(start,length)} strokeLinecap="round"/>
         {value!=null&&value>0&&<path className="floating-orb-progress" d={floatingArc(start,length*value/100)} stroke={color} strokeLinecap="round" data-percent={value}/>}
       </g>;
     })}
   </svg>
   <span className="floating-orb-center" onMouseDown={onDragStart}><AppGlyph/></span>
 </>;
 return decorative?<span className="floating-orb" data-count={items.length} aria-hidden="true">{content}</span>:
 <Button variant="ghost" className="floating-orb" data-count={items.length} aria-description={summary}
   aria-label={items.length===1?`Open Orbilap${snapshot?.accountName?` · ${snapshot.accountName}`:""}`:"Open Orbilap"} onClick={onOpen}>{content}</Button>;
}
