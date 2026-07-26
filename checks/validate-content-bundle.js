#!/usr/bin/env node
"use strict";

const { runCli } = require("@pop-party/engine/tooling");

runCli(["validate", process.argv[2] || "content"])
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`Content bundle validation failed: ${error.message}`);
    process.exitCode = 1;
  });
