import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BatchAuthImport } from "./BatchAuthImport";
import type { Enrollment } from "./AccountEnrollment";
import type { SetupAccount } from "../api";

vi.mock("./DeviceSync", () => ({ DeviceSettingsEntry: () => null }));
afterEach(cleanup);

it("keeps one locked action through partial verification and reuses it to continue after errors", async () => {
  let result!: NonNullable<Parameters<Enrollment["verifyFiles"]>[1]>;
  let finish!: () => void;
  const draft = {
    busy: false, pending: false, addMany: vi.fn(),
    verifyFiles: vi.fn((_files, onResult) => {
      result = onResult;
      return new Promise<void>(resolve => { finish = resolve; });
    }),
  } as unknown as Enrollment;
  const onContinue = vi.fn().mockResolvedValue(undefined);
  const { container } = render(<BatchAuthImport draft={draft} onDirtyChange={vi.fn()} onReadingChange={vi.fn()} onContinue={onContinue} signInContent={null} />);
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText("Choose auth.json file"), [
    new File(['{"tokens":{"test":"one"}}'], "one.json", { type: "application/json" }),
    new File(['{"tokens":{"test":"two"}}'], "two.json", { type: "application/json" }),
  ]);
  await screen.findByText("2 files");
  const action = screen.getByRole("button", { name: "Verify accounts" });
  await user.click(action);
  const account: SetupAccount = { id: "test", provider: "codex", name: "Test", email: null, subscription: { id: "test", service: "chatgpt", plan: "plus" } };
  await act(async () => { result(0, { account }); });
  expect(action).toHaveTextContent("Verifying…");
  expect(action).toBeDisabled();
  expect(within(container.querySelector(".batch-auth-actions")!).getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Continue with/ })).not.toBeInTheDocument();
  await act(async () => { result(1, { error: "Invalid login file" }); finish(); });
  expect(screen.getByRole("button", { name: "Continue with 1 account" })).toBe(action);
  expect(action).toBeEnabled();
  await user.click(action);
  expect(onContinue).toHaveBeenCalledExactlyOnceWith([account]);
});
