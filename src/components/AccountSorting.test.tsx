import { useAccountSorting } from "../accountSortingContext";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { sortAccounts } from "../accountSort";
import { AccountSortProvider, AnimatedAccountList } from "./AccountSorting";
const accounts = [{id:"z",name:"Zoe"},{id:"a",name:"Emma"}];
function Cards() {
  const {preference} = useAccountSorting();
  return <AnimatedAccountList className="test-list">{sortAccounts(accounts,preference,"z",{},Date.now()).map(a=><article data-account-id={a.id} key={a.id} aria-label={a.name}>{a.name}</article>)}</AnimatedAccountList>;
}
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("sorts and reverses the visible cards, retaining the choice in the workspace",async()=>{
  const user=userEvent.setup();
  render(<AccountSortProvider workspaceId="test"><Cards/></AccountSortProvider>);
  expect(screen.getAllByRole("article").map(a=>a.textContent)).toEqual(["Zoe","Emma"]);
  await user.click(screen.getByRole("combobox",{name:"Sort accounts"}));
  await user.click(screen.getByRole("option",{name:"Account name"}));
  expect(screen.getAllByRole("article").map(a=>a.textContent)).toEqual(["Emma","Zoe"]);
  const directionButton = screen.getByRole("button",{name:"Reverse sort order, a to z"});
  const glyph = directionButton.querySelector("svg");
  expect(directionButton).toHaveAttribute("data-direction", "ascending");
  await user.click(directionButton);
  expect(directionButton).toHaveAttribute("data-direction", "descending");
  expect(directionButton.querySelector("svg")).toBe(glyph);
  expect(screen.getAllByRole("article").map(a=>a.textContent)).toEqual(["Zoe","Emma"]);
  expect(JSON.parse(localStorage.getItem("orbilap.accountSort.test")!)).toEqual({mode:"name",descending:true});
});
it("respects keyboard and reduced-motion sorting without translating cards",async()=>{
  const animate=vi.fn(()=>({cancel:vi.fn(),finished:Promise.resolve()}));
  vi.stubGlobal("matchMedia",()=>({matches:true}));
  Object.defineProperty(HTMLElement.prototype,"animate",{value:animate,configurable:true});
  const user=userEvent.setup();
  render(<AccountSortProvider workspaceId="reduce"><Cards/></AccountSortProvider>);
  await user.click(screen.getByRole("combobox",{name:"Sort accounts"}));
  await user.click(screen.getByRole("option",{name:"Account name"}));
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Emma");
  expect(animate.mock.contexts.filter(context => (context as HTMLElement)?.dataset?.accountId)).toHaveLength(0);
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

it("animates only a pointer reorder and cancels it before a rapid reverse",async()=>{
  const cancel=vi.fn();
  const animate=vi.fn(function(this: HTMLElement) { return {cancel,finished:this.dataset.accountId ? new Promise<void>(()=>{}) : Promise.resolve()}; });
  vi.stubGlobal("matchMedia",()=>({matches:false}));
  Object.defineProperty(HTMLElement.prototype,"animate",{value:animate,configurable:true});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const index=this.dataset.accountId ? [...this.parentElement!.children].indexOf(this) : 0;
    return {top:index*100,left:0,width:300,height:100,bottom:index*100+100,right:300,x:0,y:index*100,toJSON:()=>({})};
  });
  const user=userEvent.setup();
  render(<AccountSortProvider workspaceId="motion"><Cards/></AccountSortProvider>);
  await user.click(screen.getByRole("combobox",{name:"Sort accounts"}));
  await user.click(screen.getByRole("option",{name:"Account name"}));
  expect(animate.mock.contexts.filter(context => (context as HTMLElement)?.dataset?.accountId)).toHaveLength(2);
  expect(animate.mock.calls[animate.mock.contexts.findIndex(context => (context as HTMLElement)?.dataset?.accountId)]).toEqual([
    [{transform:"translateY(100px)"},{transform:"translateY(0)"}],
    {duration:240,easing:"cubic-bezier(0.77, 0, 0.175, 1)"},
  ]);
  await user.click(screen.getByRole("button",{name:"Reverse sort order, a to z"}));
  expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(animate.mock.contexts.filter(context => (context as HTMLElement)?.dataset?.accountId)).toHaveLength(4);
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

it("applies keyboard sorting immediately even when motion is allowed",async()=>{
  const animate=vi.fn(()=>({cancel:vi.fn(),finished:Promise.resolve()}));
  vi.stubGlobal("matchMedia",()=>({matches:false}));
  Object.defineProperty(HTMLElement.prototype,"animate",{value:animate,configurable:true});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const index=this.dataset.accountId ? [...this.parentElement!.children].indexOf(this) : 0;
    return {top:index*100,left:0,width:300,height:100,bottom:index*100+100,right:300,x:0,y:index*100,toJSON:()=>({})};
  });
  const user=userEvent.setup();
  render(<AccountSortProvider workspaceId="keyboard"><Cards/></AccountSortProvider>);
  await user.click(screen.getByRole("combobox",{name:"Sort accounts"}));
  await user.keyboard("{End}{Enter}");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Emma");
  expect(animate.mock.contexts.filter(context => (context as HTMLElement)?.dataset?.accountId)).toHaveLength(0);
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});
