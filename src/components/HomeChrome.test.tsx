import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HomeHeader } from "./HomeChrome";
import { DEFAULT_WORKSPACE_USAGE } from "../types";
const workspace={id:"one",name:"Person",accent:"#007aff",accountIds:[],usage:DEFAULT_WORKSPACE_USAGE};
const props=()=>({workspace,workspaces:[workspace],workspaceBusy:false,refreshing:false,updatedAt:"2026-11-04T10:00:00Z",onSelect:vi.fn(),onRefresh:vi.fn(),onQuit:vi.fn(),onCreate:vi.fn(),onRenameWorkspace:vi.fn(),addBusy:false,onAdd:vi.fn(),onSettings:vi.fn()});
afterEach(cleanup);
it("keeps routine freshness out of the header and offers it on the refresh control",async()=>{
  const base=props(),user=userEvent.setup();render(<HomeHeader {...base} />);
  expect(screen.queryByText(/Updated|last checked/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Accounts"})).toHaveClass("sr-only");
  await user.hover(screen.getByRole("button",{name:"Refresh data"}));
  expect(await screen.findByRole("tooltip", {}, { timeout: 2000 })).toHaveTextContent(/Refresh.*last checked.*Nov 4.*10:00/);
  await user.click(screen.getByRole("button",{name:"Refresh data"}));
  expect(base.onRefresh).toHaveBeenCalledOnce();
});
it("keeps refreshing feedback accessible and blocks duplicate refresh requests",()=>{
  const base=props();render(<HomeHeader {...base} refreshing />);
  expect(screen.getByRole("button",{name:"Refresh data"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Refresh data"})).toHaveAttribute("aria-busy","true");
  expect(screen.getByRole("status")).toHaveTextContent("Refreshing accounts…");
  expect(screen.getByRole("button",{name:"Settings"})).toBeEnabled();
});

it("offers one settings action and keeps workspace editing in the picker", async () => {
  const user = userEvent.setup(), base = props(), settings = vi.fn();
  render(<HomeHeader {...base} onSettings={settings} />);
  expect(screen.getAllByRole("button", { name: "Settings" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Settings" })).toHaveTextContent("");
  expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create workspace" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(settings).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  expect(screen.getByRole("button", { name: "Rename" }).closest("[role=listbox]")).toBeNull();
  expect(screen.getByRole("button", { name: "New workspace" })).toBeInTheDocument();
});
it("keeps settings available while workspace changes are busy", () => {
  render(<HomeHeader {...props()} workspaceBusy addBusy />);
  expect(screen.getByRole("button", { name: "Add account" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Quit Orbilap" })).not.toBeInTheDocument();
});

it("keeps account actions in the header and opens enrollment from the compact add action", async () => {
  const base = props(), user = userEvent.setup();
  render(<HomeHeader {...base} />);
  const actions = screen.getByRole("group", { name: "Account and app actions" });
  expect(screen.getByRole("banner")).toContainElement(actions);
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add account" }));
  expect(base.onAdd).toHaveBeenCalledOnce();
});
it("retains quit if no workspace can be loaded", () => {
  render(<HomeHeader {...props()} workspace={undefined} workspaces={[]} />);
  expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quit Orbilap" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Add account" })).not.toBeInTheDocument();
});
