import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.7skylab.orbilap.dev";
const supervisorLog = "/tmp/orbilap-dev-supervisor.log";
const mode = process.argv[2];

function job() {
  const result = spawnSync("/bin/launchctl", ["list", label], { encoding: "utf8" });
  return result.status === 0 ? Number(result.stdout.match(/"PID"\s*=\s*(\d+)/)?.[1] ?? 0) : 0;
}

/** launchd owns dev so closing Codex cannot kill Vite or the restart worker. */
function startIndependent(worker = "--worker") {
  if (job()) {
    console.log(`Orbilap dev is already running (supervisor ${job()}).`);
    return;
  }
  // launchd retains the label after a worker exits.
  spawnSync("/bin/launchctl", ["remove", label], { stdio: "ignore" });
  const environment = { PATH: process.env.PATH };
  for (const key of ["CODEX_HOME", "ORBILAP_OPENCODE_USERDATA", "ORBILAP_PREVIEW_CLAUDE", "ORBILAP_PREVIEW_FLOATING", "VITE_ORBILAP_PREVIEW_UPDATE"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  // launchctl submit implies KeepAlive, which relaunches dev even after Quit.
  const config = {
    Label: label,
    ProgramArguments: [process.execPath, fileURLToPath(import.meta.url), worker],
    EnvironmentVariables: environment,
    RunAtLoad: true,
    KeepAlive: false,
    StandardOutPath: supervisorLog,
    StandardErrorPath: supervisorLog,
  };
  const directory = mkdtempSync(path.join(tmpdir(), "orbilap-dev-"));
  try {
    const plist = path.join(directory, `${label}.plist`);
    const write = spawnSync("/usr/bin/plutil", ["-convert", "xml1", "-o", plist, "--", "-"], {
      input: JSON.stringify(config), encoding: "utf8",
    });
    if (write.error) throw write.error;
    if (write.status !== 0) throw new Error(`Cannot create independent dev job: ${write.stderr.trim() || write.stdout.trim()}`);
    const start = spawnSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, plist], { encoding: "utf8" });
    if (start.error) throw start.error;
    if (start.status !== 0) throw new Error(`Cannot start independent dev: ${start.stderr.trim()}`);
  } finally {
    rmSync(directory, { recursive: true });
  }
  console.log(`Orbilap dev started independently of Codex on http://localhost:5174/. Logs: ${supervisorLog}`);
}

/** Keep the existing tray panel/Vite behavior; shut down both process groups together. */
async function supervise(tauriOnly = false) {
  const services = tauriOnly ? [
    ["tauri", ["run", "tauri", "dev"], "/tmp/orbilap-tauri-dev.log"],
  ] : [
    ["vite", ["exec", "vite", "--port", "5174", "--strictPort"], "/tmp/orbilap-vite-5174.log"],
    ["tauri", ["exec", "tauri", "dev", "--config", JSON.stringify({ build: { devUrl: "http://localhost:5174", beforeDevCommand: "" } })], "/tmp/orbilap-tauri-dev.log"],
  ];
  const children = [];
  const streams = [];
  // Tauri owns Vite in the restart workflow; retain both familiar log paths.
  const viteLog = tauriOnly ? createWriteStream("/tmp/orbilap-vite-5174.log", { flags: "w" }) : null;
  if (viteLog) streams.push(viteLog);
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    }
    // Reap the whole dev group, including the cargo-watched native child.
    setTimeout(() => {
      for (const child of children) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
      }
      for (const stream of streams) stream.end();
      process.exit(code);
    }, 2000);
  };
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
  for (const [name, args, log] of services) {
    const stream = createWriteStream(log, { flags: "w" });
    streams.push(stream);
    const child = spawn("pnpm", args, { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    if (viteLog) {
      child.stdout.pipe(viteLog, { end: false });
      child.stderr.pipe(viteLog, { end: false });
    }
    child.on("error", (error) => { console.error(`${name}: ${error.message}`); stop(1); });
    child.on("exit", (code) => { console.log(`${name} exited (${code}).`); stop(code ?? 1); });
    console.log(`${name} started (${child.pid}); ${log}`);
  }
}

try {
  if (mode === "--tauri-worker") await supervise(true);
  else if (mode === "--worker") await supervise();
  else if (process.platform !== "darwin") {
    // Preserve the existing foreground CLI workflow on other platforms.
    const command = process.env.npm_execpath ? process.execPath : "pnpm";
    const prefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
    const result = spawnSync(command, [...prefix, "exec", "tauri", "dev"], { cwd: root, stdio: "inherit" });
    process.exitCode = result.status ?? 1;
  }
  else if (mode === "--stop") {
    const wasRunning = !!job();
    const result = spawnSync("/bin/launchctl", ["remove", label], { encoding: "utf8" });
    if (wasRunning && result.status !== 0) throw new Error(result.stderr.trim());
  } else if (mode === "--status") {
    const pid = job();
    if (!pid) throw new Error("Independent Orbilap dev is not running.");
    const parent = spawnSync("/bin/ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" });
    if (parent.status !== 0 || parent.stdout.trim() !== "1") throw new Error("Dev supervisor is not owned by launchd.");
    console.log(`Independent Orbilap dev: supervisor=${pid}, parent=launchd (1), port=5174.`);
  } else startIndependent(mode === "--tauri" ? "--tauri-worker" : "--worker");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
