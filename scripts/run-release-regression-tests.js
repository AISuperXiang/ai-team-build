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
  const generatedContracts = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(
    generatedContracts.status === 0,
    "generated contract validator parses quoted frontmatter arrays",
    generatedContracts.stdout + generatedContracts.stderr
  );
}

function testUnmatchedDomainPackFallsBackToDraft() {
  const dir = tmpDir("fallback-spec");
  const specPath = path.join(dir, "customer-service-spec.json");
  const synthesize = runNode(["scripts/synthesize-team-spec.js", "--goal", "创建一个客服质检团队", "--output", specPath]);
  assert(synthesize.status === 0, "synthesize falls back when no domain pack matches", synthesize.stdout + synthesize.stderr);
  const validate = runNode(["scripts/validate-team-spec.js", specPath]);
  assert(validate.status === 0, "fallback spec passes validate-team-spec", validate.stdout + validate.stderr);
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const score = scoreSpec(spec);
  assert(score.grade !== "A", "fallback generic draft is blocked from A grade");
  assert(score.gradeBlockers.some((item) => item.includes("generic-draft")), "fallback A-grade blocker is reported");
  const outputDir = path.join(dir, spec.skill.id);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "fallback generic draft generates successfully", generate.stdout + generate.stderr);
  const validateGenerated = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(validateGenerated.status === 0, "fallback generated team passes generated-skill validation", validateGenerated.stdout + validateGenerated.stderr);
  const acceptance = runNode([path.join(outputDir, "scripts", "run-acceptance-scenarios.js"), outputDir]);
  assert(acceptance.status === 0, "fallback generated team passes acceptance contracts", acceptance.stdout + acceptance.stderr);
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
  assert(score.gradeBlockers.some((item) => /adapter/i.test(item)), "missing adapters appears in grade blockers");
}

function testInvalidSpecCannotScoreA() {
  const spec = readFixtureSpec();
  spec.output.defaultDirectory = "/";
  const score = scoreSpec(spec);
  assert(score.grade === "D", "invalid output path forces D grade");
  assert(score.certificationLevel === "invalid", "invalid spec has invalid certification");
}

function testHighRiskWithoutHumanReviewIsRejected() {
  const spec = readFixtureSpec();
  delete spec.riskControls.humanReview;
  const reporter = validateSpec(spec);
  assert(reporter.failedCount() > 0, "high-risk spec without human review is rejected");
  const score = scoreSpec(spec);
  assert(score.grade === "D", "high-risk spec without human review cannot be rated");
}

function testCandidateMemberMayNotOwnStaticStage() {
  const spec = readFixtureSpec();
  spec.workflows[0].members.push("market-researcher");
  const reporter = validateSpec(spec);
  assert(reporter.failedCount() === 0, "candidate member may be consulted or not_applicable without owning a static stage");
}

function testVenturePackMatchesEntrepreneurGoal() {
  const dir = tmpDir("venture-pack");
  const specPath = path.join(dir, "venture-spec.json");
  const synthesize = runNode([
    "scripts/synthesize-team-spec.js",
    "--goal",
    "我是一个从零开始的企业家，需要搭建创业团队验证客户、产品、GTM 和现金流",
    "--output",
    specPath
  ]);
  assert(synthesize.status === 0, "entrepreneur goal synthesizes successfully", synthesize.stdout + synthesize.stderr);
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert(spec.skill.id === "venture-building-team", "entrepreneur goal selects venture-building domain pack");
  assert(
    ["customer-research-lead", "solution-lead", "go-to-market-lead", "finance-risk-lead"]
      .every((role) => spec.members.some((member) => member.id === role)),
    "venture team covers customer, solution, GTM, and finance-risk capabilities"
  );
  const score = scoreSpec(spec);
  assert(score.grade === "A" && score.certificationLevel === "contract-validated", "venture blueprint is contract-validated A grade");
}

function testUnknownMedicalGoalUsesAssuranceAndHumanReview() {
  const dir = tmpDir("medical-fallback");
  const specPath = path.join(dir, "medical-spec.json");
  const synthesize = runNode([
    "scripts/synthesize-team-spec.js",
    "--goal",
    "创建一个罕见病诊断和处方辅助团队",
    "--output",
    specPath
  ]);
  assert(synthesize.status === 0, "unknown medical goal synthesizes a guarded draft", synthesize.stdout + synthesize.stderr);
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert(spec.riskControls.domainRiskLevel === "high", "medical fallback is classified high risk");
  assert(spec.governance.defaultExecutionProfile === "assurance", "medical fallback uses assurance profile");
  assert(spec.riskControls.humanReview.required === true, "medical fallback requires human review");
  assert(spec.riskControls.humanReview.blockedWithoutApproval === true, "medical fallback blocks without approval");
  assert(scoreSpec(spec).grade !== "A", "generic medical draft cannot receive A grade");
}

