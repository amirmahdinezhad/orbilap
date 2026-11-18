import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { AppSettings } from "../types";

const { mockCheck, mockRelaunch, mockGetVersion } = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockRelaunch: vi.fn(async () => {}),
  mockGetVersion: vi.fn(async () => "1.0.0"),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mockCheck }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mockRelaunch }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mockGetVersion }));

vi.mock("../api", () => ({
  setAppSettings: vi.fn(async (settings: Partial<AppSettings>) =>
    makeState({ app: { ...makeState().app, ...settings } }),
  ),
  setSettings: vi.fn(),
  quitApp: vi.fn(async () => {}),
  prettyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { SettingsModal, SKIPPED_UPDATE_KEY } from "./SettingsModal";
import { makeState } from "../test/fixtures";

function renderModal(initialState = makeState(), notify = vi.fn()) {
  function SettingsHarness() {
    const [state, setState] = useState(initialState);
    return (
      <SettingsModal
        open
        onClose={() => {}}
        state={state}
        onChanged={setState}
        notify={notify}
      />
    );
  }
  return render(<SettingsHarness />);
}

async function openUpdatesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Updates" }));
}

function fakeUpdate() {
  return {
    version: "9.9.9",
    currentVersion: "1.0.0",
    body: "Bug fixes.",
    download: vi.fn(async (onEvent: (e: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
      onEvent({ event: "Finished" });
    }),
    install: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockCheck.mockReset().mockResolvedValue(null);
});

afterEach(cleanup);

describe("SettingsModal updates", () => {
  it("keeps checking feedback in notifications and prevents duplicate requests", async () => {
    const user = userEvent.setup(), notify = vi.fn();
    let resolveCheck!: (value: null) => void;
    mockCheck.mockReturnValue(new Promise<null>((resolve) => { resolveCheck = resolve; }));
    const view = renderModal(makeState(), notify);
    await openUpdatesTab(user);
    expect(view.baseElement.querySelector(".update-status")).toBeNull();
    const button = screen.getByRole("button", { name: "Check for updates" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    await user.click(button);
    expect(notify).toHaveBeenCalledWith("Checking for updates…");
    const checking = screen.getByRole("button", { name: "Checking for updates" });
    expect(checking).toBe(button);
    expect(checking).toHaveClass("ui-button-secondary");
    expect(checking).toBeDisabled();
    expect(checking).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Checking for updates…")).not.toBeInTheDocument();
    await user.click(checking);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    resolveCheck(null);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("You're on the latest version.", "ok"));
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });
  it("shows the running version and reports when on latest", async () => {
    const user = userEvent.setup();
    mockCheck.mockResolvedValue(null);
    const notify = vi.fn();
    renderModal(makeState(), notify);
    await openUpdatesTab(user);

    expect(await screen.findByText("1.0.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith("You're on the latest version.", "ok"));
    expect(screen.queryByText("You're on the latest version.")).not.toBeInTheDocument();
  });

  it("offers download and skip with release notes when an update exists", async () => {
    const user = userEvent.setup();
    mockCheck.mockResolvedValue({
      ...fakeUpdate(),
      body: "# Orbilap 9.9.9\n\n## Fixes\n\n- Bug fixes.\n- <script>plain text</script>",
    });
    const notify = vi.fn();
    renderModal(makeState(), notify);
    await openUpdatesTab(user);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Version 9.9.9 is available", "ok"));
    expect(screen.queryByText("Version 9.9.9 is available")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "What's new" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByText("Bug fixes.")).not.toBeInTheDocument();

    await user.click(trigger);
    const notes = screen.getByRole("dialog", { name: "What's new" });
    expect(within(notes).getByText("Version 9.9.9")).toBeVisible();
    expect(within(notes).getByRole("heading", { name: "Fixes" })).toBeVisible();
    expect(within(notes).getByRole("list")).toHaveTextContent("Bug fixes.");
    expect(within(notes).getByText("<script>plain text</script>")).toBeVisible();
    expect(within(notes).getByRole("region", { name: "Release notes" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "What's new" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("button", { name: "Download update" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip this version" })).toBeEnabled();
  });

  it("manual checks reveal a skipped release again", async () => {
    const user = userEvent.setup();
    mockCheck.mockResolvedValue(fakeUpdate());
    const notify = vi.fn();
    renderModal(makeState(), notify);
    await openUpdatesTab(user);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await user.click(
      await screen.findByRole("button", { name: "Skip this version" }),
    );

    expect(localStorage.getItem(SKIPPED_UPDATE_KEY)).toBe("9.9.9");
    expect(notify).toHaveBeenCalledWith("Version 9.9.9 skipped", "ok");
    expect(screen.queryByRole("button", { name: "What's new" })).not.toBeInTheDocument();
    expect(screen.queryByText("You're on the latest version.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Download update" })).toBeInTheDocument();

  });

  it("downloads with progress, then installs and relaunches", async () => {
    const user = userEvent.setup();
    const update = fakeUpdate();
    mockCheck.mockResolvedValue(update);
    const notify = vi.fn();
    renderModal(makeState(), notify);
    await openUpdatesTab(user);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await user.click(await screen.findByRole("button", { name: "Download update" }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith("Version 9.9.9 downloaded", "ok"));
    expect(screen.queryByText("Version 9.9.9 downloaded")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Install & relaunch" }),
    );
    expect(update.install).toHaveBeenCalledTimes(1);
    expect(mockRelaunch).toHaveBeenCalledTimes(1);
  });

  it("reports check failures only through notifications and allows retry", async () => {
    const user = userEvent.setup();
    mockCheck.mockRejectedValueOnce(new Error("offline"));
    const notify = vi.fn();
    renderModal(makeState(), notify);
    await openUpdatesTab(user);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith("offline", "err"));
    expect(screen.queryByText("offline")).not.toBeInTheDocument();
    expect(screen.queryByText("Keep Orbilap up to date.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("You're on the latest version.", "ok"));
  });

  it("automatic checks respect the skipped version without downloading", async () => {
    const update = fakeUpdate();
    mockCheck.mockResolvedValue(update);
    localStorage.setItem(SKIPPED_UPDATE_KEY, update.version);
    const { DEFAULT_DISPLAY_PREFS } = await import("../displayPrefs");
    render(<SettingsModal open={false} onClose={() => {}} state={makeState()}
      onChanged={() => {}} notify={() => {}}
      display={{ ...DEFAULT_DISPLAY_PREFS, checkUpdatesOnLaunch: true }} />);
    await waitFor(() => expect(localStorage.getItem("orbilap.lastUpdateCheck")).toBeTruthy());
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
  });

  it("a failed download leaves a retry without installing or relaunching", async () => {
    const user = userEvent.setup();
    const update = fakeUpdate();
    update.download.mockRejectedValue(new Error("Download interrupted"));
    mockCheck.mockResolvedValue(update);
    const notify = vi.fn();
    renderModal(makeState(), notify); await openUpdatesTab(user);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await user.click(await screen.findByRole("button", { name: "Download update" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Download interrupted", "err"));
    expect(screen.queryByText("Download interrupted")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
    expect(update.install).not.toHaveBeenCalled();
    expect(mockRelaunch).not.toHaveBeenCalled();
  });
});


describe("restored global settings tabs", () => {
  it("keeps Clock format available and saves it in both deadline modes", async () => {
    const user = userEvent.setup();
    const view = renderModal();
    expect(screen.getByRole("radio", { name: "Time remaining" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Clock format" })).toBeVisible();
    const clock = screen.getByRole("radio", { name: "24-hour" });
    expect(clock).toBeChecked();
    clock.focus(); await user.keyboard("{ArrowRight}"); await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "AM/PM" })).toBeChecked();
    expect(JSON.parse(localStorage.getItem("orbilap.displayPrefs")!)).toMatchObject({ deadlineDisplay: "remaining", timeFormat: "12h" });
    await user.click(screen.getByRole("radio", { name: "Date & time" }));
    expect(screen.getByRole("radio", { name: "AM/PM" })).toBeChecked();
    const remaining = screen.getByRole("radio", { name: "Time remaining" });
    await user.click(remaining);
    expect(remaining).toHaveFocus();
    expect(screen.getByRole("radio", { name: "AM/PM" })).toBeChecked();
    view.unmount(); renderModal();
    expect(screen.getByRole("radio", { name: "Time remaining" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "AM/PM" })).toBeChecked();
  });
  it("shows General and Updates, while keeping alerts and menu-bar settings in the workspace", async () => {
    const user = userEvent.setup(); renderModal();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["General", "Updates"]);
    expect(screen.queryByRole("tab", { name: "Alerts" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Launch at login" })).toBeInTheDocument();
    for (const name of ["Updates", "General"]) {
      await user.click(screen.getByRole("tab", { name }));
      expect(screen.queryByRole("switch", { name: "Workspace alerts" })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Menu bar provider" })).not.toBeInTheDocument();
    }
  });
  it("shows Theme in General and persists its changes", async () => {
    const user = userEvent.setup(); renderModal();
    expect(screen.queryByRole("tab", { name: "Display" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Theme" })).getAllByRole("radio")).toHaveLength(3);
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(JSON.parse(localStorage.getItem("orbilap.displayPrefs")!)).toMatchObject({ theme: "light" });
  });
  it("saves launch behavior and refresh cadence from General", async () => {
    const { setSettings, setAppSettings } = await import("../api");
    vi.mocked(setSettings).mockResolvedValueOnce(makeState({ settings: { openAtLogin: true } }));
    const user = userEvent.setup(); renderModal();
    await user.click(screen.getByRole("switch", { name: "Launch at login" }));
    expect(setSettings).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("radio", { name: "120s" }));
    expect(setAppSettings).toHaveBeenCalledWith({ refreshIntervalSecs: 120 });
    expect(screen.getByRole("radio", { name: "120s" })).toBeChecked();
  });
  it("resets global values without replacing workspaces or account preferences", async () => {
    const { setAppSettings } = await import("../api"); const user = userEvent.setup(); renderModal();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(setAppSettings).toHaveBeenCalledExactlyOnceWith({ refreshIntervalSecs: 60, usageShowRemaining: true });
  });
  it("supports keyboard navigation between tabs", async () => {
    const user = userEvent.setup(); renderModal(); const general = screen.getByRole("tab", { name: "General" });
    general.focus(); await user.keyboard("{ArrowRight}");
    const updates = screen.getByRole("tab", { name: "Updates" });
    expect(updates).toHaveFocus(); expect(updates).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", updates.id);
    await user.keyboard("{Home}"); expect(general).toHaveFocus();
  });
  it("automatically downloads while closed and keeps installation ready when reopened", async () => {
    const update = fakeUpdate(); mockCheck.mockResolvedValue(update);
    const { DEFAULT_DISPLAY_PREFS } = await import("../displayPrefs");
    const props = { onClose: vi.fn(), state: makeState(), onChanged: vi.fn(), notify: vi.fn(), display: { ...DEFAULT_DISPLAY_PREFS, checkUpdatesOnLaunch: true } };
    const view = render(<SettingsModal {...props} open={false} />);
    await waitFor(() => expect(update.download).toHaveBeenCalledTimes(1));
    expect(update.install).not.toHaveBeenCalled();
    view.rerender(<SettingsModal {...props} open />);
    const user = userEvent.setup(); await openUpdatesTab(user);
    expect(await screen.findByRole("button", { name: "Install & relaunch" })).toBeInTheDocument();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(update.install).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "What's new" }));
    expect(within(screen.getByRole("dialog", { name: "What's new" })).getByText("Bug fixes.")).toBeVisible();
  });
  it("leaves the saved theme intact when a reset cannot be saved", async () => {
    const { setAppSettings } = await import("../api"); const user = userEvent.setup();
    localStorage.setItem("orbilap.displayPrefs", JSON.stringify({ theme: "light" }));
    vi.mocked(setAppSettings).mockRejectedValueOnce(new Error("Save failed")); renderModal();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

it("keeps quit in General and only quits after its explicit action", async () => {
  const { quitApp } = await import("../api");
  const user = userEvent.setup();
  renderModal();
  expect(quitApp).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Quit Orbilap" }));
  expect(quitApp).toHaveBeenCalledOnce();
});
it("reports a failed quit without dismissing settings", async () => {
  const { quitApp } = await import("../api");
  vi.mocked(quitApp).mockRejectedValueOnce(new Error("Quit unavailable"));
  const notify = vi.fn(), user = userEvent.setup();
  render(<SettingsModal open onClose={vi.fn()} state={makeState()} onChanged={vi.fn()} notify={notify} />);
  await user.click(screen.getByRole("button", { name: "Quit Orbilap" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Quit unavailable", "err"));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
});
