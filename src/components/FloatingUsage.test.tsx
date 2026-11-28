import {act,cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FloatingUsage} from './FloatingUsage';
import {FloatingUsagePreview,floatingArc} from './FloatingUsagePreview';
import {FloatingUsageSettings} from './FloatingUsageSettings';
import type {FloatingUsageSnapshot} from '../types';
const bridge=vi.hoisted(()=>({invoke:vi.fn(),listen:vi.fn(),receive:null as null|((e:{payload:FloatingUsageSnapshot})=>void)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:bridge.invoke}));vi.mock('@tauri-apps/api/event',()=>({listen:bridge.listen}));
const sample:FloatingUsageSnapshot={mode:'badge',provider:'codex',accountId:'one',accountName:'Personal',workspaceId:'work',workspaceName:'Work',showRemaining:true,limits:[{label:'5-hour',used:99.9,resetsAt:null}],message:null};
beforeEach(()=>{vi.clearAllMocks();bridge.invoke.mockImplementation(async cmd=>cmd==='floating_usage_snapshot'?sample:{left:true,up:true});bridge.listen.mockImplementation(async(_:string,cb:typeof bridge.receive)=>{bridge.receive=cb;return ()=>{};});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('single orb shows a large provider and percentage without mini, count or visible limit text',()=>{const v=render(<FloatingUsagePreview snapshot={sample}/>);expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('1% remaining'));expect(screen.queryByText('5-hour')).not.toBeInTheDocument();expect(v.container.querySelector('[data-provider=codex] path')).toBeTruthy();expect(v.container.querySelector('.plogo')).toBeNull();expect(screen.getAllByRole('button')).toHaveLength(1);});
it('expires readings and preserves unknown data',async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-28T08:00:00Z'));render(<FloatingUsagePreview snapshot={{...sample,limits:[{label:'weekly',used:54,resetsAt:'2026-11-28T08:00:01Z'}]}}/>);expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('46% remaining'));await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('unavailable'));});
it('switches multiple providers independently while preserving enablement',async()=>{const save=vi.fn(),u=userEvent.setup();render(<FloatingUsageSettings availableProviders={['codex','claude','antigravity']} preferences={{enabled:true,provider:'codex',mode:'badge'}} disabled={false} onSave={save}/>);await u.click(screen.getByRole('switch',{name:'Show Claude in floating'}));expect(save).toHaveBeenCalledWith({enabled:true,provider:'codex',mode:'badge',providers:['codex','claude']});expect(screen.queryByText('Mini')).not.toBeInTheDocument();expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(bridge.invoke.mock.calls.every(([cmd])=>cmd==='floating_usage_limit_options')).toBe(true);});
it('saving locks all selection controls',()=>{render(<FloatingUsageSettings availableProviders={['claude']} preferences={{enabled:true,provider:'claude',mode:'badge',providers:[]}} disabled onSave={vi.fn()}/>);for(const el of screen.getAllByRole('switch'))expect(el).toBeDisabled();});
it('subscribes before initial read and ignores a stale initial identity',async()=>{let finish!:(s:FloatingUsageSnapshot)=>void;bridge.invoke.mockImplementation(cmd=>cmd==='floating_usage_snapshot'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());render(<FloatingUsage/>);await waitFor(()=>expect(finish).toBeDefined());act(()=>bridge.receive?.({payload:{...sample,accountName:'New'}}));await act(async()=>finish(sample));expect(screen.getByRole('button',{name:'Open Orbilap · New'})).toBeVisible();});
it('opens one service and starts native dragging only from its logo',async()=>{const u=userEvent.setup();const v=render(<FloatingUsage/>);await u.click(await screen.findByRole('button',{name:'Open Orbilap · Personal'}));expect(bridge.invoke).toHaveBeenCalledWith('floating_usage_action',{action:'open'});fireEvent.mouseDown(v.container.querySelector('.floating-orb-rings')!,{button:0});expect(bridge.invoke).toHaveBeenCalledWith('floating_usage_drag');});
it('shows three services continuously inside a single button with no expansion action',async()=>{
 const items=[sample,{...sample,provider:'claude',accountName:'Claude',limits:[{label:'weekly',used:54,resetsAt:null}]},{...sample,provider:'antigravity',accountName:'Google',limits:[{label:'weekly',used:null,resetsAt:null}]}];
 bridge.invoke.mockImplementation(async cmd=>cmd==='floating_usage_snapshot'?{...sample,items}:undefined);
 const u=userEvent.setup(),v=render(<FloatingUsage/>);
 await screen.findByRole('button',{name:'Open Orbilap'});
 expect(screen.getAllByRole('button')).toHaveLength(1);
 expect(screen.getByRole('button',{name:'Open Orbilap'})).toHaveAttribute('aria-description',expect.stringContaining('46% remaining'));
 expect(v.container.querySelector('[data-provider=antigravity]')).toHaveAttribute('data-state','unavailable');
 expect(v.container.querySelector('.floating-orb')).toHaveAttribute('data-count','3');
 expect(v.container.querySelectorAll('svg g')).toHaveLength(3);expect(v.container.querySelectorAll('img')).toHaveLength(0);
 await u.click(screen.getByRole('button',{name:'Open Orbilap'}));
 expect(bridge.invoke).toHaveBeenCalledWith('floating_usage_action',{action:'open'});
 expect(bridge.invoke.mock.calls.some(([cmd])=>cmd==='floating_usage_expand')).toBe(false);
});
it('shows two services side by side and changes selected services without stale readings',()=>{
 const items=[sample,{...sample,provider:'claude',limits:[{label:'weekly',used:54,resetsAt:null}]}];
 const v=render(<FloatingUsagePreview snapshot={{...sample,items}}/>);
 expect(v.container.querySelector('.floating-orb')).toHaveAttribute('data-count','2');
 expect(v.container.querySelectorAll('svg g')).toHaveLength(2);
 expect(v.container.querySelector('[data-provider=claude] .floating-orb-progress')).toHaveAttribute('d',floatingArc(53.5,43*.46));
 v.rerender(<FloatingUsagePreview snapshot={{...sample,items:[sample]}}/>);
 expect(screen.queryByText('46%')).not.toBeInTheDocument();
 expect(v.container.querySelector('.floating-orb')).toHaveAttribute('data-count','1');
});
it('keeps segments separated, uses solid blue for the third service and never fills unavailable data',()=>{
 const items=[sample,{...sample,provider:'claude',limits:[{label:'weekly',used:100,resetsAt:null}]},{...sample,provider:'antigravity',limits:[{label:'weekly',used:null,resetsAt:null}]}];
 const v=render(<FloatingUsagePreview snapshot={{...sample,items}}/>);
 expect(Array.from(v.container.querySelectorAll('.floating-orb-track')).map(e=>e.getAttribute('d'))).toEqual([0,1,2].map(i=>floatingArc(i*100/3+3.5,100/3-7)));
 expect(v.container.querySelector('[data-provider=claude] .floating-orb-progress')).toBeNull();
 expect(v.container.querySelector('[data-provider=antigravity] .floating-orb-progress')).toBeNull();
 v.rerender(<FloatingUsagePreview snapshot={{...sample,items:items.map(i=>({...i,limits:[{label:'weekly',used:54,resetsAt:null}]}))}}/>);
 expect(v.container.querySelector('[data-provider=antigravity] .floating-orb-progress')).toHaveAttribute('stroke','#3186FF');
 expect(screen.getByRole('button',{name:'Open Orbilap'})).toHaveAttribute('aria-description',expect.stringContaining('Antigravity'));
});

it('keeps all-unavailable readings quiet and distinct from a real zero',()=>{
 const missing={...sample,limits:[{label:'weekly',used:null,resetsAt:null}]};
 const v=render(<FloatingUsagePreview snapshot={{...missing,items:[missing,{...missing,provider:'claude'}]}}/>);
 expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('unavailable'));expect(v.container.querySelectorAll('.floating-orb-progress')).toHaveLength(0);
 expect(v.container.querySelectorAll('[data-state=unavailable]')).toHaveLength(2);
 v.rerender(<FloatingUsagePreview snapshot={{...sample,items:[{...sample,limits:[{label:'weekly',used:100,resetsAt:null}]}]}}/>);
 expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('0% remaining'));
});

