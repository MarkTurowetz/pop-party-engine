"use strict";

// Guards the committed shared/*.js against drift from their shared/*.ts sources.
// shared/*.js is built (npm run build:shared) and committed so a plain `node server.js`
// deploy needs no build step — but that means a stale commit could ship JS that doesn't
// match the TS. This recompiles the TS to a temp dir and asserts each emitted file equals
// the committed one byte-for-byte. Also surfaces any shared/*.ts type error (noEmitOnError).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const sharedDir = path.join(repoRoot, "shared");

function fail(message) {
  console.error("shared/*.js freshness check failed:");
  console.error(`- ${message}`);
  process.exit(1);
}

function main() {
  const tsSources = fs.readdirSync(sharedDir).filter((name) => name.endsWith(".ts"));
  if (tsSources.length === 0) {
    console.log("shared/*.js freshness check passed (no shared/*.ts yet).");
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-fresh-"));
  try {
    try {
      execFileSync(
        process.execPath,
        [path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.shared.json", "--outDir", tmpDir],
        { cwd: repoRoot, stdio: "pipe" }
      );
    } catch (error) {
      fail(`shared/*.ts did not compile:\n${error.stdout?.toString() || ""}${error.stderr?.toString() || ""}`);
    }

    for (const tsName of tsSources) {
      const jsName = tsName.replace(/\.ts$/, ".js");
      const committedPath = path.join(sharedDir, jsName);
      const freshPath = path.join(tmpDir, jsName);
      if (!fs.existsSync(freshPath)) {
        fail(`${jsName} was not emitted from ${tsName} — check tsconfig.shared.json include/outputs.`);
      }
      if (!fs.existsSync(committedPath)) {
        fail(`${jsName} is missing — run \`npm run build:shared\` and commit it.`);
      }
      const fresh = fs.readFileSync(freshPath, "utf8");
      const committed = fs.readFileSync(committedPath, "utf8");
      if (fresh !== committed) {
        fail(`${jsName} is out of date with ${tsName} — run \`npm run build:shared\` and commit the result.`);
      }
    }

    console.log(`shared/*.js freshness check passed (${tsSources.length} file${tsSources.length === 1 ? "" : "s"} verified).`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
