import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.env.TAURI_ENV_TARGET_TRIPLE;
if (process.platform === "darwin" && ["aarch64-apple-darwin", "x86_64-apple-darwin", "universal-apple-darwin"].includes(target)
    && process.env.TAURI_ENV_DEBUG !== "true") {
  const root = fileURLToPath(new URL("../src-tauri/", import.meta.url));
  const metadata = JSON.parse(execFileSync(
    "cargo", ["metadata", "--locked", "--offline", "--no-deps", "--format-version", "1"],
    { cwd: root, encoding: "utf8" },
  ));
  const binary = path.join(metadata.target_directory, target, "release", "orbilap");
  execFileSync("xcrun", ["strip", "-x", binary], { stdio: "inherit" });
}