it('uses solid Antigravity brand blue for progress',()=>{
 const v=render(<FloatingUsagePreview snapshot={{...sample,provider:'antigravity'}}/>);
 expect(v.container.querySelector('[data-provider=antigravity] .floating-orb-progress')).toHaveAttribute('stroke','#3186FF');
});

it('keeps the transparent Orbilap glyph centered without endpoint dots at fifty percent',()=>{
 const items=['codex','claude','antigravity'].map(provider=>({...sample,provider,limits:[{label:'weekly',used:50,resetsAt:null}]}));
 const v=render(<FloatingUsagePreview snapshot={{...sample,items}}/>);
 expect(v.container.querySelector('.floating-orb-center .app-glyph')).toBeTruthy();
 expect(v.container.querySelectorAll('.floating-orb-endpoint')).toHaveLength(0);
 for(const arc of v.container.querySelectorAll('.floating-orb-progress'))expect(arc).toHaveAttribute('data-percent','50');
});

it('keeps rounded arcs and accessible descriptions without hover tooltips',()=>{
 const items=[sample,{...sample,provider:'claude',limits:[{label:'weekly',used:50,resetsAt:null}]}];
 const v=render(<FloatingUsagePreview snapshot={{...sample,items}}/>);
 expect(v.container.querySelector('title,[title],.floating-orb-hit,[role=tooltip]')).toBeNull();
 expect(screen.getByRole('button')).toHaveAttribute('aria-description',expect.stringContaining('Claude · Personal · Weekly: 50% remaining'));
 for(const path of v.container.querySelectorAll('.floating-orb-progress,.floating-orb-track'))expect(path).toHaveAttribute('stroke-linecap','round');
 expect(v.container.querySelectorAll('[stroke-dasharray]')).toHaveLength(0);
 expect(screen.getAllByRole('button')).toHaveLength(1);
 expect(floatingArc(0,100).match(/ A /g)).toHaveLength(2);
});

