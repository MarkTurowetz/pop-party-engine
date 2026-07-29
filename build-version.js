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

function readCommittedBuildInfo() {
  try {
    return JSON.parse(gitOutput(["show", "HEAD:build-info.json"]) || "{}");
  } catch (error) {
    return {};
  }
}

function resolveBuildNumber({ committedBuildNumber, existingBuildNumber, useNextCommit }) {
  // The committed stamp is the shared authority across build environments.
  // Render checks out a shallow repository while release verification uses a
  // full clone, so commit counts cannot safely participate in the version.
  const alreadyStampedNextBuild = existingBuildNumber > committedBuildNumber ? existingBuildNumber : 0;
  return useNextCommit
    ? Math.max(committedBuildNumber + 1, alreadyStampedNextBuild)
    : Math.max(committedBuildNumber, existingBuildNumber);
}

function buildInfo() {
  const existing = readExistingBuildInfo();
  const committed = readCommittedBuildInfo();
  const baseVersion = readPackageVersion();
  const headCount = Number(gitOutput(["rev-list", "--count", "HEAD"]));
  const useNextCommit = process.argv.includes("--next");
  const existingBuildNumber = Number(existing.buildNumber || 0);
  const committedBuildNumber = Number(committed.buildNumber || 0);
  const buildNumber = resolveBuildNumber({ committedBuildNumber, existingBuildNumber, headCount, useNextCommit });
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

if (require.main === module) {
  const info = buildInfo();
  fs.writeFileSync(BUILD_INFO_FILE, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`Build version: ${info.version}`);
}

module.exports = { buildInfo, resolveBuildNumber };
