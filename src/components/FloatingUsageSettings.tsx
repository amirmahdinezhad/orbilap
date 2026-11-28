import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UsageProviderChoice, UsageLimitChoices, UsageLimitsReveal } from "./UsageDisplayControls";
import type { FloatingUsagePreferences, FloatingUsageSnapshot } from "../types";
import { Switch } from "./ui/switch";
import { FloatingUsagePreview } from "./FloatingUsagePreview";
type Provider=FloatingUsagePreferences["provider"];
interface LimitOptions {workspaceId:string|null;services:{provider:Provider;accountId:string;windows:string[];selected:string|null}[]}
const services=[{id:"codex",label:"Codex"},{id:"claude",label:"Claude"},{id:"antigravity",label:"Antigravity"}] as const;
export function FloatingUsageSettings({preferences,availableProviders,workspaceId=null,activeAccounts,activeAccountNames,disabled,onSave}:{workspaceId?:string|null;activeAccounts?:Partial<Record<Provider,string>>;activeAccountNames?:Partial<Record<Provider,string>>;preferences:FloatingUsagePreferences;availableProviders:readonly FloatingUsagePreferences["provider"][];disabled:boolean;onSave:(p:FloatingUsagePreferences)=>void}) {
 const [options,setOptions]=useState<LimitOptions|null>(null);
 const identityKey=JSON.stringify(activeAccounts??{});
 const selectionKey=JSON.stringify(preferences.providers??[preferences.provider]);
 useEffect(()=>{
   if(!preferences.enabled)return;
   let disposed=false,revision=0;let stop:(()=>void)|undefined;
   setOptions(null);
   void listen<LimitOptions>("floating-limit-options-updated",event=>{revision++;if(!disposed)setOptions(event.payload);}).then(async unlisten=>{
     if(disposed){unlisten();return;}stop=unlisten;const before=revision;
     const next=await invoke<LimitOptions>("floating_usage_limit_options");
     if(!disposed&&before===revision)setOptions(next);
   }).catch(()=>{if(!disposed)setOptions(null);});
   return ()=>{disposed=true;stop?.();};
 },[preferences.enabled,workspaceId,identityKey,selectionKey]);
 const serviceOptions=(provider:Provider)=>options?.workspaceId===workspaceId ? options?.services?.find(s=>s.provider===provider&&(!activeAccounts||s.accountId===activeAccounts[provider])):undefined;
 const selected=preferences.providers??[preferences.provider];
 const available=services.filter(service=>availableProviders.includes(service.id));
 const controlsDisabled=disabled||!preferences.enabled;
 const items:FloatingUsageSnapshot[]=selected.filter(provider=>availableProviders.includes(provider)).map(provider=>({mode:"badge",provider,accountId:null,accountName:"Sample account",workspaceId:null,workspaceName:null,showRemaining:true,limits:[{label:preferences.windows?.[provider]??serviceOptions(provider)?.selected??"5-hour",used:28,resetsAt:null}],message:null}));
 const sample=items[0]?{...items[0],items}:null;
 return <section className="settings-section settings-choice" aria-label="Floating usage settings">
 <div className="settings-group"><div className="setting-row"><span className="setting-name">Show floating usage</span><Switch aria-label="Show floating usage" checked={preferences.enabled} disabled={disabled} onCheckedChange={enabled=>onSave({...preferences,enabled})}/></div></div>
 {sample ? <figure className="display-preview floating-settings-preview" aria-label="Floating preview" aria-disabled={controlsDisabled}><FloatingUsagePreview snapshot={sample} decorative/></figure> : null}
 <div className="display-provider-section">
 <h3 className="settings-subtitle">Providers &amp; limits</h3>
 <div className="settings-group menubar-providers">
 {available.map(service=>{
   const checked=selected.includes(service.id),entry=serviceOptions(service.id);
   const chosen=preferences.windows?.[service.id]??entry?.selected??undefined;
   const windows=[...new Set([...(entry?.windows??[]),...(chosen?[chosen]:[])])];
   return <div key={service.id} className="menubar-provider">
     <UsageProviderChoice provider={service.id} label={service.label} checked={checked} disabled={controlsDisabled}
       accessibleName={`Show ${service.label} in floating`} accountLabel={`${service.label} floating active account`}
       account={activeAccountNames?.[service.id] ? <bdi>{activeAccountNames[service.id]}</bdi> : undefined}
       onCheckedChange={enabled=>onSave({...preferences,mode:"badge",providers:services.filter(s=>s.id===service.id?enabled:selected.includes(s.id)).map(s=>s.id)})} />
     <UsageLimitsReveal open={checked}>{checked ? <div className="menubar-provider-details">
       <UsageLimitChoices single provider={service.id} windows={windows} selected={chosen ? [chosen] : []} disabled={controlsDisabled}
         accessibleName={`${service.label} floating limit`} optionName={label => `${service.label} floating ${label} limit`}
         onCheckedChange={(window, enabled) => { if (enabled) onSave({...preferences,windows:{...preferences.windows,[service.id]:window}}); }} />
       {!windows.length&&preferences.enabled?<p className="setting-note" role="status">{entry?"No limits reported for this account.":"Loading limits…"}</p>:null}
     </div>:null}</UsageLimitsReveal>
   </div>;
 })}</div></div>
 </section>;
}
