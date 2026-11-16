import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repository = "amirmahdinezhad/orbilap";
export const macTargets = [
  { triple: "aarch64-apple-darwin", platform: "darwin-aarch64", architecture: "arm64", suffix: "aarch64" },
  { triple: "x86_64-apple-darwin", platform: "darwin-x86_64", architecture: "x86_64", suffix: "x64" },
];
const read = (file) => readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });

export function validateSecurityReport(report, version) {
  assert.match(report.split(/\r?\n/)[0], /^# Security review for .+/, "Use a security review heading.");
  assert.ok(report.split(/\r?\n/)[0].endsWith(` ${version}`), "Security report must identify this release version.");
  assert.match(report, /^## Results\s*$/m, "Record security check results before release review.");
  assert.match(report, /^## Remaining verification\b/m, "Record remaining verification and risks before release review.");
  assert.doesNotMatch(report, /TODO|PLACEHOLDER/, "Finish the security report.");
}

/** Check the version, notes and updater trust root before producing a release. */
export function releaseConfig() {
  const pkg = json("package.json");
  const config = json("src-tauri/tauri.conf.json");
  const cargo = read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1];
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "Use a stable SemVer version.");
  assert.equal(config.version, pkg.version, "Tauri and package versions differ.");
  assert.equal(cargo, pkg.version, "Cargo and package versions differ.");
  assert.ok(read("src-tauri/Cargo.lock").includes(`name = "orbilap"\nversion = "${pkg.version}"`), "Cargo.lock version differs.");
  assert.deepEqual(config.plugins.updater.endpoints, [`https://github.com/${repository}/releases/latest/download/latest.json`]);
  const key = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8");
  assert.match(key, /^untrusted comment: .*\nRW[^\n]+\n?$/, "Updater key must be the base64-encoded public-key file.");
  const notes = read(`docs/releases/${pkg.version}.md`).trim();
  assert.equal(notes.split(/\r?\n/, 1)[0], `# ${config.productName} ${pkg.version}`, "Release notes must start with the product and version.");
  assert.doesNotMatch(notes, /\p{Script=Arabic}/u, "Write release notes in English.");
  assert.ok(!/TODO|PLACEHOLDER/.test(notes), "Finish the release notes.");
  const securityReport = `docs/releases/${pkg.version}.security.md`;
  assert.ok(existsSync(path.join(root, securityReport)), `Add ${securityReport} before release review.`);
  validateSecurityReport(read(securityReport), pkg.version);
  return { version: pkg.version, notes, config };
}

/** Validate the feed against the reviewed release and immutable GitHub asset URLs. */
export function validateManifest(manifest, version, notes, product = "Orbilap") {
  assert.equal(manifest.version.replace(/^v/, ""), version, "Feed version differs.");
  assert.equal(manifest.notes.trim(), notes.trim(), "Feed notes differ from the reviewed notes.");
  assert.ok(Number.isFinite(Date.parse(manifest.pub_date)), "Feed needs an RFC3339 date.");
  assert.deepEqual(Object.keys(manifest.platforms).sort(), macTargets.map(target => target.platform).sort(), "Feed must contain both supported macOS architectures only.");
  for (const { platform, suffix } of macTargets) {
    const asset = manifest.platforms[platform];
    assert.ok(asset, `Missing ${platform}.`);
    const url = new URL(asset.url);
    const directory = `https://github.com/${repository}/releases/download/v${version}/`;
    assert.equal(url.href, asset.url, "Updater URL must use its canonical form.");
    assert.ok(url.href.startsWith(directory), "Unexpected updater asset URL.");
    const filename = url.pathname.slice(new URL(directory).pathname.length);
    assert.equal(filename, `${product}_${suffix}.app.tar.gz`, `Updater archive must match ${platform}.`);
    assert.ok(!url.search && !url.hash && !url.username && !url.password, "Updater URL must not contain credentials, query or fragment.");
    assert.match(Buffer.from(asset.signature, "base64").toString("utf8"), /^untrusted comment: .*\n.+\ntrusted comment: .+\n.+/);
  }
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : [file];
  });
}

