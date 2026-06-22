const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DEFAULT_REF = "origin/game-data";
const DATA_FILES = [
  "game-flow.json",
  "game-constants.json",
  "stage-layouts.json",
  "controller-layouts.json",
  "host-audios.json",
  "art/art-manifest.json"
];

function parseArgs(argv) {
  const options = {
    all: false,
    dryRun: false,
    fetch: true,
    files: [],
    ref: DEFAULT_REF
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-fetch") {
      options.fetch = false;
    } else if (arg === "--ref") {
      options.ref = argv[index + 1] || DEFAULT_REF;
      index += 1;
    } else if (arg === "--file") {
      const file = argv[index + 1] || "";
      if (file) options.files.push(file);
      index += 1;
    } else if (arg) {
      options.files.push(arg);
    }
  }
  if (!options.all && !options.files.length) options.files.push("game-flow.json");
  return options;
}

function git(args, { allowFailure = false } = {}) {
  try {
    return childProcess.execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    if (allowFailure) return "";
    const details = String(error.stderr || error.message || "").trim();
    throw new Error(`git ${args.join(" ")} failed${details ? `: ${details}` : ""}`);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupPathFor(file) {
  const parsed = path.parse(file);
  const backupDir = path.join(ROOT, `${parsed.name}.backups`);
  return path.join(backupDir, `${parsed.name}-local-sync-${timestamp()}${parsed.ext || ".json"}`);
}

function readFromRef(ref, file) {
  return git(["show", `${ref}:${file}`], { allowFailure: true });
}

function syncFile(ref, file, dryRun) {
  if (!DATA_FILES.includes(file)) {
    throw new Error(`Refusing to sync unsupported path: ${file}`);
  }
  const source = readFromRef(ref, file);
  if (!source) {
    console.log(`skip ${file}: not present in ${ref}`);
    return false;
  }
  JSON.parse(source);
  const targetPath = path.join(ROOT, file);
  const next = source.endsWith("\n") ? source : `${source}\n`;
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  if (existing === next) {
    console.log(`ok ${file}: already current`);
    return false;
  }
  const backupPath = existing ? backupPathFor(file) : "";
  if (dryRun) {
    console.log(`would sync ${file}${backupPath ? ` (backup ${path.relative(ROOT, backupPath)})` : ""}`);
    return true;
  }
  if (backupPath) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, existing);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, next);
  console.log(`synced ${file}${backupPath ? ` (backup ${path.relative(ROOT, backupPath)})` : ""}`);
  return true;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.fetch) {
    git(["fetch", "origin", "+game-data:refs/remotes/origin/game-data"], { allowFailure: true });
  }
  const files = options.all ? DATA_FILES : [...new Set(options.files)];
  let changed = 0;
  for (const file of files) {
    if (syncFile(options.ref, file, options.dryRun)) changed += 1;
  }
  console.log(`${options.dryRun ? "checked" : "complete"}: ${changed} file${changed === 1 ? "" : "s"} ${options.dryRun ? "would change" : "changed"}`);
}

main();
