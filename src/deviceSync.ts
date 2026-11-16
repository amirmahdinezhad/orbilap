import { invoke } from "@tauri-apps/api/core";
import type { AccountProvider, QuotaSet } from "./api";

export interface DeviceAccount {
  provider: AccountProvider;
  id: string;
  sessionId?: string;
}
export interface DeviceSample {
  window: string;
  resetsAt: number;
  tokens: number;
}
export interface LinkedDevice {
  id: string;
  name: string;
  lastSeen: number;
  revokedAt: number | null;
  samples: DeviceSample[];
}
export interface DeviceEstimate {
  deviceId: string;
  window: string;
  resetsAt: number;
  validUntil: number;
  percent: number;
  share: number | null;
}
export type DeviceShares = Record<string, number>;
export interface DeviceGroup {
  deviceId: string;
  ownerDeviceId: string | null;
  capacity: number;
  shares: DeviceShares | null;
  estimates: DeviceEstimate[];
  devices: LinkedDevice[];
}
export type DeviceOperation =
  | { action: "status" | "invite" }
  | { action: "create"; endpoint: string; setupKey: string; name: string; capacity: number }
  | { action: "join"; invitation: string; name: string }
  | { action: "capacity"; capacity: number }
  | { action: "shares"; shares: DeviceShares | null }
  | { action: "revoke"; deviceId: string };
export type DeviceResult =
  | { state: "unlinked" | "revoked" }
  | { state: "connected"; group: DeviceGroup; quota: QuotaSet | null }
  | { state: "invitation"; code: string; expiresAt: number };

export const accountDevices = (account: DeviceAccount, operation: DeviceOperation): Promise<DeviceResult> =>
  invoke("account_devices", { account, operation });
