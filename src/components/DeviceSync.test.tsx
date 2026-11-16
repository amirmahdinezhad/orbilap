import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSettingsEntry } from "./DeviceSync";
import { accountDevices, type DeviceGroup } from "../deviceSync";

const availability = vi.hoisted(() => ({ override: undefined as boolean | undefined }));
vi.mock("../deviceManagementAvailability", async (original) => {
  const actual = await original<typeof import("../deviceManagementAvailability")>();
  return { get deviceManagementEnabled() { return availability.override ?? actual.deviceManagementEnabled; } };
});

vi.mock("../deviceSync", async (original) => ({
  ...await original<typeof import("../deviceSync")>(),
  accountDevices: vi.fn(),
}));

const account = { provider: "codex" as const, id: "profile" };
const now = Date.now();
const reset = now + 3600_000;
const window = { window: "Weekly", percent: 50, resetsAt: new Date(reset).toISOString() };
const group: DeviceGroup = { deviceId: "home", ownerDeviceId: "home", capacity: 2, shares: { home: 90, work: 10 },
  estimates: [{ deviceId: "work", window: "Weekly", resetsAt: reset, validUntil: reset, percent: 20, share: 10 }], devices: [
  { id: "home", name: "Home Mac", lastSeen: now, revokedAt: null, samples: [{ window: "Weekly", resetsAt: reset, tokens: 60 }] },
  { id: "work", name: "Work Mac", lastSeen: now, revokedAt: null, samples: [{ window: "Weekly", resetsAt: reset, tokens: 40 }] },
] };

describe("account devices", () => {
  beforeEach(() => {
    availability.override = true;
    vi.mocked(accountDevices).mockReset();
  });
  afterEach(cleanup);

  it("does not expose device settings or call the coordinator in the default build", () => {
    availability.override = undefined;
    render(<DeviceSettingsEntry account={account} label="Personal" />);
    expect(screen.queryByRole("button", { name: "Devices" })).not.toBeInTheDocument();
    expect(accountDevices).not.toHaveBeenCalled();
  });

  it("changes capacity and revokes a device with safe keyboard focus", async () => {
    vi.mocked(accountDevices)
      .mockResolvedValueOnce({ state: "connected", group, quota: { provider: "codex", windows: [window] } })
      .mockResolvedValueOnce({ state: "connected", group: { ...group, capacity: 3 }, quota: null })
      .mockResolvedValueOnce({ state: "connected", group: { ...group, capacity: 3,
        devices: [group.devices[0], { ...group.devices[1], revokedAt: now }] }, quota: null });
    const user = userEvent.setup();
    render(<DeviceSettingsEntry account={account} label="Personal" />);
    await user.click(screen.getByRole("button", { name: "Devices" }));
    expect(await screen.findByText("2 of 2 devices")).toBeVisible();
    expect(screen.getByRole("region", { name: "Official account usage" })).toHaveTextContent("50% used");
    expect(screen.getByText("Weekly · Estimated 20% of limit")).toBeVisible();
    const capacity = screen.getByRole("spinbutton", { name: "Device capacity" });
    await user.clear(capacity);
    await user.type(capacity, "3");
    await user.click(screen.getByRole("button", { name: "Save capacity" }));
    expect(await screen.findByText("2 of 3 devices")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revoke access for Work Mac" }));
    const confirm = await screen.findByRole("alertdialog");
    await waitFor(() => expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.click(within(confirm).getByRole("button", { name: "Revoke access" }));
    expect(await screen.findByText("1 of 3 devices")).toBeVisible();
    expect(screen.queryByText("Work Mac")).not.toBeInTheDocument();
    expect(vi.mocked(accountDevices)).toHaveBeenLastCalledWith(account, { action: "revoke", deviceId: "work" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lets a member see shares and overages without exposing management actions", async () => {
    vi.mocked(accountDevices).mockResolvedValue({ state: "connected", group: { ...group, deviceId: "work" },
      quota: { provider: "codex", windows: [window] } });
    const user = userEvent.setup();
    render(<DeviceSettingsEntry account={account} label="Personal" />);
    await user.click(screen.getByRole("button", { name: "Devices" }));
    expect(await screen.findByText("Assigned share: 10%")).toBeVisible();
    expect(screen.getByText("Over share")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Edit shares|Revoke access|Invite a device/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Device capacity" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("saves custom 10/90 shares and stops totals above 100", async () => {
    vi.mocked(accountDevices).mockResolvedValueOnce({ state: "connected", group: { ...group, shares: null }, quota: null })
      .mockResolvedValueOnce({ state: "connected", group, quota: null });
    const user = userEvent.setup();
    render(<DeviceSettingsEntry account={account} label="Personal" />);
    await user.click(screen.getByRole("button", { name: "Devices" }));
    await user.click(await screen.findByRole("button", { name: "Edit shares" }));
    const editor = screen.getByRole("dialog", { name: "Device shares" });
    await user.click(within(editor).getByRole("radio", { name: "Custom shares" }));
    const home = within(editor).getByRole("spinbutton", { name: "Share for Home Mac (%)" });
    const work = within(editor).getByRole("spinbutton", { name: "Share for Work Mac (%)" });
    await user.clear(home);
    await user.type(home, "90");
    expect(within(editor).getByRole("button", { name: "Save shares" })).toBeDisabled();
    await user.clear(work);
    await user.type(work, "10");
    await user.click(within(editor).getByRole("button", { name: "Save shares" }));
    expect(vi.mocked(accountDevices)).toHaveBeenLastCalledWith(account, { action: "shares", shares: { home: 90, work: 10 } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("uses the active enrollment session when choosing capacity for a new account", async () => {
    vi.mocked(accountDevices).mockResolvedValueOnce({ state: "unlinked" })
      .mockResolvedValueOnce({ state: "connected", group: { ...group, capacity: 4, devices: [group.devices[0]] }, quota: null });
    const user = userEvent.setup();
    render(<DeviceSettingsEntry account={account} label="Personal" session={async () => "draft"} />);
    await user.click(screen.getByRole("button", { name: "Devices for Personal" }));
    await user.click(await screen.findByRole("button", { name: "New group" }));
    await user.type(screen.getByRole("textbox", { name: "Device name" }), "Home Mac");
    await user.type(screen.getByRole("textbox", { name: "Device server" }), "https://devices.example.test");
    await user.type(screen.getByLabelText("Server setup key"), "test-key");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByText("1 of 4 devices")).toBeVisible();
    expect(vi.mocked(accountDevices)).toHaveBeenLastCalledWith({ ...account, sessionId: "draft" }, {
      action: "create", name: "Home Mac", endpoint: "https://devices.example.test", setupKey: "test-key", capacity: 4,
    });
  });
});
