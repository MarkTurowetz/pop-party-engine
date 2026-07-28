"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function parseArguments(argv) {
  const result = { packagePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--package") result.packagePath = String(argv[++index] || "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!result.packagePath) throw new Error("Missing required --package");
  return result;
}

function packageManifest(packagePath) {
  const manifestPath = path.join(packagePath, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.name || !manifest.version) throw new Error(`Package manifest is incomplete: ${manifestPath}`);
  return manifest;
}

function digestPackageDirectory(root) {
  const hash = crypto.createHash("sha256");
  function visit(directory, prefix = "") {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath, relativePath);
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relativePath}\0${fs.readlinkSync(entryPath)}\0`);
      } else if (entry.isFile()) {
        const executable = fs.statSync(entryPath).mode & 0o111 ? "executable" : "file";
        hash.update(`${executable}\0${relativePath}\0`);
        hash.update(fs.readFileSync(entryPath));
        hash.update("\0");
      } else {
        throw new Error(`Unsupported package entry: ${relativePath}`);
      }
    }
  }
  visit(root);
  return hash.digest("hex");
}

function createPackageSnapshot(spec, execFileSync = childProcess.execFileSync) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-package-"));
  const packRoot = path.join(temporaryRoot, "pack");
  const extractRoot = path.join(temporaryRoot, "extract");
  fs.mkdirSync(packRoot);
  fs.mkdirSync(extractRoot);
  try {
    const output = execFileSync("npm", ["pack", spec, "--pack-destination", packRoot, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    });
    const metadata = JSON.parse(output)?.[0];
    if (!metadata?.filename || !metadata?.id) throw new Error(`npm pack did not report a package for ${spec}`);
    execFileSync("tar", ["-xzf", path.join(packRoot, metadata.filename), "-C", extractRoot], {
      stdio: ["ignore", "ignore", "inherit"]
    });
    const packageRoot = path.join(extractRoot, "package");
    return Object.freeze({
      id: metadata.id,
      digest: digestPackageDirectory(packageRoot)
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function remotePackageMetadata(name, version, fetchImpl = fetch) {
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const response = await fetchImpl(`https://registry.npmjs.org/${encodedName}/${encodedVersion}`, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}@${version}`);
  return response.json();
}

function publishedPackageSnapshotSpec(metadata, packageId) {
  const tarball = String(metadata?.dist?.tarball || "").trim();
  let url;
  try {
    url = new URL(tarball);
  } catch {
    throw new Error(`npm registry metadata is missing a valid tarball URL for ${packageId}`);
  }
  if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" || url.username || url.password) {
    throw new Error(`npm registry returned an untrusted tarball URL for ${packageId}`);
  }
  return url.href;
}

function assertMatchingContents(local, remote, packageId) {
  if (!local?.digest || !remote?.digest) throw new Error(`Package comparison is incomplete: ${packageId}`);
  if (remote.digest !== local.digest) {
    throw new Error(
      `Published package ${packageId} does not match this commit: local ${local.digest}, registry ${remote.digest}`
    );
  }
}

async function waitForPublishedPackage(options) {
  const now = options.now || Date.now;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + (options.timeoutMs || 3 * 60 * 1000);
  let remote = null;
  while (now() <= deadline) {
    remote = await remotePackageMetadata(options.name, options.version, options.fetchImpl);
    if (remote) return remote;
    if (now() + (options.intervalMs || 5000) > deadline) break;
    await wait(options.intervalMs || 5000);
  }
  throw new Error(`Published package did not appear in the npm registry: ${options.name}@${options.version}`);
}

async function waitForPublishedPackageSnapshot(options) {
  const now = options.now || Date.now;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 5000;
  const deadline = now() + timeoutMs;
  let metadata = options.initialMetadata || null;
  let lastSnapshotError = null;
  while (now() <= deadline) {
    metadata = metadata || await remotePackageMetadata(options.name, options.version, options.fetchImpl);
    if (metadata) {
      const snapshotSpec = publishedPackageSnapshotSpec(metadata, options.packageId);
      try {
        return await options.snapshotFactory(snapshotSpec);
      } catch (error) {
        lastSnapshotError = error;
      }
    }
    if (now() + intervalMs > deadline) break;
    await wait(intervalMs);
    metadata = null;
  }
  const detail = lastSnapshotError ? `: ${lastSnapshotError.message}` : "";
  throw new Error(
    `Published package tarball did not become downloadable: ${options.packageId}${detail}`
  );
}

async function publishPublicPackage(options) {
  const packagePath = path.resolve(options.packagePath);
  const manifest = packageManifest(packagePath);
  const packageId = `${manifest.name}@${manifest.version}`;
  const snapshotFactory = options.snapshotFactory
    || ((spec) => createPackageSnapshot(spec, options.execFileSync));
  const local = await snapshotFactory(packagePath);
  if (local.id !== packageId) throw new Error(`npm pack reported ${local.id}, expected ${packageId}`);
  const remote = await remotePackageMetadata(manifest.name, manifest.version, options.fetchImpl);
  if (remote) {
    const published = await waitForPublishedPackageSnapshot({
      name: manifest.name,
      version: manifest.version,
      packageId,
      snapshotFactory,
      initialMetadata: remote,
      fetchImpl: options.fetchImpl,
      now: options.now,
      wait: options.wait,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs
    });
    assertMatchingContents(local, published, packageId);
    return Object.freeze({ packageId, status: "already-published", digest: local.digest });
  }
  const spawnSync = options.spawnSync || childProcess.spawnSync;
  const publication = spawnSync("npm", ["publish", packagePath, "--provenance", "--access", "public"], {
    stdio: "inherit"
  });
  if (publication.error) throw publication.error;
  if (publication.status !== 0) throw new Error(`npm publish failed for ${packageId} with exit code ${publication.status}`);
  const published = await waitForPublishedPackageSnapshot({
    name: manifest.name,
    version: manifest.version,
    packageId,
    snapshotFactory,
    fetchImpl: options.fetchImpl,
    now: options.now,
    wait: options.wait,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs
  });
  assertMatchingContents(local, published, packageId);
  return Object.freeze({ packageId, status: "published", digest: local.digest });
}

async function main() {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const result = await publishPublicPackage(argumentsValue);
    console.log(`${result.packageId}: ${result.status} (content ${result.digest})`);
  } catch (error) {
    console.error(`Public package publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertMatchingContents,
  createPackageSnapshot,
  digestPackageDirectory,
  packageManifest,
  parseArguments,
  publishPublicPackage,
  publishedPackageSnapshotSpec,
  remotePackageMetadata,
  waitForPublishedPackage,
  waitForPublishedPackageSnapshot
};