function testGeneratedStatusCarriesExecutionContract() {
  const dir = tmpDir("execution-contract");
  const spec = readFixtureSpec();
  const specPath = path.join(dir, "spec.json");
  const outputDir = path.join(dir, spec.skill.id);
  writeJson(specPath, spec);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "generator writes execution contract", generate.stdout + generate.stderr);
  const status = JSON.parse(fs.readFileSync(path.join(outputDir, "assets", "templates", "workflow-status.json"), "utf8"));
  assert(["lightweight", "standard", "assurance"].includes(status.executionProfile), "status has executionProfile");
  assert(status.verificationLevel === "V0", "new generated team starts at V0");
  assert(/^V[0-4]$/.test(status.targetVerificationLevel), "status has targetVerificationLevel");
  assert(Array.isArray(status.blockers) && Array.isArray(status.uncoveredRisks), "status tracks blockers and uncovered risks");
  for (const file of [
    "decision-log.md",
    "risk-register.md",
    "role-handoff.md",
    "evidence-index.md",
    "delivery-summary.md"
  ]) {
    assert(fs.existsSync(path.join(outputDir, "assets", "templates", file)), `generated team includes governance template: ${file}`);
  }
  const riskRegister = fs.readFileSync(path.join(outputDir, "assets", "templates", "risk-register.md"), "utf8");
  assert(riskRegister.includes("# 风险台账"), "domain template overrides the generic governance fallback");
  const runtime = JSON.parse(fs.readFileSync(path.join(outputDir, "skill-runtime.json"), "utf8"));
  assert(Boolean(runtime.agentHints.verificationPolicy), "generated runtime records verification boundary");
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, "generation-report.json"), "utf8"));
  assert(report.verification.factoryVerificationLevel === "V2", "generation report records factory V2");
  assert(report.verification.generatedTeamVerificationLevel === "V0", "generation report preserves team V0");
}

function testSkillAuditIsStaticAndSupportsBatchRoots() {
  const dir = tmpDir("skill-audit");
  const markerPath = path.join(dir, "target-script-ran");
  const weakSkill = path.join(dir, "weak-skill");
  const secondSkill = path.join(dir, "second-skill");
  writeText(
    path.join(weakSkill, "SKILL.md"),
    `---\nname: weak-skill\ndescription: "Use when a user asks for a weak skill."\n---\n\n# Weak Skill\n\nRun the task.\n`
  );
  writeJson(path.join(weakSkill, "package.json"), {
    scripts: {
      test: `node -e "require('fs').writeFileSync('${markerPath}', 'ran')"`
    }
  });
  writeText(
    path.join(secondSkill, "SKILL.md"),
    `---\nname: second-skill\ndescription: "Use when a user asks for a second weak skill."\n---\n\n# Second Skill\n\nRun the task.\n`
  );

  const single = runNode(["scripts/audit-skills.js", weakSkill, "--format", "json"]);
  assert(single.status === 0, "skill audit accepts a standalone Skill path", single.stdout + single.stderr);
  const singleReport = JSON.parse(single.stdout);
  assert(singleReport.auditMode === "static-only", "skill audit reports static-only mode");
  assert(singleReport.totalScore < 70, "skill audit identifies a weak Skill baseline");
  assert(singleReport.findings.some((finding) => finding.priority === "P1"), "skill audit reports actionable P1 findings");
  assert(!fs.existsSync(markerPath), "skill audit does not execute target package scripts");

  const batch = runNode(["scripts/audit-skills.js", "--root", dir, "--format", "json"]);
  assert(batch.status === 0, "skill audit supports batch root scanning", batch.stdout + batch.stderr);
  const batchReport = JSON.parse(batch.stdout);
  assert(batchReport.reports.length === 2, "skill audit reports every Skill found below a batch root");
}

function testSkillAuditChecksTeamRoleActivation() {
  const dir = tmpDir("team-role-activation");
  const teamSkill = path.join(dir, "team-skill");
  writeText(
    path.join(teamSkill, "SKILL.md"),
    `---\nname: team-skill\ndescription: "Use when a user asks for a team workflow."\n---\n\n# Team Skill\n\n## 触发边界\n\nUse when a team workflow is needed.\n\n## 不适用\n\nNot for a single-file task.\n\n## 执行循环\n\nRoute, Load, Execute, Validate.\n`
  );
  writeText(path.join(teamSkill, "members", "analyst.md"), "# Analyst\n");

  const incomplete = runNode(["scripts/audit-skills.js", teamSkill, "--format", "json"]);
  assert(incomplete.status === 0, "skill audit accepts a team Skill without rolePlan", incomplete.stdout + incomplete.stderr);
  const incompleteReport = JSON.parse(incomplete.stdout);
  const incompleteExecution = incompleteReport.dimensions.find((item) => item.id === "execution-orchestration");
  assert(
    incompleteExecution.gaps.some((gap) => gap.includes("rolePlan")),
    "skill audit identifies missing team role activation contract"
  );

  writeText(
    path.join(teamSkill, "docs", "role-activation-methodology.md"),
    "# Role Activation\n\nrolePlan records role, active, consulted, not_applicable, reason, and stages. not_applicable roles use N/A scoring. Reassess rolePlan when scope changes.\n"
  );
  const complete = runNode(["scripts/audit-skills.js", teamSkill, "--format", "json"]);
  assert(complete.status === 0, "skill audit accepts team role activation contract", complete.stdout + complete.stderr);
  const completeReport = JSON.parse(complete.stdout);
  const completeExecution = completeReport.dimensions.find((item) => item.id === "execution-orchestration");
  assert(
    !completeExecution.gaps.some((gap) => gap.includes("rolePlan")),
    "skill audit clears role activation finding when the contract is present"
  );
}

function main() {
  testAcceptanceRejectsFakeDirectory();
  testAcceptanceRejectsPathTraversal();
  testMissingCoreSpecFieldsRejected();
  testUnsafeOutputDirectoryRejected();
  testQuotedFrontmatterGeneration();
  testUnmatchedDomainPackFallsBackToDraft();
  testExternalSkillAdaptersBlockAGrade();
  testInvalidSpecCannotScoreA();
  testHighRiskWithoutHumanReviewIsRejected();
  testCandidateMemberMayNotOwnStaticStage();
  testVenturePackMatchesEntrepreneurGoal();
  testUnknownMedicalGoalUsesAssuranceAndHumanReview();
  testGeneratedStatusCarriesExecutionContract();
  testSkillAuditIsStaticAndSupportsBatchRoots();
  testSkillAuditChecksTeamRoleActivation();
  console.log("\nAll release regression checks passed.");
}

if (require.main === module) main();
