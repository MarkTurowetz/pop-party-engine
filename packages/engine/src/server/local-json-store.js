"use strict";

const fs = require("fs");
const path = require("path");

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function backupJsonFile(filePath, backupDir, prefix) {
  if (!fs.existsSync(filePath)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(filePath, path.join(backupDir, `${prefix}-${stamp}.json`));
}

function mirrorJsonFile(filePath, data) {
  try {
    writeJsonFile(filePath, data);
  } catch (error) {
    // Durable storage is authoritative; local mirrors are best-effort.
  }
}

module.exports = {
  backupJsonFile,
  mirrorJsonFile,
  readJsonFile,
  writeJsonFile
};
