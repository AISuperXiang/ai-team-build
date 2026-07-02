#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { validateSpec } = require("./validate-team-spec");
const { scoreSpec } = require("./score-team-spec");

const ROOT = path.resolve(__dirname, "..");

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ai-team-build-${name}-`));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function readFixtureSpec() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/stock-trading-team.team-spec.json"), "utf8"));
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options
  });
}

function assert(condition, message, details = "") {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  console.error(`FAIL ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function testAcceptanceRejectsFakeDirectory() {
  const dir = tmpDir("fake-acceptance");
  writeJson(path.join(dir, "generation-report.json"), {
    acceptanceScenarios: [
      {
        id: "s1",
        input: "x",
        expectedOutputs: ["foo.md"],
        mustPassGates: ["gate-x"],
        failureExamples: ["bad-x"]
      }
    ],
    riskControls: {
      requiredDisclaimers: ["disc-x"],
      blockedClaims: ["block-x"],
      evidenceRules: ["evidence-x"]
    }
  });
  writeText(path.join(dir, "foo.md"), "foo file gate-x bad-x disc-x block-x evidence-x");
  const result = runNode(["scripts/run-acceptance-scenarios.js", dir]);
  assert(result.status !== 0, "acceptance rejects fake text-only directory", result.stdout + result.stderr);
}

function testAcceptanceRejectsPathTraversal() {
  const dir = tmpDir("escape-acceptance");
  writeText(path.join(dir, "outside.md"), "outside");
  const root = path.join(dir, "root");
  writeJson(path.join(root, "generation-report.json"), {
    generator: "ai-team-build",
    plannedFiles: ["generation-report.json"],
    counts: { acceptanceScenarios: 1, dataContracts: 1, capabilities: 1 },
    acceptanceScenarios: [
      {
        id: "escape",
        input: "x",
        expectedOutputs: ["../outside.md"],
        mustPassGates: ["gate-x"],
        failureExamples: ["bad-x"]
      }
    ],
    riskControls: {}
  });
  const result = runNode(["scripts/run-acceptance-scenarios.js", root]);
  assert(result.status !== 0, "acceptance rejects expectedOutputs path traversal", result.stdout + result.stderr);
}

function testMissingCoreSpecFieldsRejected() {
  const spec = readFixtureSpec();
  delete spec.domainKnowledge;
  delete spec.capabilityMatrix;
  delete spec.dataContracts;
  const reporter = validateSpec(spec);
  assert(reporter.failedCount() > 0, "validateSpec rejects missing domainKnowledge/capabilityMatrix/dataContracts");
}

function testQuotedFrontmatterGeneration() {
  const dir = tmpDir("quoted-frontmatter");
  const spec = readFixtureSpec();
  spec.skill.description = "A \"quoted\" description with colon: value";
  const specPath = path.join(dir, "spec.json");
  const outputDir = path.join(dir, spec.skill.id);
  writeJson(specPath, spec);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "generator accepts quoted description", generate.stdout + generate.stderr);
  const skillMd = fs.readFileSync(path.join(outputDir, "SKILL.md"), "utf8");
  assert(!skillMd.includes("description: \"A \"quoted\""), "generated SKILL.md escapes quoted frontmatter");
  const validate = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(validate.status === 0, "generated validator accepts escaped frontmatter", validate.stdout + validate.stderr);
}

function testUnmatchedDomainPackFallsBackToDraft() {
  const dir = tmpDir("fallback-spec");
  const specPath = path.join(dir, "customer-service-spec.json");
  const synthesize = runNode(["scripts/synthesize-team-spec.js", "--goal", "创建一个客服质检团队", "--output", specPath]);
  assert(synthesize.status === 0, "synthesize falls back when no domain pack matches", synthesize.stdout + synthesize.stderr);
  const validate = runNode(["scripts/validate-team-spec.js", specPath]);
  assert(validate.status === 0, "fallback spec passes validate-team-spec", validate.stdout + validate.stderr);
  const score = scoreSpec(JSON.parse(fs.readFileSync(specPath, "utf8")));
  assert(score.grade !== "A", "fallback generic draft is blocked from A grade");
  assert(score.gradeBlockers.some((item) => item.includes("generic-draft")), "fallback A-grade blocker is reported");
}

function testUnsafeOutputDirectoryRejected() {
  const spec = readFixtureSpec();
  spec.output.defaultDirectory = "/";
  spec.output.overwritePolicy = "overwrite";
  const reporter = validateSpec(spec);
  assert(reporter.failedCount() > 0, "validateSpec rejects unsafe root output directory");

  const dir = tmpDir("unsafe-output");
  const specPath = path.join(dir, "spec.json");
  writeJson(specPath, spec);
  const dryRun = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--dry-run"]);
  assert(dryRun.status !== 0, "generator rejects unsafe output directory before dry-run or overwrite", dryRun.stdout + dryRun.stderr);
}

function testExternalSkillAdaptersBlockAGrade() {
  const spec = readFixtureSpec();
  spec.externalSkills.adapters = [];
  const score = scoreSpec(spec);
  assert(score.grade !== "A", "missing adapters blocks A grade");
  assert(score.gradeBlockers.some((item) => item.includes("externalSkills.adapters")), "missing adapters appears in grade blockers");
}

function main() {
  testAcceptanceRejectsFakeDirectory();
  testAcceptanceRejectsPathTraversal();
  testMissingCoreSpecFieldsRejected();
  testUnsafeOutputDirectoryRejected();
  testQuotedFrontmatterGeneration();
  testUnmatchedDomainPackFallsBackToDraft();
  testExternalSkillAdaptersBlockAGrade();
  console.log("\nAll release regression checks passed.");
}

if (require.main === module) main();