it('applies each current limit warning tint and restores provider colors when disabled',()=>{
 const items=['codex','claude','antigravity'].map(provider=>({...sample,provider,limits:[{label:'weekly',used:95,resetsAt:null,warningColor:'#ff453a'}]}));
 const v=render(<FloatingUsagePreview snapshot={{...sample,items}}/>);
 for(const path of v.container.querySelectorAll('.floating-orb-progress'))expect(path).toHaveAttribute('stroke','#ff453a');
 v.rerender(<FloatingUsagePreview snapshot={{...sample,items:items.map(i=>({...i,limits:i.limits.map(l=>({...l,warningColor:null}))}))}}/>);
 expect(v.container.querySelector('[data-provider=antigravity] .floating-orb-progress')).toHaveAttribute('stroke','#3186FF');
 expect(v.container.querySelector('[data-provider=codex] .floating-orb-progress')).toHaveAttribute('stroke','currentColor');
 v.rerender(<FloatingUsagePreview snapshot={{...sample,limits:[{label:'weekly',used:95,resetsAt:'2020-01-01T00:00:00Z',warningColor:'#ff453a'}]}}/>);
 expect(v.container.querySelector('.floating-orb-progress')).toBeNull();
});

it('disables floating options and preview while off and hides providers without an active account',async()=>{
 const save=vi.fn(),u=userEvent.setup();
 const v=render(<FloatingUsageSettings availableProviders={['codex']} preferences={{enabled:false,provider:'codex',mode:'badge',providers:['codex','claude']}} disabled={false} onSave={save}/>);
 expect(screen.getByRole('switch',{name:'Show floating usage'})).toBeEnabled();
 expect(screen.getByRole('switch',{name:'Show Codex in floating'})).toBeDisabled();
 expect(screen.queryByRole('switch',{name:'Show Claude in floating'})).toBeNull();
 expect(screen.getByLabelText('Floating preview')).toHaveAttribute('aria-disabled','true');
 expect(v.container.querySelector('[data-provider=claude]')).toBeNull();
 await u.click(screen.getByRole('switch',{name:'Show Codex in floating'}));expect(save).not.toHaveBeenCalled();
 v.rerender(<FloatingUsageSettings availableProviders={['codex']} preferences={{enabled:true,provider:'codex',mode:'badge',providers:['codex','claude']}} disabled={false} onSave={save}/>);
 await u.click(screen.getByRole('switch',{name:'Show Codex in floating'}));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({providers:['claude']}));
 v.rerender(<FloatingUsageSettings availableProviders={[]} preferences={{enabled:true,provider:'codex',mode:'badge'}} disabled={false} onSave={save}/>);
 expect(screen.getAllByRole('switch')).toHaveLength(1);expect(screen.queryByLabelText('Floating preview')).toBeNull();
});

