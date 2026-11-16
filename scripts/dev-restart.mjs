import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const inside = value => value === root || value.startsWith(root + path.sep);

/** Restrict cleanup to project runtimes; never select the caller's ancestors. */
export function projectProcesses(rows, currentPid) {
  const ancestors = new Set([currentPid, 1]);
  let parent = rows.find(row => row.pid === currentPid)?.ppid;
  while (parent && !ancestors.has(parent)) {
    ancestors.add(parent);
    parent = rows.find(row => row.pid === parent)?.ppid;
  }
  const runtime = /^(?:node|npm|pnpm|cargo|rustc|rustup|tauri|vite|orbilap)(?:\s|$)/i;
  const selected = new Set(rows.filter(row => !ancestors.has(row.pid) &&
    runtime.test(path.basename(row.executable)) && !row.executable.includes("/cua_node/") &&
    (inside(row.cwd ?? "") || inside(row.executable))).map(row => row.pid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (!ancestors.has(row.pid) && selected.has(row.ppid) && !selected.has(row.pid)) {
      selected.add(row.pid); changed = true;
    }
  }
  return [...selected];
}

function inventory() {
  const ps = spawnSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" });
  if (ps.status !== 0) throw new Error("Cannot inspect project processes.");
  const cwd = spawnSync("lsof", ["-a", "-u", String(process.getuid()), "-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (cwd.error || ![0, 1].includes(cwd.status)) throw new Error("Cannot inspect process working directories.");
  const directories = new Map();
  let pid;
  for (const line of cwd.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid) directories.set(pid, line.slice(1));
  }
  return ps.stdout.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), executable: match[3], cwd: directories.get(Number(match[1])) }] : [];
  });
}

const signal = (pid, name) => {
  try { process.kill(pid, name); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
};

async function restart() {
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Project process cleanup requires macOS or Linux.");
  const previous = projectProcesses(inventory(), process.pid);
  if (process.platform === "darwin") {
    const stop = spawnSync(process.execPath, [path.join(root, "scripts/dev.mjs"), "--stop"], { cwd: root, stdio: "inherit" });
    if (stop.status !== 0) throw new Error("Cannot stop the independent dev supervisor.");
    // Let the supervisor finish its process-group cleanup before starting again.
    await pause(2200);
  }
  for (const pid of new Set([...previous, ...projectProcesses(inventory(), process.pid)])) signal(pid, "SIGTERM");
  await pause(700);
  for (const pid of projectProcesses(inventory(), process.pid)) signal(pid, "SIGKILL");
  await pause(200);
  if (projectProcesses(inventory(), process.pid).length) throw new Error("Project processes did not stop; refusing a duplicate dev instance.");
  const port = spawnSync("lsof", ["-nP", "-t", "-iTCP:5174", "-sTCP:LISTEN"], { encoding: "utf8" });
  if (port.error || ![0, 1].includes(port.status)) throw new Error("Cannot check port 5174.");
  if (port.stdout.trim()) throw new Error("Port 5174 belongs to another process; it was preserved.");
  console.log("Project processes stopped. Starting the latest source with pnpm run tauri dev.");
  const command = process.platform === "darwin" ? process.execPath : "pnpm";
  const args = process.platform === "darwin" ? [path.join(root, "scripts/dev.mjs"), "--tauri"] : ["run", "tauri", "dev"];
  const start = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (start.error) throw start.error;
  process.exitCode = start.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await restart(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
