import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AccountRemovalDialog } from "./AccountRemovalDialog";

afterEach(cleanup);
const profile = { name: "Work account", email: "work@example.com" };

it("shows only identity and confirmation actions, and removes from the current workspace", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  render(<AccountRemovalDialog provider="codex" profile={profile} workspace={{ name: "Studio" }} busy={false} onClose={vi.fn()} onConfirm={confirm} />);
  const dialog = screen.getByRole("alertdialog", { name: "Remove account?" });
  expect(within(dialog).getByText(profile.name)).toBeVisible();
  expect(within(dialog).getByText(profile.email)).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/signed in|saved login|All workspaces/)).not.toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove" }));
  expect(confirm).toHaveBeenCalledWith(false, true);
});

it("confirms standalone profile removal with the keyboard", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  render(<AccountRemovalDialog provider="claude" profile={profile} noun="profile" busy={false} onClose={vi.fn()} onConfirm={confirm} />);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(confirm).toHaveBeenCalledWith(true, false);
});

it("returns focus to the opener after Escape without removing anything", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Remove account</button>{open ? <AccountRemovalDialog provider="claude" profile={profile} busy={false} onClose={() => setOpen(false)} onConfirm={confirm} /> : null}</>;
  }
  render(<Fixture />);
  const opener = screen.getByRole("button", { name: "Remove account" });
  await user.click(opener);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(confirm).not.toHaveBeenCalled();
});

it("locks actions and dismissal while removal is in progress", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(<AccountRemovalDialog provider="antigravity" profile={profile} workspace={{ name: "Studio" }} busy onClose={close} onConfirm={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Removing…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(close).not.toHaveBeenCalled();
});
