#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseArgs } = require("./template-utils");

const ROOT = path.resolve(__dirname, "..");

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? result.signal}): node ${args.join(" ")}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.spec) {
    console.error("Usage: node scripts/run-generated-fixture-test.js --spec <team-spec.json>");
    process.exit(1);
  }

  const specPath = path.resolve(ROOT, args.spec);
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-build-fixture-"));
  const outputDir = path.join(tempRoot, spec.skill.id);

  try {
    runNode(["scripts/validate-team-spec.js", specPath]);
    runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
    runNode(["scripts/validate-generated-skill.js", outputDir]);
    runNode([
      path.join(outputDir, "scripts", "assess-governance.js"),
      "--status",
      "assets/templates/workflow-status.json",
      "--json"
    ], { cwd: outputDir });
    runNode(["--test", path.join(outputDir, "test", "governance-core.test.js")], { cwd: outputDir });
    runNode([path.join(outputDir, "scripts", "run-acceptance-scenarios.js"), outputDir, "--mode", "contracts"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) main();
