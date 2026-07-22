#!/usr/bin/env node
"use strict";

const { runCli } = require("@pop-party/engine/tooling");

process.exitCode = runCli(["validate", process.argv[2] || "content"]);
