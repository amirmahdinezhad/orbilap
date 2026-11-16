import { render, findErrorToast } from "../test/notifications";
import { act, cleanup, fireEvent,  screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@tauri-apps/api/event";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import { AuthFileInput } from "./AuthFileInput";

const native = vi.hoisted(() => ({ enabled: false, listen: vi.fn(), stop: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent: native.listen }) }));
const credentials = '{"tokens":{"synthetic":"test-only"}}';
const file = () => new File([credentials], "auth.json", { type: "application/json" });
let handler: (event: Event<DragDropEvent>) => void;
const props = () => ({ value: null, disabled: false, onChange: vi.fn(), onReadingChange: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks(); native.enabled = false;
  native.invoke.mockResolvedValue(undefined);
  native.listen.mockImplementation((next) => { handler = next; return Promise.resolve(native.stop); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("opens the chooser and reads one selected JSON file", async () => {
  const user = userEvent.setup(); const callbacks = props(); render(<AuthFileInput {...callbacks} />);
  const input = screen.getByLabelText("Choose auth.json file");
  const click = vi.spyOn(input, "click");
  await user.click(screen.getByRole("button", { name: "Choose file" }));
  expect(click).toHaveBeenCalledTimes(1);
  await user.upload(input, file());
  await waitFor(() => expect(callbacks.onChange).toHaveBeenLastCalledWith({ name: "auth.json", credentials }));
  expect(callbacks.onReadingChange.mock.calls).toEqual([[true], [false]]);
});

it("accepts a browser file drop and resets its hover state", async () => {
  const callbacks = props(); render(<AuthFileInput {...callbacks} />);
  const zone = screen.getByRole("group", { name: "Auth file upload" });
  fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } });
  expect(zone).toHaveClass("is-dragging");
  fireEvent.dragLeave(zone, { relatedTarget: document.body });
  expect(zone).not.toHaveClass("is-dragging");
  fireEvent.drop(zone, { dataTransfer: { files: [file()] } });
  await waitFor(() => expect(callbacks.onChange).toHaveBeenLastCalledWith({ name: "auth.json", credentials }));
  expect(native.listen).not.toHaveBeenCalled();
});

it.each([
  ["multiple files", () => [file(), file()], "Choose one auth.json file at a time."],
  ["a non-JSON file", () => [new File([credentials], "auth.txt")], "Choose a JSON file"],
  ["an oversized file", () => [new File(["x".repeat(256 * 1024 + 1)], "auth.json")], "smaller than 256 KB"],
  ["malformed JSON", () => [new File(["not JSON"], "auth.json")], "not valid auth.json JSON"],
] as const)("rejects %s without retaining an earlier selection", async (_label, files, message) => {
  const callbacks = props(); render(<AuthFileInput {...callbacks} value={{ name: "earlier.json", credentials }} />);
  fireEvent.drop(screen.getByRole("group"), { dataTransfer: { files: files() } });
  expect(await findErrorToast(message)).toHaveTextContent(message);
  expect(callbacks.onChange).toHaveBeenCalledExactlyOnceWith(null);
});

it("allows the same file to be selected again and reports read failures", async () => {
  const callbacks = props(); render(<AuthFileInput {...callbacks} />);
  const read = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
    this.dispatchEvent(new ProgressEvent("error"));
    this.dispatchEvent(new ProgressEvent("loadend"));
  });
  const input = screen.getByLabelText("Choose auth.json file");
  await userEvent.setup().upload(input, file());
  expect(await findErrorToast("Couldn't read this file")).toHaveTextContent("Couldn't read this file");
  expect(input).toHaveValue("");
  expect(callbacks.onReadingChange).toHaveBeenLastCalledWith(false);
  read.mockRestore();
  await userEvent.setup().upload(input, file());
  await waitFor(() => expect(callbacks.onChange).toHaveBeenLastCalledWith({ name: "auth.json", credentials }));
});

