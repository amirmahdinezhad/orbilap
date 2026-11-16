import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AppModal, ModalPageHeader } from "./AppModal";

afterEach(cleanup);

it("uses one heading across steps and restores the parent header when the step ends", async () => {
  const user = userEvent.setup();
  function Flow() {
    const [step, setStep] = useState(false);
    return <AppModal open title="Add account" onClose={() => {}}>
      {step ? <ModalPageHeader title="Import login files" provider="codex" onBack={() => setStep(false)} backLabel="Sign-in options" /> : null}
      <button onClick={() => setStep(true)}>Choose files</button>
    </AppModal>;
  }
  render(<Flow />);
  const heading = screen.getByRole("heading", { name: "Add account" });
  await user.click(screen.getByRole("button", { name: "Choose files" }));
  expect(screen.getByRole("dialog", { name: "Import login files" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Import login files" })).toBe(heading);
  await waitFor(() => expect(heading).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Sign-in options" }));
  expect(screen.getByRole("dialog", { name: "Add account" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sign-in options" })).not.toBeInTheDocument();
});

it("keeps a page's cancellable back action available during background discovery", async () => {
  const user = userEvent.setup();
  const back = vi.fn();
  render(<AppModal open title="Add account" onClose={() => {}} busy>
    <ModalPageHeader title="Claude" provider="claude" onBack={back} backLabel="All providers" />
  </AppModal>);
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "All providers" }));
  expect(back).toHaveBeenCalledOnce();
});

it("retains the dirty-draft guard and uses the current back callback", async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const latest = vi.fn();
  const content = (back: () => void) => <AppModal open title="Profiles" onClose={() => {}} hasUnsavedChanges>
    <ModalPageHeader title="Edit account" onBack={back} backLabel="All profiles" preserveDraftOnBack={false} />
  </AppModal>;
  const view = render(content(first));
  view.rerender(content(latest));
  await user.click(screen.getByRole("button", { name: "All profiles" }));
  expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
  expect(latest).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(latest).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
});
