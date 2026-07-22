#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "outputs", "engine-split-baseline");
const CONTENT_PATH_PATTERN = /(?:^|\/)(?:art-manifest|game-flow|game-constants|stage-layouts|controller-layouts|host-audios)(?:\.default)?\.json$/i;
const PRIVATE_GAME_PATTERN = /(?:^|[\/_ -])flip[\s_-]*7(?:$|[\/_ .-])/i;
const SECRET_PATH_PATTERN = /(?:^|\/)(?:\.env(?:\..*)?|.*(?:secret|credential|private[-_]?key|access[-_]?token).*)$/i;
const SECRET_CONTENT_PATTERNS = Object.freeze([
  { code: "GITHUB_TOKEN", pattern: /gh[opusr]_[A-Za-z0-9_]{20,}/g },
  { code: "PRIVATE_KEY", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { code: "GENERIC_SECRET_ASSIGNMENT", pattern: /(?:secret|token|password)\s*[:=]\s*["'][^"'\n]{16,}["']/gi }
]);

function git(args, options = {}) {
  return childProcess.execFileSync("git", args, {
    cwd: ROOT,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function gitWithInput(args, input, options = {}) {
  return childProcess.execFileSync("git", args, {
    cwd: ROOT,
    input,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizedLogicalPath(value) {
  const normalized = String(value || "").normalize("NFC").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error(`Unsafe logical path: ${value}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) {
    throw new Error(`Unsafe logical path: ${value}`);
  }
  return parts.join("/");
}

function resolveCommit(ref) {
  return git(["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

function treeEntries(commit) {
  const output = git(["ls-tree", "-r", "-z", "--long", commit], { encoding: null });
  return output.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = entry.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\s+(\d+|-)\t(.+)$/s);
    if (!match) throw new Error(`Could not parse git tree entry: ${entry}`);
    return {
      mode: match[1],
      type: match[2],
      objectId: match[3],
      size: match[4] === "-" ? null : Number(match[4]),
      path: normalizedLogicalPath(match[5])
    };
  });
}

function inventoryRevision(ref) {
  const commit = resolveCommit(ref);
  const files = treeEntries(commit).filter((entry) => entry.type === "blob").map((entry) => {
    const bytes = git(["show", `${commit}:${entry.path}`], { encoding: null });
    return { path: entry.path, bytes: bytes.length, sha256: sha256(bytes), gitObjectId: entry.objectId };
  });
  return { ref, commit, files };
}

function scanReachableHistory() {
  const objectLines = git(["rev-list", "--objects", "--all"]).split("\n").filter(Boolean);
  const findings = [];
  const pathByObject = new Map();
  for (const line of objectLines) {
    const separator = line.indexOf(" ");
    if (separator < 0 || separator === line.length - 1) continue;
    const objectId = line.slice(0, separator);
    const logicalPath = normalizedLogicalPath(line.slice(separator + 1));
    if (PRIVATE_GAME_PATTERN.test(logicalPath)) {
      findings.push({ severity: "block", code: "FLIP7_HISTORY", path: logicalPath, objectId });
    }
    if (SECRET_PATH_PATTERN.test(logicalPath)) {
      findings.push({ severity: "block", code: "SECRET_PATH", path: logicalPath, objectId });
    }
    if (CONTENT_PATH_PATTERN.test(logicalPath) && !isApprovedStarterContentPath(logicalPath)) {
      findings.push({ severity: "block", code: "UNCLASSIFIED_GAME_CONTENT", path: logicalPath, objectId });
    }
    if (!pathByObject.has(objectId)) pathByObject.set(objectId, logicalPath);
  }

  const objectIds = Array.from(pathByObject.keys());
  const batchInput = `${objectIds.join("\n")}\n`;
  const checkLines = gitWithInput(["cat-file", "--batch-check"], batchInput).trim().split("\n");
  const candidateIds = checkLines.flatMap((line) => {
    const [objectId, type, sizeText] = line.split(" ");
    const size = Number(sizeText);
    return type === "blob" && Number.isFinite(size) && size <= 2 * 1024 * 1024 ? [objectId] : [];
  });
  const contents = gitWithInput(["cat-file", "--batch"], `${candidateIds.join("\n")}\n`, { encoding: null });
  let offset = 0;
  for (const expectedObjectId of candidateIds) {
    const headerEnd = contents.indexOf(10, offset);
    if (headerEnd < 0) throw new Error(`Missing batch header for ${expectedObjectId}`);
    const [objectId, type, sizeText] = contents.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(sizeText);
    if (objectId !== expectedObjectId || type !== "blob" || !Number.isFinite(size)) {
      throw new Error(`Unexpected batch object for ${expectedObjectId}`);
    }
    const contentStart = headerEnd + 1;
    const bytes = contents.subarray(contentStart, contentStart + size);
    offset = contentStart + size + 1;
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    for (const secretPattern of SECRET_CONTENT_PATTERNS) {
      secretPattern.pattern.lastIndex = 0;
      if (secretPattern.pattern.test(text)) {
        findings.push({ severity: "block", code: secretPattern.code, path: pathByObject.get(objectId) || "", objectId });
      }
    }
  }
  return findings;
}

function isApprovedStarterContentPath(logicalPath) {
  return [
    "art-manifest.json",
    "art/art-manifest.json",
    "controller-layouts.json",
    "controller-layouts.default.json",
    "game-constants.json",
    "game-constants.default.json",
    "game-flow.json",
    "game-flow.default.json",
    "host-audios.json",
    "host-audios.default.json",
    "stage-layouts.json",
    "stage-layouts.default.json"
  ].includes(logicalPath);
}

function parseArgs(argv) {
  const options = { mainRef: "HEAD", dataRef: "origin/game-data", outputRoot: DEFAULT_OUTPUT_ROOT, auditHistory: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--main-ref") options.mainRef = argv[++index];
    else if (argument === "--data-ref") options.dataRef = argv[++index];
    else if (argument === "--output") options.outputRoot = path.resolve(ROOT, argv[++index]);
    else if (argument === "--audit-history") options.auditHistory = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function writeBaseline(options) {
  const main = inventoryRevision(options.mainRef);
  const gameData = inventoryRevision(options.dataRef);
  const auditFindings = options.auditHistory ? scanReachableHistory() : [];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: git(["config", "--get", "remote.origin.url"]).trim(),
    main,
    gameData,
    audit: {
      performed: options.auditHistory,
      verdict: options.auditHistory ? (auditFindings.some((finding) => finding.severity === "block") ? "BLOCK" : "PASS") : "NOT_RUN",
      findings: auditFindings
    }
  };
  fs.mkdirSync(options.outputRoot, { recursive: true });
  const reportPath = path.join(options.outputRoot, "baseline-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  git(["archive", "--format=tar", "-o", path.join(options.outputRoot, "main.tar"), main.commit]);
  git(["archive", "--format=tar", "-o", path.join(options.outputRoot, "game-data.tar"), gameData.commit]);
  return { report, reportPath };
}

if (require.main === module) {
  try {
    const { report, reportPath } = writeBaseline(parseArgs(process.argv.slice(2)));
    console.log(`Baseline report: ${reportPath}`);
    console.log(`main: ${report.main.commit}`);
    console.log(`game-data: ${report.gameData.commit}`);
    console.log(`public history audit: ${report.audit.verdict}`);
    if (report.audit.verdict === "BLOCK") process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  isApprovedStarterContentPath,
  normalizedLogicalPath,
  parseArgs,
  scanReachableHistory,
  sha256,
  writeBaseline
};