it('chooses one cached floating limit independently and ignores stale account options',async()=>{
 const save=vi.fn(),u=userEvent.setup();
 bridge.invoke.mockResolvedValue({workspaceId:'work',services:[{provider:'codex',accountId:'one',windows:['5-hour','weekly'],selected:'5-hour'},{provider:'antigravity',accountId:'google',windows:['Gemini 4 Carbon · Weekly'],selected:'Gemini 4 Carbon · Weekly'}]});
 const props={workspaceId:'work',activeAccounts:{codex:'one',antigravity:'google'},availableProviders:['codex','antigravity'] as const,preferences:{enabled:true,provider:'codex' as const,mode:'badge' as const,providers:['codex','antigravity'] as ('codex'|'antigravity')[],windows:{antigravity:'Gemini 4 Carbon · Weekly'}},disabled:false,onSave:save};
 const v=render(<FloatingUsageSettings {...props}/>);
 expect(await screen.findByRole('radio',{name:'Codex floating Weekly limit'})).toBeEnabled();
 expect(screen.getByRole('radiogroup',{name:'Codex floating limit'})).toBeVisible();
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('Codex limits')).not.toBeInTheDocument();
 expect(screen.getByRole('radio',{name:'Codex floating Weekly limit'})).toBeVisible();
 expect(save).not.toHaveBeenCalled();
 await u.click(screen.getByRole('radio',{name:'Codex floating Weekly limit'}));
 expect(save).toHaveBeenCalledWith({...props.preferences,windows:{antigravity:'Gemini 4 Carbon · Weekly',codex:'weekly'}});
 expect(bridge.invoke).toHaveBeenCalledWith('floating_usage_limit_options');
 v.rerender(<FloatingUsageSettings {...props} activeAccountNames={{codex:'Sample Codex'}} preferences={{...props.preferences,windows:{...props.preferences.windows,codex:'weekly'}}}/>);
 expect(screen.getByLabelText('Codex floating active account')).toHaveTextContent('Sample Codex');
 expect(screen.getByRole('radio',{name:'Codex floating Weekly limit'})).toBeChecked();
 expect(screen.getByRole('radio',{name:'Codex floating 5-hour limit'})).not.toBeChecked();
 save.mockClear();
 await u.click(screen.getByRole('radio',{name:'Codex floating Weekly limit'}));
 expect(save).not.toHaveBeenCalled();
 screen.getByRole('radio',{name:'Codex floating Weekly limit'}).focus();
 await u.keyboard('{ArrowUp>}');
 await waitFor(()=>expect(save).toHaveBeenLastCalledWith({...props.preferences,windows:{...props.preferences.windows,codex:'5-hour'}}));
 await u.keyboard('{/ArrowUp}');
 expect(bridge.invoke.mock.calls.every(([cmd])=>cmd==='floating_usage_limit_options')).toBe(true);
 v.rerender(<FloatingUsageSettings {...props} disabled/>);
 for(const radio of screen.getAllByRole('radio'))expect(radio).toBeDisabled();
 v.rerender(<FloatingUsageSettings {...props} activeAccounts={{codex:'new',antigravity:'google'}}/>);
 await waitFor(()=>expect(screen.queryByRole('radio',{name:'Codex floating Weekly limit'})).toBeNull());
});
