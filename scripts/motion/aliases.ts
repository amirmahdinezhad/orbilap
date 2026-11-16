import { fileURLToPath } from "node:url";

export const fixtureAliases = Object.fromEntries([
    "@tauri-apps/api/core", "@tauri-apps/api/event", "@tauri-apps/api/app",
    "@tauri-apps/plugin-updater", "@tauri-apps/plugin-process", "@tauri-apps/plugin-opener",
  ].map(name => [name, fileURLToPath(new URL("./bridge.ts", import.meta.url))]));
