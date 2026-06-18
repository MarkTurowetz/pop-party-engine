const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PACKAGE_FILE = path.join(ROOT, "package.json");
const BUILD_INFO_FILE = path.join(ROOT, "build-info.json");

function gitOutput(args) {
  try {
    return childProcess.execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function readPackageVersion() {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8")).version || "0.0.0";
  } catch (error) {
    return "0.0.0";
  }
}

function readExistingBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(BUILD_INFO_FILE, "utf8"));
  } catch (error) {
    return {};
  }
}

function buildInfo() {
  const existing = readExistingBuildInfo();
  const baseVersion = readPackageVersion();
  const headCount = Number(gitOutput(["rev-list", "--count", "HEAD"]));
  const useNextCommit = process.argv.includes("--next");
  const buildNumber = Number.isFinite(headCount) && headCount > 0
    ? headCount + (useNextCommit ? 1 : 0)
    : Number(existing.buildNumber || 0);
  const commit = gitOutput(["rev-parse", "--short", "HEAD"]) || existing.commit || "";
  const branch = gitOutput(["branch", "--show-current"]) || existing.branch || "";

  return {
    version: buildNumber ? `${baseVersion}.${buildNumber}` : baseVersion,
    baseVersion,
    buildNumber,
    commit,
    branch,
    generatedAt: new Date().toISOString()
  };
}

const info = buildInfo();
fs.writeFileSync(BUILD_INFO_FILE, `${JSON.stringify(info, null, 2)}\n`);
console.log(`Build version: ${info.version}`);