it("ignores file drops and disables the chooser during save", () => {
  const callbacks = props(); render(<AuthFileInput {...callbacks} disabled />);
  fireEvent.drop(screen.getByRole("group"), { dataTransfer: { files: [file()] } });
  expect(callbacks.onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Choose file" })).toBeDisabled();
});

it("aborts a pending file read when the form is discarded", async () => {
  const callbacks = props();
  vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(() => {});
  const abort = vi.spyOn(FileReader.prototype, "abort");
  const { unmount } = render(<AuthFileInput {...callbacks} />);
  await userEvent.setup().upload(screen.getByLabelText("Choose auth.json file"), file());
  expect(screen.getByRole("group")).toHaveAttribute("aria-busy", "true");
  unmount();
  expect(abort).toHaveBeenCalledTimes(1);
  expect(callbacks.onChange).toHaveBeenCalledExactlyOnceWith(null);
});

describe("native Finder drops", () => {
  it("keeps the panel open until file import is unmounted", async () => {
    native.enabled = true;
    const { rerender, unmount } = render(<AuthFileInput {...props()} />);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith("set_panel_file_import", { active: true }));
    rerender(<AuthFileInput {...props()} disabled />);
    expect(native.invoke).toHaveBeenCalledTimes(1);
    unmount();
    await waitFor(() => expect(native.invoke).toHaveBeenLastCalledWith("set_panel_file_import", { active: false }));
  });

  it("orders cleanup before a replacement import even while IPC is pending", async () => {
    native.enabled = true;
    let finish!: () => void;
    native.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = render(<AuthFileInput {...props()} />);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = render(<AuthFileInput {...props()} />);
    expect(native.invoke).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(native.invoke.mock.calls.map(([, args]) => args.active)).toEqual([true, false, true]));
    second.unmount();
    await waitFor(() => expect(native.invoke).toHaveBeenLastCalledWith("set_panel_file_import", { active: false }));
  });
  async function setup() {
    native.enabled = true; const callbacks = props();
    const view = render(<AuthFileInput {...callbacks} />);
    await waitFor(() => expect(native.listen).toHaveBeenCalled());
    vi.spyOn(screen.getByRole("group"), "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, right: 210, bottom: 220 } as DOMRect);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    return { ...view, callbacks };
  }
  function emit(payload: object) { act(() => handler({ event: "test", id: 1, payload } as Event<DragDropEvent>)); }

  it("scales native coordinates and accepts a single path only inside the drop area", async () => {
    const { callbacks } = await setup();
    emit({ type: "enter", paths: ["/tmp/Work Account/auth.json"], position: { x: 100, y: 100 } });
    expect(screen.getByRole("group")).toHaveClass("is-dragging");
    emit({ type: "drop", paths: ["/tmp/Work Account/auth.json"], position: { x: 100, y: 100 } });
    expect(callbacks.onChange).toHaveBeenLastCalledWith({ name: "auth.json", path: "/tmp/Work Account/auth.json" });
    expect(screen.getByRole("group")).not.toHaveClass("is-dragging");
    callbacks.onChange.mockClear();
    emit({ type: "drop", paths: ["/tmp/other.json"], position: { x: 500, y: 500 } });
    expect(callbacks.onChange).not.toHaveBeenCalled();
  });

  it("rejects multiple files and non-JSON native paths", async () => {
    const { callbacks } = await setup();
    emit({ type: "drop", paths: ["/tmp/a.json", "/tmp/b.json"], position: { x: 100, y: 100 } });
    expect(await findErrorToast("Choose one auth.json file at a time.")).toHaveTextContent("Choose one auth.json file at a time.");
    emit({ type: "drop", paths: ["/tmp/auth.txt"], position: { x: 100, y: 100 } });
    expect(await findErrorToast("Choose a JSON file")).toHaveTextContent("Choose a JSON file");
    expect(callbacks.onChange.mock.calls).toEqual([[null], [null]]);
  });

  it("uses current disabled state and removes native listeners on unmount", async () => {
    const { callbacks, rerender, unmount } = await setup();
    rerender(<AuthFileInput {...callbacks} disabled />);
    emit({ type: "drop", paths: ["/tmp/auth.json"], position: { x: 100, y: 100 } });
    expect(callbacks.onChange).not.toHaveBeenCalled();
    unmount();
    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it("cleans up a listener that finishes registering after unmount", async () => {
    native.enabled = true;
    let resolve!: (stop: () => void) => void;
    native.listen.mockReturnValue(new Promise<() => void>((done) => { resolve = done; }));
    const { unmount } = render(<AuthFileInput {...props()} />);
    unmount();
    await act(async () => resolve(native.stop));
    expect(native.stop).toHaveBeenCalledTimes(1);
  });
});

it("reads multiple JSON files and keeps per-file errors beside valid selections", async () => {
  const callbacks = props(); const onFiles = vi.fn();
  render(<AuthFileInput {...callbacks} onFiles={onFiles} />);
  expect(screen.getByLabelText("Choose auth.json file")).toHaveAttribute("multiple");
  await userEvent.setup().upload(screen.getByLabelText("Choose auth.json file"), [file(), new File(["broken"], "bad.json"), new File(["{}"], "second.json")]);
  await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
  expect(onFiles.mock.calls[0][0]).toEqual([
    { name: "auth.json", file: { name: "auth.json", credentials } },
    { name: "bad.json", file: null, error: "This is not valid JSON." },
    { name: "second.json", file: { name: "second.json", credentials: "{}" } },
  ]);
  expect(callbacks.onReadingChange).toHaveBeenLastCalledWith(false);
});

it("accepts several Finder paths in batch mode and keeps file-type errors local", async () => {
  native.enabled = true; const onFiles = vi.fn();
  render(<AuthFileInput {...props()} onFiles={onFiles} />);
  await waitFor(() => expect(native.listen).toHaveBeenCalled());
  vi.spyOn(screen.getByRole("group"), "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 300, bottom: 300 } as DOMRect);
  act(() => handler({ event: "test", id: 1, payload: { type: "drop", paths: ["/tmp/a.json", "/tmp/b.json", "/tmp/bad.txt"], position: { x: 10, y: 10 } } } as Event<DragDropEvent>));
  expect(onFiles).toHaveBeenCalledWith([
    { name: "a.json", file: { name: "a.json", path: "/tmp/a.json" } },
    { name: "b.json", file: { name: "b.json", path: "/tmp/b.json" } },
    { name: "bad.txt", file: null, error: "Choose a JSON file." },
  ]);
});

it("bounds a multi-file read and rejects oversized entries without discarding the rest", async () => {
  const onFiles = vi.fn(); const callbacks = props();
  render(<AuthFileInput {...callbacks} onFiles={onFiles} />);
  const files = [new File(["x".repeat(256 * 1024 + 1)], "large.json"), ...Array.from({ length: 20 }, (_, i) => new File(["{}"], `file-${i}.json`))];
  fireEvent.drop(screen.getByRole("group"), { dataTransfer: { files } });
  await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
  expect(onFiles.mock.calls[0][0]).toHaveLength(20);
  expect(onFiles.mock.calls[0][0][0]).toEqual({ name: "large.json", file: null, error: "Use a file smaller than 256 KB." });
  expect(await findErrorToast("up to 20")).toHaveTextContent("up to 20");
});

it("aborts a multi-file read without delivering late file contents", async () => {
  const onFiles = vi.fn();
  vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(() => {});
  const abort = vi.spyOn(FileReader.prototype, "abort");
  const view = render(<AuthFileInput {...props()} onFiles={onFiles} />);
  await userEvent.setup().upload(screen.getByLabelText("Choose auth.json file"), [file(), file()]);
  view.unmount();
  expect(abort).toHaveBeenCalledTimes(1);
  expect(onFiles).not.toHaveBeenCalled();
});

it("announces the native multi-file drag count and accepts drops over the whole import section", async () => {
  native.enabled = true; const onFiles = vi.fn();
  const scope = document.createElement("section");
  document.body.append(scope);
  const dropTargetRef = { current: scope };
  vi.spyOn(scope, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 300, bottom: 500 } as DOMRect);
  render(<AuthFileInput {...props()} onFiles={onFiles} dropTargetRef={dropTargetRef} />);
  await waitFor(() => expect(native.listen).toHaveBeenCalled());
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  act(() => handler({ event: "test", id: 1, payload: { type: "enter", paths: ["/tmp/a.json", "/tmp/b.json"], position: { x: 100, y: 800 } } } as Event<DragDropEvent>));
  expect(screen.getByText("Drop 2 files to add")).toBeVisible();
  expect(screen.getByRole("group")).toHaveClass("is-dragging");
  act(() => handler({ event: "test", id: 1, payload: { type: "over", position: { x: 100, y: 800 } } } as Event<DragDropEvent>));
  expect(screen.getByText("Drop 2 files to add")).toBeVisible();
  act(() => handler({ event: "test", id: 1, payload: { type: "drop", paths: ["/tmp/a.json", "/tmp/b.json"], position: { x: 100, y: 800 } } } as Event<DragDropEvent>));
  expect(onFiles).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("group")).not.toHaveClass("is-dragging");
  scope.remove();
});

it("uses macOS WebKit logical drag coordinates on Retina instead of dividing them twice", async () => {
  native.enabled = true; const onFiles = vi.fn();
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15");
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  render(<AuthFileInput {...props()} onFiles={onFiles} />);
  await waitFor(() => expect(native.listen).toHaveBeenCalled());
  vi.spyOn(screen.getByRole("group"), "getBoundingClientRect").mockReturnValue({ left: 20, top: 200, right: 350, bottom: 400 } as DOMRect);
  act(() => handler({ event: "test", id: 1, payload: { type: "enter", paths: ["/tmp/a.json", "/tmp/b.json"], position: { x: 100, y: 300 } } } as Event<DragDropEvent>));
  expect(screen.getByText("Drop 2 files to add")).toBeVisible();
  act(() => handler({ event: "test", id: 1, payload: { type: "drop", paths: ["/tmp/a.json", "/tmp/b.json"], position: { x: 100, y: 300 } } } as Event<DragDropEvent>));
  expect(onFiles).toHaveBeenCalledTimes(1);
});
