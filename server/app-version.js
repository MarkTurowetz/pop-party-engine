const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

function readBuildNumber(rootDir) {
  try {
    return childProcess.execSync("git rev-list --count HEAD", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function readAppVersion(rootDir) {
  const buildInfoFile = path.join(rootDir, "build-info.json");
  const packageFile = path.join(rootDir, "package.json");
  try {
    const buildInfo = JSON.parse(fs.readFileSync(buildInfoFile, "utf8"));
    if (buildInfo.version) return buildInfo.version;
  } catch (error) {
    // Fall back below for older checkouts or local experiments.
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    const buildNumber = readBuildNumber(rootDir);
    return buildNumber ? `${manifest.version}.${buildNumber}` : manifest.version || "0.0.0";
  } catch (error) {
    return "0.0.0";
  }
}

module.exports = {
  readAppVersion,
  readBuildNumber
};
