#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { assessGovernanceState } = require("./governance-core");

const MAX_STATUS_BYTES = 256 * 1024;

class CliError extends Error {}

function parseArgs(argv) {
  const options = { json: false, requireReady: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--status", "--json", "--require-ready"].includes(arg)) {
      throw new CliError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) throw new CliError(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-ready") {
      options.requireReady = true;
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new CliError("--status requires a value");
      options.status = value;
      index += 1;
    }
  }
  if (!options.status) throw new CliError("--status is required");
  return options;
}

function readStatus(root, relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new CliError("--status must be a safe relative path");
  }
  const rootReal = fs.realpathSync(root);
  const candidate = path.resolve(rootReal, relativePath);
  const candidateReal = fs.realpathSync(candidate);
  const fromRoot = path.relative(rootReal, candidateReal);
  if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new CliError("--status must stay inside the skill root");
  }
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CliError("--status must be a regular file");
  if (stat.size > MAX_STATUS_BYTES) throw new CliError("--status exceeds 256 KiB");
  try {
    return JSON.parse(fs.readFileSync(candidate, "utf8"));
  } catch {
    throw new CliError("--status must contain valid JSON");
  }
}

function main(argv) {
  const options = parseArgs(argv);
  const report = assessGovernanceState(readStatus(process.cwd(), options.status));
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`readiness=${report.readiness} claim=${report.claim} verification=${report.derivedVerificationLevel}`);
    for (const item of report.diagnostics) {
      console.log(`${item.blocking ? "BLOCK" : "REVIEW"} ${item.code}: ${item.detail}`);
    }
  }
  if (!report.valid || (options.requireReady && report.readiness !== "ready")) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  const cliError = error instanceof CliError;
  const output = {
    valid: false,
    readiness: "blocked",
    claim: "pending",
    derivedVerificationLevel: "V0",
    checks: [],
    diagnostics: [{
      code: cliError ? "INVALID_INPUT" : "READ_FAILED",
      detail: error.message,
      blocking: true
    }]
  };
  if (process.argv.includes("--json")) console.log(JSON.stringify(output));
  else console.error(output.diagnostics[0].detail);
  process.exitCode = cliError ? 2 : 1;
}
