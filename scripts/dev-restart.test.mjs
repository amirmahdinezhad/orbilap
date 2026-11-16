import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectProcesses } from "./dev-restart.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("cleanup selects checkout runtimes and descendants while protecting ancestors and other projects", () => {
  const rows = [
    {pid:10,ppid:1,executable:"/Applications/Codex",cwd:root},
    {pid:11,ppid:10,executable:"/bin/zsh",cwd:root},
    {pid:12,ppid:11,executable:"/bin/node",cwd:root},
    {pid:20,ppid:1,executable:"/bin/node",cwd:root},
    {pid:21,ppid:20,executable:"/bin/sh",cwd:"/tmp"},
    {pid:22,ppid:21,executable:"/bin/node",cwd:"/tmp"},
    {pid:30,ppid:1,executable:root+"/src-tauri/target/debug/orbilap",cwd:"/tmp"},
    {pid:40,ppid:1,executable:"/bin/node",cwd:root+"-other"},
    {pid:41,ppid:1,executable:"/bin/zsh",cwd:root},
    {pid:42,ppid:1,executable:"/Applications/Editor",cwd:root},
    {pid:43,ppid:1,executable:"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",cwd:root},
  ];
  assert.deepEqual(projectProcesses(rows,12).sort((a,b)=>a-b),[20,21,22,30]);
});
