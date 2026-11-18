import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const picomatchCve = "CVE-2026-112366";
const chronoAdvisory = "RUSTSEC-2026-0543";
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}).`);
  return result.stdout;
};

export function acceptsPicomatchFinding(report, version, lockDigest, registryVersion) {
  if (version !== "1.0.1" || registryVersion !== "4.0.7" ||
      lockDigest !== "0b5d2d09850e58e3626b3552e9dcdff3f1b8a629b31258994e49fa00e9444704") return false;
  const findings = Object.values(report.advisories ?? {});
  const [finding] = findings;
  return findings.length === 1
    && finding.module_name === "picomatch"
    && finding.github_advisory_id === "GHSA-fc5q-39xc-vjpf"
    && finding.patched_versions === "<0.0.0"
    && finding.cves?.length === 1 && finding.cves[0] === picomatchCve
    && finding.findings?.length > 0
    && finding.findings.every(entry => entry.version === "4.0.7");
}

export function acceptsChronoWarning(version, lockDigest) {
  return version === "1.0.1"
    && lockDigest === "07d14ec4ebc4255b5fa44a35ac3d88985d97d194116645d0a6ce2a16fbc41016";
}

function auditJavaScript() {
  const options = ["audit", "--audit-level=low"];
  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (version === "1.0.1") {
    const result = spawnSync("pnpm", [...options, "--json"], { cwd: root, encoding: "utf8" });
    if (result.status === 0) return;
    if (result.status === 1 && result.stdout.trim()) {
      const report = JSON.parse(result.stdout);
      const digest = createHash("sha256").update(readFileSync(path.join(root, "pnpm-lock.yaml"))).digest("hex");
      const registryVersion = execFileSync("pnpm", ["view", "picomatch", "version"], { cwd: root, encoding: "utf8" }).trim();
      if (acceptsPicomatchFinding(report, version, digest, registryVersion)) {
        console.log(`Owner accepted ${picomatchCve} for Orbilap 1.0.1 only. Continuing the full release gate.`);
        return;
      }
    }
  }
  run("pnpm", options);
}

export function resolvedLockfile(lock, packages) {
  const names = new Set(
    [...packages].map((pkg) => pkg.slice(0, pkg.lastIndexOf("@"))),
  );
  return lock
    .split(/(?=^\[\[package\]\])/m)
    .filter(
      (section, index) =>
        index === 0 ||
        packages.has(
          `${section.match(/^name = "([^"]+)"/m)?.[1]}@${section.match(/^version = "([^"]+)"/m)?.[1]}`,
        ),
    )
    .map((section) =>
      section.replace(/^( "[^"]+",)\n/gm, (line, dependency) => {
        const [name, version] = dependency.slice(2, -2).split(" ");
        return (version ? packages.has(`${name}@${version}`) : names.has(name))
          ? line
          : "";
      }),
    )
    .join("");
}

function main() {
  // Include uncommitted source while excluding ignored output and local credentials.
  const temporary = mkdtempSync(path.join(tmpdir(), "orbilap-security-"));
  try {
    run(process.execPath, [
      "--test",
      "scripts/security.test.mjs",
      "scripts/device-sync.test.mjs",
      "scripts/release.test.mjs",
      "scripts/reset-data.test.mjs",
    ]);
    auditJavaScript();
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    )
      .toString()
      .split("\0")
      .filter(Boolean);
    const source = path.join(temporary, "source");
    mkdirSync(source);
    for (const file of files) {
      const original = path.join(root, file);
      try {
        if (!lstatSync(original).isFile()) continue;
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const destination = path.join(source, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(original, destination);
    }
    run("gitleaks", ["dir", source, "--redact", "--no-banner"]);
    run("gitleaks", ["git", root, "--redact", "--no-banner"]);

    // Resolve both supported architectures, including their host build dependencies.
    // Cargo.lock also contains Linux/Windows-only crates, which are reported separately.
    const packages = new Set();
    for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
      const metadata = JSON.parse(
        run(
          "cargo",
          [
            "metadata",
            "--locked",
            "--format-version=1",
            "--filter-platform",
            target,
          ],
          {
            cwd: path.join(root, "src-tauri"),
            stdio: ["ignore", "pipe", "inherit"],
            maxBuffer: 32 * 1024 * 1024,
          },
        ),
      );
      const active = new Set(metadata.resolve.nodes.map((node) => node.id));
      for (const pkg of metadata.packages)
        if (active.has(pkg.id)) packages.add(`${pkg.name}@${pkg.version}`);
    }
    const lock = readFileSync(path.join(root, "src-tauri/Cargo.lock"), "utf8");
    const targetLock = path.join(temporary, "Cargo.lock");
    writeFileSync(targetLock, resolvedLockfile(lock, packages));
    const database = path.join(temporary, "advisory-db");
    run("git", [
      "clone",
      "--quiet",
      "--depth=1",
      "https://github.com/RustSec/advisory-db.git",
      database,
    ]);
    const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const lockDigest = createHash("sha256").update(lock).digest("hex");
    const acceptedWarning = acceptsChronoWarning(version, lockDigest)
      ? ["--ignore", chronoAdvisory] : [];
    if (acceptedWarning.length) {
      console.log(`Owner accepted the ${chronoAdvisory} maintenance warning for Orbilap 1.0.1 only.`);
    }
    run("cargo", [
      "audit",
      "--db",
      database,
      "--no-fetch",
      "--deny",
      "warnings",
      ...acceptedWarning,
      "--file",
      targetLock,
    ]);
    const full = spawnSync(
      "cargo",
      [
        "audit",
        "--db",
        database,
        "--no-fetch",
        "--json",
        "--file",
        "src-tauri/Cargo.lock",
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (full.error) throw full.error;
    const report = JSON.parse(full.stdout);
    for (const finding of [
      ...report.vulnerabilities.list,
      ...Object.values(report.warnings).flat(),
    ]) {
      if (!packages.has(`${finding.package.name}@${finding.package.version}`)) {
        console.log(
          `Other targets: ${finding.advisory?.id ?? finding.kind} ${finding.package.name}@${finding.package.version} — ${finding.advisory?.title ?? "Package withdrawn from the registry"}`,
        );
      }
    }
    console.log(
      "Security checks passed for Apple Silicon and Intel macOS. Review other-target findings and the manual release checklist in docs/SECURITY.md.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
