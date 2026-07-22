#!/usr/bin/env node
"use strict";

const { runCli } = require("../src/tooling/cli");

runCli().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
