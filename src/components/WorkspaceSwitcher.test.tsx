import { render, findErrorToast } from "../test/notifications";
import { act, cleanup, fireEvent,  screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { DEFAULT_WORKSPACE_USAGE } from "../types";

const studio = { id: "studio", name: "Studio", accent: "#007aff", accountIds: [], usage: DEFAULT_WORKSPACE_USAGE };
const workspaces = [studio, { ...studio, id: "lab", name: "Research lab" }, { ...studio, id: "personal", name: "Personal" }];
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
});

function controlledAnimations(reduced = false) {
  const finishers: (() => void)[] = [];
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({
    finished: new Promise<void>(resolve => { finishers.push(resolve); }), cancel: vi.fn(),
  }));
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: animate });
  return { animate, finishers };
}

it("focuses the current workspace and navigates the full list with the keyboard", async () => {
  const user = userEvent.setup(), select = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={select} onCreate={vi.fn()} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Studio" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("button", { name: "Research lab" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(select).toHaveBeenCalledExactlyOnceWith("lab");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("offers creation and never reselects the current workspace", async () => {
  const user = userEvent.setup(), select = vi.fn(), create = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={select} onCreate={create} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "Studio" }));
  expect(select).not.toHaveBeenCalled();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "New workspace" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
});

it("closes with Escape and prevents opening during a workspace switch", async () => {
  const user = userEvent.setup();
  const props = { workspace: studio, workspaces, status: null, onSelect: vi.fn(), onCreate: vi.fn() };
  const view = render(<WorkspaceSwitcher {...props} busy={false} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toHaveAttribute("data-motion", "instant");
  await user.keyboard("{Escape}");
  view.rerender(<WorkspaceSwitcher {...props} busy />);
  expect(screen.getByRole("combobox", { name: "Workspace" })).toBeDisabled();
});

it("keeps assistive click activation instant after a previous pointer opening", async () => {
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close workspace picker" }));
  fireEvent.click(trigger, { detail: 0 });
  expect(screen.getByRole("dialog")).toHaveAttribute("data-motion", "instant");
});

it.each(["close button", "outside click", "workspace selection"])("finishes the exit before unmounting after %s", async method => {
  const { finishers } = controlledAnimations();
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  if (method === "close button") await user.click(screen.getByRole("button", { name: "Close workspace picker" }));
  else if (method === "outside click") await user.click(document.querySelector(".workspace-picker-overlay")!);
  else await user.click(screen.getByRole("button", { name: "Research lab" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => { finishers.forEach(finish => finish()); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("lets an exit finish when Escape is pressed during pointer dismissal", async () => {
  const { finishers } = controlledAnimations();
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close workspace picker" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => { finishers.forEach(finish => finish()); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("animates Escape dismissal after a keyboard opening", async () => {
  const { animate, finishers } = controlledAnimations();
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
  screen.getByRole("combobox", { name: "Workspace" }).focus();
  await user.keyboard("{Enter}");
  expect(animate).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(animate).toHaveBeenCalled();
  await act(async () => { finishers.forEach(finish => finish()); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("uses opacity-only motion when reduced motion is requested", async () => {
  const { animate } = controlledAnimations(true);
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  expect(animate).toHaveBeenCalled();
  for (const [frames, options] of animate.mock.calls) {
    expect(options.duration).toBe(100);
    expect(frames.every(frame => !("transform" in frame))).toBe(true);
  }
});


it.each(["New workspace"])("waits for picker exit before opening %s and keeps a stable focus origin", async label => {
  const { finishers } = controlledAnimations();
  const user = userEvent.setup(), create = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={create} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  await act(async () => { finishers.forEach(finish => finish()); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(create).toHaveBeenCalledExactlyOnceWith(trigger);
});

it("edits only the name, focuses and selects it, and saves a trimmed name without selecting a workspace", async () => {
  const user = userEvent.setup(), rename = vi.fn().mockResolvedValue(undefined), select = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={select} onCreate={vi.fn()} onRename={rename} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  const edit = screen.getByRole("button", { name: "Rename" });
  expect(edit.closest("[role=listbox]")).toBeNull();
  await user.click(edit);
  const input = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
  expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, studio.name.length]);
  expect(screen.queryByRole("option", { name: "Studio" })).not.toBeInTheDocument();
  await user.clear(input); await user.type(input, "  Office  {Enter}");
  await waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith("Office"));
  expect(select).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus();
});

it("cancels editing on the first Escape, closes on the next, and never saves on dismissal", async () => {
  const user = userEvent.setup(), rename = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onRename={rename} />);
  const trigger = screen.getByRole("combobox", { name: "Workspace" });
  await user.click(trigger); await user.click(screen.getByRole("button", { name: "Rename" }));
  await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "Unsaved");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  await user.click(trigger); await user.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveValue("Studio");
  await user.clear(screen.getByRole("textbox", { name: "Workspace name" }));
  await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "Discarded");
  await user.click(document.querySelector(".workspace-picker-overlay")!);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(rename).not.toHaveBeenCalled();
  await user.click(trigger);
  expect(screen.getByRole("option", { name: "Studio" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveValue("Studio");
});

it("keeps the draft and reports a Sonner error on failure, and supports an explicit retry", async () => {
  const user = userEvent.setup(), rename = vi.fn().mockRejectedValueOnce(new Error("Rename failed")).mockResolvedValueOnce(undefined);
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onRename={rename} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));
  const input = screen.getByRole("textbox", { name: "Workspace name" });
  await user.clear(input); await user.type(input, "Office");
  await user.click(screen.getByRole("button", { name: "Save workspace name" }));
  expect(await findErrorToast("Rename failed")).toHaveTextContent("Rename failed");
  expect(input).toHaveValue("Office"); expect(input).not.toHaveAttribute("aria-describedby");
  await user.click(screen.getByRole("button", { name: "Save workspace name" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus());
  expect(rename).toHaveBeenCalledTimes(2);
});

it("blocks duplicate requests, selection, creation and every dismissal while saving", async () => {
  const user = userEvent.setup(); let finish!: () => void;
  const rename = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onRename={rename} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));
  await user.clear(screen.getByRole("textbox", { name: "Workspace name" }));
  await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "Office{Enter}{Enter}");
  expect(rename).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Save workspace name" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Close workspace picker" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "New workspace" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Research lab" })).toBeDisabled();
  await user.keyboard("{Escape}"); await user.click(document.querySelector(".workspace-picker-overlay")!);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => finish());
  expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus();
});

it("rejects blank names and exits an unchanged edit without a write", async () => {
  const user = userEvent.setup(), rename = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onRename={rename} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));
  await user.clear(screen.getByRole("textbox", { name: "Workspace name" }));
  await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "   ");
  expect(screen.getByRole("button", { name: "Save workspace name" })).toBeDisabled();
  await user.clear(screen.getByRole("textbox", { name: "Workspace name" }));
  await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "Studio{Enter}");
  expect(rename).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus();
});

it("uses immediate keyboard edit and cancel after a pointer edit", async () => {
  const user = userEvent.setup();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));
  const card = document.querySelector(".workspace-current-card");
  expect(card).toHaveAttribute("data-rename-motion", "pointer");
  await user.keyboard("{Escape}");
  expect(card).toHaveAttribute("data-rename-motion", "instant");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveFocus();
  expect(card).toHaveAttribute("data-rename-motion", "instant");
});

