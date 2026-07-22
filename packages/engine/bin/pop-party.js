#!/usr/bin/env node
"use strict";

const { runCli } = require("../src/tooling/cli");

process.exitCode = runCli();
