"use strict";

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

function readBuildInfo(rootDir) {
  const buildInfoFile = path.join(rootDir, "build-info.json");
  try {
    const value = JSON.parse(fs.readFileSync(buildInfoFile, "utf8"));
    return Object.freeze({
      version: String(value.version || ""),
      commit: String(value.commit || ""),
      branch: String(value.branch || ""),
      generatedAt: String(value.generatedAt || "")
    });
  } catch (error) {
    return Object.freeze({
      version: "",
      commit: "",
      branch: "",
      generatedAt: ""
    });
  }
}

function readAppVersion(rootDir) {
  const packageFile = path.join(rootDir, "package.json");
  const buildInfo = readBuildInfo(rootDir);
  if (buildInfo.version) return buildInfo.version;
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
  readBuildInfo,
  readBuildNumber
};
