"use strict";

// Guards committed dual-use JavaScript against drift from its TypeScript source,
// including package-owned shared contracts. This recompiles to a temp directory and
// compares every emitted file byte-for-byte with the adjacent committed JavaScript.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const sharedDir = path.join(repoRoot, "shared");
const engineSharedDir = path.join(repoRoot, "packages", "engine", "src", "shared");

function fail(message) {
  console.error("shared/*.js freshness check failed:");
  console.error(`- ${message}`);
  process.exit(1);
}

function main() {
  const sourceDirectories = [sharedDir, engineSharedDir];
  const tsSources = sourceDirectories.flatMap((directory) => fs.readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => path.relative(repoRoot, path.join(directory, name))));
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

    for (const tsPath of tsSources) {
      const jsPath = tsPath.replace(/\.ts$/, ".js");
      const committedPath = path.join(repoRoot, jsPath);
      const freshPath = path.join(tmpDir, jsPath);
      if (!fs.existsSync(freshPath)) {
        fail(`${jsPath} was not emitted from ${tsPath} — check tsconfig.shared.json include/outputs.`);
      }
      if (!fs.existsSync(committedPath)) {
        fail(`${jsPath} is missing — run \`npm run build:shared\` and commit it.`);
      }
      const fresh = fs.readFileSync(freshPath, "utf8");
      const committed = fs.readFileSync(committedPath, "utf8");
      if (fresh !== committed) {
        fail(`${jsPath} is out of date with ${tsPath} — run \`npm run build:shared\` and commit the result.`);
      }
    }

    console.log(`shared/*.js freshness check passed (${tsSources.length} file${tsSources.length === 1 ? "" : "s"} verified).`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