function checksums(directory) {
  const files = readdirSync(directory).filter((name) => name !== "SHA256SUMS").sort();
  return files.map((name) => `${createHash("sha256").update(readFileSync(path.join(directory, name))).digest("hex")}  ${name}`).join("\n") + "\n";
}

/** Stage separate architecture builds, their signatures, reviewed notes and checksums. */
function assemble(bundleDirectories, outputDirectory) {
  const { version, notes, config } = releaseConfig();
  const product = config.productName;
  mkdirSync(outputDirectory, { recursive: true });
  assert.equal(readdirSync(outputDirectory).length, 0, "Use an empty output directory.");
  const platforms = {};
  for (const [index, { platform, suffix }] of macTargets.entries()) {
    const files = filesBelow(bundleDirectories[index]);
    const archive = files.find((file) => path.basename(file) === `${product}.app.tar.gz`);
    const dmgName = `${product}_${version}_${suffix}.dmg`;
    const dmg = files.find((file) => path.basename(file) === dmgName);
    assert.ok(archive && dmg && existsSync(`${archive}.sig`), `Build the ${platform} DMG and signed updater archive first.`);
    const archiveName = `${product}_${suffix}.app.tar.gz`;
    copyFileSync(archive, path.join(outputDirectory, archiveName));
    copyFileSync(`${archive}.sig`, path.join(outputDirectory, `${archiveName}.sig`));
    copyFileSync(dmg, path.join(outputDirectory, dmgName));
    platforms[platform] = {
      signature: readFileSync(`${archive}.sig`, "utf8").trim(),
      url: `https://github.com/${repository}/releases/download/v${version}/${archiveName}`,
    };
  }
  writeFileSync(path.join(outputDirectory, "latest.json"), JSON.stringify({
    version, notes, pub_date: new Date().toISOString(),
    platforms,
  }, null, 2) + "\n");
  writeFileSync(path.join(outputDirectory, "SHA256SUMS"), checksums(outputDirectory));
  verifyDirectory(outputDirectory);
}