it("confirms workspace deletion with safe focus and keeps cancellation local", async () => {
  const user = userEvent.setup(), remove = vi.fn();
  render(<WorkspaceSwitcher workspace={studio} workspaces={workspaces} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onDelete={remove} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  const confirmation = screen.getByRole("alertdialog", { name: "Delete workspace?" });
  expect(confirmation).toHaveAccessibleDescription("Studio Workspace settings will be deleted.");
  expect(confirmation).not.toHaveTextContent(/Saved accounts and CLI sign-ins|Orbilap will open another workspace/);
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveFocus();
  expect(remove).not.toHaveBeenCalled();
});

it("locks confirmation while deleting and allows retry after an error", async () => {
  const user = userEvent.setup();
  let reject!: (error: Error) => void;
  const remove = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce(undefined);
  render(<WorkspaceSwitcher workspace={studio} workspaces={[studio]} busy={false} status={null} onSelect={vi.fn()} onCreate={vi.fn()} onDelete={remove} />);
  await user.click(screen.getByRole("combobox", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  expect(screen.getByRole("alertdialog")).not.toHaveTextContent("You can create a new workspace afterward");
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  await act(async () => reject(new Error("Cannot save workspace settings")));
  expect(await findErrorToast("Cannot save workspace settings")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(remove).toHaveBeenCalledTimes(2);
});