/** Verify staged or downloaded assets, including Tauri's actual signature check. */
function verifyDirectory(directory) {
  const { version, notes, config } = releaseConfig();
  const product = config.productName;
  const manifest = JSON.parse(readFileSync(path.join(directory, "latest.json"), "utf8"));
  validateManifest(manifest, version, notes, product);
  const expectedFiles = ["latest.json", "SHA256SUMS", ...macTargets.flatMap(({ suffix }) => [
    `${product}_${version}_${suffix}.dmg`, `${product}_${suffix}.app.tar.gz`, `${product}_${suffix}.app.tar.gz.sig`,
  ])].sort();
  assert.deepEqual(readdirSync(directory).sort(), expectedFiles, "Release assets must contain exactly the two architecture builds, feed and checksums.");
  assert.equal(readFileSync(path.join(directory, "SHA256SUMS"), "utf8"), checksums(directory), "Asset checksums differ.");
  const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
  const verifyApp = (app, architecture) => {
    const plist = path.join(app, "Contents/Info.plist");
    const plistValue = name => run("/usr/libexec/PlistBuddy", ["-c", `Print ${name}`, plist], { encoding: "utf8", stdio: "pipe" }).trim();
    assert.equal(plistValue("CFBundleShortVersionString"), version, "Bundled app version differs.");
    assert.equal(plistValue("CFBundleIdentifier"), config.identifier, "Bundled app identity differs.");
    const binary = path.join(app, "Contents/MacOS/orbilap");
    const architectures = run("lipo", ["-archs", binary], { encoding: "utf8", stdio: "pipe" }).trim().split(/\s+/);
    assert.deepEqual(architectures, [architecture], `Release app must contain only ${architecture}.`);
    run("codesign", ["--verify", "--deep", "--strict", app]);
    return digest(binary);
  };
  for (const { platform, architecture, suffix } of macTargets) {
    const archive = path.join(directory, path.basename(new URL(manifest.platforms[platform].url).pathname));
    assert.equal(readFileSync(`${archive}.sig`, "utf8").trim(), manifest.platforms[platform].signature, "Feed and sidecar signatures differ.");
    run("cargo", ["run", "--locked", "--offline", "--quiet", "--example", "verify_update", "--", archive, `${archive}.sig`], { cwd: path.join(root, "src-tauri") });
    const temporary = mkdtempSync(path.join(tmpdir(), "orbilap-verify-"));
    const extract = path.join(temporary, "archive");
    const mount = path.join(temporary, "dmg");
    mkdirSync(extract); mkdirSync(mount);
    let mounted = false;
    try {
      run("tar", ["-xzf", archive, "-C", extract]);
      const archiveDigest = verifyApp(path.join(extract, `${product}.app`), architecture);
      const dmg = path.join(directory, `${product}_${version}_${suffix}.dmg`);
      run("hdiutil", ["verify", dmg]);
      run("hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, dmg], { stdio: "pipe" });
      mounted = true;
      assert.equal(verifyApp(path.join(mount, `${product}.app`), architecture), archiveDigest, "DMG and updater app binaries differ.");
    } finally {
      if (mounted) run("hdiutil", ["detach", mount], { stdio: "pipe" });
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  console.log(`${product} ${version} verified: notes, separate Apple Silicon/Intel apps, DMGs, checksums and updater signatures.`);
}

async function main() {
  const [command, directory, intelDirectory] = process.argv.slice(2);
  const { version, notes, config } = releaseConfig();
  if (command === "check") {
    if (process.env.GITHUB_REF_TYPE === "tag") assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, "Tag differs from app version.");
    console.log(`${config.productName} ${version} is ready for release review.`);
  } else if (command === "assemble") {
    assert.ok(directory && intelDirectory, "Supply Apple Silicon and Intel Tauri bundle directories, in that order.");
    assemble([path.resolve(directory), path.resolve(intelDirectory)], path.join(root, "release-artifacts"));
  } else if (command === "verify") {
    verifyDirectory(path.resolve(directory ?? "release-artifacts"));
  } else if (command === "publish") {
    assert.ok(process.argv.includes("--approved"), "Publish only after explicit user approval: pnpm run release:publish --approved");
    assert.equal(run("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8", stdio: "pipe" }).trim(), "", "Commit the reviewed changes first.");
    assert.equal(run("git", ["rev-parse", `v${version}^{commit}`], { encoding: "utf8", stdio: "pipe" }).trim(), run("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: "pipe" }).trim(), "Check out the tagged release commit.");
    run("git", ["ls-files", "--error-unmatch", "--", `docs/releases/${version}.security.md`], { stdio: "pipe" });
    run("pnpm", ["run", "security:check"]);
    const release = JSON.parse(run("gh", ["release", "view", `v${version}`, "--repo", repository, "--json", "isDraft,body"], { encoding: "utf8", stdio: "pipe" }));
    assert.ok(release.isDraft, "Only a verified draft can be published.");
    assert.equal(release.body.trim(), notes, "GitHub release notes differ.");
    const downloaded = mkdtempSync(path.join(tmpdir(), "orbilap-release-"));
    run("gh", ["release", "download", `v${version}`, "--repo", repository, "--dir", downloaded]);
    verifyDirectory(downloaded);
    run("gh", ["release", "edit", `v${version}`, "--repo", repository, "--draft=false", "--latest"]);
    const feed = await fetch(config.plugins.updater.endpoints[0], { signal: AbortSignal.timeout(30_000) });
    assert.ok(feed.ok, `Public feed returned ${feed.status}.`);
    const manifest = await feed.json();
    validateManifest(manifest, version, notes);
    for (const { platform, suffix } of macTargets) {
      for (const name of [path.basename(new URL(manifest.platforms[platform].url).pathname), `${config.productName}_${version}_${suffix}.dmg`]) {
        const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        assert.ok(response.ok, `Public ${name} download returned ${response.status}.`);
        assert.equal(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"), createHash("sha256").update(readFileSync(path.join(downloaded, name))).digest("hex"), "Public asset differs from verified draft.");
      }
    }
    console.log(`Published and verified: https://github.com/${repository}/releases/tag/v${version}`);
  } else {
    throw new Error("usage: release.mjs check | assemble <apple-silicon-bundle-dir> <intel-bundle-dir> | verify [asset-dir] | publish --approved");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
