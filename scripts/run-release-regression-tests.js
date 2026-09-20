#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { validateSpec } = require("./validate-team-spec");
const { scoreSpec } = require("./score-team-spec");

const ROOT = path.resolve(__dirname, "..");
const GENERATOR_VERSION = require(path.join(ROOT, "package.json")).version;

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

function frontmatterKeys(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_-]+):/))
    .filter(Boolean)
    .map((item) => item[1])
    .sort();
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function generateFixture(dir) {
  const spec = readFixtureSpec();
  const specPath = path.join(dir, "spec.json");
  const outputDir = path.join(dir, spec.skill.id);
  writeJson(specPath, spec);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "fixture generation succeeds", generate.stdout + generate.stderr);
  return { outputDir, spec };
}

function buildExecutionResults(outputDir, report) {
  const runs = report.acceptanceScenarios.map((scenario) => {
    const producedArtifacts = scenario.expectedOutputs.map((artifact) => {
      const relativePath = path.posix.join("workspace", "acceptance", scenario.id, artifact);
      const content = [
        `Scenario: ${scenario.id}`,
        `Input: ${scenario.input}`,
        ...(report.riskControls.requiredDisclaimers || [])
      ].join("\n");
      writeText(path.join(outputDir, relativePath), content);
      return {
        artifact,
        path: relativePath,
        sha256: sha256(content)
      };
    });
    const run = {
      scenarioId: scenario.id,
      inputDigest: sha256(scenario.input),
      workflow: scenario.expectedWorkflow,
      executionProfile: scenario.expectedProfile,
      verificationLevel: scenario.minimumVerificationLevel,
      rolePlan: scenario.expectedRolePlan,
      producedArtifacts,
      passedGates: scenario.mustPassGates,
      failureAssertions: scenario.failureExamples.map((example) => ({
        example,
        observed: false,
        evidenceRef: `scenario:${scenario.id}:failure:${sha256(example).slice(0, 12)}`
      })),
      result: {
        assertion: "pass",
        executed: 1,
        runner: { status: "passed", exitCode: 0 },
        wrapper: { status: "not_applicable", exitCode: null }
      },
      evidenceRefs: [`scenario:${scenario.id}:result`]
    };
    if ((scenario.mustPassGates || []).includes("human-review-gate")) {
      run.humanApproval = {
        reviewerType: "human",
        reviewerId: "fixture-reviewer",
        evidenceRef: `scenario:${scenario.id}:human-approval`,
        reviewedAt: "2026-09-20T10:00:00Z"
      };
    }
    return run;
  });
  return {
    schemaVersion: "1.0",
    skillId: report.skill.id,
    generatorVersion: report.generatorVersion,
    runs
  };
}

function runExecutionAcceptance(outputDir, results) {
  const resultsPath = path.join(outputDir, "workspace", "acceptance-results.json");
  writeJson(resultsPath, results);
  return runNode([
    path.join(outputDir, "scripts", "run-acceptance-scenarios.js"),
    outputDir,
    "--mode",
    "execution",
    "--results",
    "workspace/acceptance-results.json",
    "--json"
  ]);
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
  spec.readme = {
    english: {
      name: "Stock Trading Research Team",
      description: "Evidence-driven stock research and risk-control team.",
      domain: "A-share market research",
      primaryValue: "Turn market evidence into bounded research conclusions and risk-aware plans.",
      targetUsers: ["Investors who need structured research workflows."],
      riskDisclaimers: ["Research output is informational and not investment advice."],
      blockedClaims: ["Do not promise returns or issue deterministic trading instructions."]
    }
  };
  const specPath = path.join(dir, "spec.json");
  const outputDir = path.join(dir, spec.skill.id);
  writeJson(specPath, spec);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "generator accepts quoted description", generate.stdout + generate.stderr);
  const skillMd = fs.readFileSync(path.join(outputDir, "SKILL.md"), "utf8");
  assert(!skillMd.includes("description: \"A \"quoted\""), "generated SKILL.md escapes quoted frontmatter");
  assert(
    skillMd.includes("## 最小加载矩阵") && skillMd.includes("不一次性加载全部成员"),
    "generated SKILL.md defines progressive loading"
  );
  const readme = fs.readFileSync(path.join(outputDir, "README.md"), "utf8");
  const readmeEn = fs.readFileSync(path.join(outputDir, "README_EN.md"), "utf8");
  assert(readme.includes("[English](./README_EN.md)"), "generated README links to README_EN");
  assert(readmeEn.includes("[简体中文](./README.md)"), "generated README_EN links to README");
  assert(readmeEn.includes("Evidence-driven stock research"), "generated README_EN uses declared English metadata");
  const runtime = JSON.parse(fs.readFileSync(path.join(outputDir, "skill-runtime.json"), "utf8"));
  assert(runtime.install.requiredFiles.includes("README_EN.md"), "generated runtime requires README_EN.md");
  const generationReport = JSON.parse(fs.readFileSync(path.join(outputDir, "generation-report.json"), "utf8"));
  assert(generationReport.generatorVersion === GENERATOR_VERSION, "generation report records current generator version");
  assert(generationReport.plannedFiles.includes("README_EN.md"), "generation report plans README_EN.md");
  const validate = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(validate.status === 0, "generated validator accepts escaped frontmatter", validate.stdout + validate.stderr);
  const generatedContracts = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(
    generatedContracts.status === 0,
    "generated contract validator parses quoted frontmatter arrays",
    generatedContracts.stdout + generatedContracts.stderr
  );
}

function testGeneratedFixtureRunnerCleansTemporaryDirectories() {
  const successTmpRoot = tmpDir("fixture-runner-success");
  const success = runNode(
    ["scripts/run-generated-fixture-test.js", "--spec", "fixtures/stock-trading-team.team-spec.json"],
    { env: { ...process.env, TMPDIR: successTmpRoot } }
  );
  assert(success.status === 0, "fixture runner succeeds from a system temporary directory", success.stdout + success.stderr);
  assert(fs.readdirSync(successTmpRoot).length === 0, "fixture runner cleans temporary output after success");

  const invalidSpecRoot = tmpDir("fixture-runner-invalid-spec");
  const invalidSpecPath = path.join(invalidSpecRoot, "invalid-spec.json");
  const invalidSpec = readFixtureSpec();
  delete invalidSpec.domainKnowledge;
  writeJson(invalidSpecPath, invalidSpec);
  const failureTmpRoot = tmpDir("fixture-runner-failure");
  const failure = runNode(
    ["scripts/run-generated-fixture-test.js", "--spec", invalidSpecPath],
    { env: { ...process.env, TMPDIR: failureTmpRoot } }
  );
  assert(failure.status !== 0, "fixture runner preserves validation failure status", failure.stdout + failure.stderr);
  assert(fs.readdirSync(failureTmpRoot).length === 0, "fixture runner cleans temporary output after failure");
}

function testGeneratedCommandContractCompatibility() {
  const dir = tmpDir("command-contract");
  const spec = readFixtureSpec();
  const specPath = path.join(dir, "spec.json");
  const outputDir = path.join(dir, spec.skill.id);
  writeJson(specPath, spec);
  const generate = runNode(["scripts/generate-team-skill.js", "--spec", specPath, "--output", outputDir, "--overwrite"]);
  assert(generate.status === 0, "generator writes command route contract", generate.stdout + generate.stderr);

  const report = JSON.parse(fs.readFileSync(path.join(outputDir, "generation-report.json"), "utf8"));
  const commandPath = path.join(outputDir, report.commandFile);
  const command = fs.readFileSync(commandPath, "utf8");
  const commandSchema = JSON.parse(fs.readFileSync(path.join(outputDir, "schemas", "command.schema.json"), "utf8"));
  const commandTemplate = fs.readFileSync(path.join(ROOT, "assets", "templates", "command.md.tpl"), "utf8");

  assert(!/^members:/m.test(command), "new generated command omits command-level members");
  assert(!commandSchema.required.includes("members"), "command schema does not require deprecated members");
  assert(commandSchema.properties.members.deprecated === true, "command schema marks members as deprecated");
  assert(
    JSON.stringify(frontmatterKeys(command)) === JSON.stringify(frontmatterKeys(commandTemplate)),
    "command template and inline renderer expose the same frontmatter fields"
  );

  const validLegacyCommand = command.replace(
    /^execution_mode:/m,
    `members:\n  - ${JSON.stringify(spec.members[0].id)}\nexecution_mode:`
  );
  writeText(commandPath, validLegacyCommand);
  const validExternal = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(validExternal.status === 0, "external validator accepts valid legacy command members", validExternal.stdout + validExternal.stderr);
  const validInternal = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(validInternal.status === 0, "generated validator accepts valid legacy command members", validInternal.stdout + validInternal.stderr);

  const invalidLegacyCommand = validLegacyCommand.replace(spec.members[0].id, "unknown-command-member");
  writeText(commandPath, invalidLegacyCommand);
  const invalidExternal = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(invalidExternal.status !== 0, "external validator rejects unknown legacy command member");
  const invalidInternal = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(invalidInternal.status !== 0, "generated validator rejects unknown legacy command member");

  const missingTitleCommand = command.replace(/^title:.*\n/m, "");
  writeText(commandPath, missingTitleCommand);
  const missingTitleExternal = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(missingTitleExternal.status !== 0, "external validator rejects command without required title");
  const missingTitleInternal = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(missingTitleInternal.status !== 0, "generated validator rejects command without required title");

  const unknownWorkflowCommand = command
    .split(spec.workflows[0].id)
    .join("unknown-command-workflow");
  writeText(commandPath, unknownWorkflowCommand);
  const unknownWorkflowExternal = runNode(["scripts/validate-generated-skill.js", outputDir]);
  assert(unknownWorkflowExternal.status !== 0, "external validator rejects command missing a declared workflow");
  const unknownWorkflowInternal = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(unknownWorkflowInternal.status !== 0, "generated validator rejects command missing a declared workflow");
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

function testAcceptanceRequiresParticipatingOwners() {
  const spec = readFixtureSpec();
  const scenario = spec.acceptanceScenarios[0];
  scenario.expectedRolePlan.active = scenario.expectedRolePlan.active.filter((role) => role !== "risk-manager");
  scenario.expectedRolePlan.notApplicable.push("risk-manager");
  const reporter = validateSpec(spec);
  assert(
    reporter.results.some((result) =>
      !result.ok &&
      result.message.includes("expected output has a participating owner: risk-register.md")),
    "acceptance rejects a risk artifact whose owner is not participating"
  );
  assert(
    reporter.results.some((result) =>
      !result.ok &&
      result.message.includes("required gate has a participating owner: human-review-gate")),
    "acceptance rejects a human-review gate whose accountable role is not participating"
  );
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

function testGeneratedGovernanceEnforcesReadiness() {
  const dir = tmpDir("governance-readiness");
  const { outputDir } = generateFixture(dir);
  const statusPath = path.join(outputDir, "assets", "templates", "workflow-status.json");
  const initial = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  assert(Boolean(initial.governanceControl), "generated status contains governanceControl");
  assert(fs.existsSync(path.join(outputDir, "scripts", "governance-core.js")), "generated team includes governance core");
  assert(fs.existsSync(path.join(outputDir, "scripts", "assess-governance.js")), "generated team includes governance assessor");

  const bypass = JSON.parse(JSON.stringify(initial));
  bypass.verificationLevel = "V4";
  bypass.verificationScopes.workflow = "V4";
  bypass.stages.forEach((stage) => { stage.status = "completed"; });
  bypass.governanceControl.completion.claim = "accepted";
  writeJson(statusPath, bypass);
  const bypassResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(bypassResult.status !== 0, "governance blocks an unsupported terminal claim");
  const bypassReport = JSON.parse(bypassResult.stdout);
  assert(
    ["ACTIVE_CONTRACT_REQUIRED", "REQUIRED_CHECKS_MISSING", "VERIFICATION_LEVEL_EXCEEDS_EVIDENCE", "HUMAN_APPROVAL_REQUIRED"]
      .every((code) => bypassReport.diagnostics.some((item) => item.code === code)),
    "governance reports contract, checks, verification, and approval gaps"
  );
  const bypassContractValidation = runNode(["scripts/validate-contracts.js"], { cwd: outputDir });
  assert(bypassContractValidation.status !== 0, "generated contract validation rejects a tampered terminal template");

  const valid = JSON.parse(JSON.stringify(initial));
  valid.workflow = valid.stages[0].workflowId;
  valid.verificationLevel = "V2";
  valid.verificationScopes.workflow = "V2";
  valid.stages.forEach((stage) => { stage.status = "completed"; });
  Object.assign(valid.governanceControl, {
    taskId: "task-1",
    authorizedActions: ["read", "run_verification", "deliver"],
    activeContractRevision: "contract-1",
    currentInvocationId: "invocation-1",
    contracts: [{
      revision: "contract-1",
      status: "confirmed",
      sourceRef: "decision:contract-1",
      checkIds: ["check-1"]
    }],
    checks: [{
      id: "check-1",
      required: true,
      minimumVerificationLevel: "V2",
      evidenceRunIds: ["run-1"]
    }],
    invocations: [{
      id: "invocation-1",
      operation: "start",
      allowedActions: ["read", "run_verification", "deliver"],
      authorizationRef: "user:implementation-request",
      previousInvocationId: null
    }],
    verificationRuns: [{
      id: "run-1",
      invocationId: "invocation-1",
      checkIds: ["check-1"],
      verificationLevel: "V2",
      result: {
        assertion: "pass",
        executed: 1,
        runner: { status: "passed", exitCode: 0 },
        wrapper: { status: "not_applicable", exitCode: null }
      },
      evidenceRefs: ["evidence:run-1"]
    }],
    approvals: [{
      id: "approval-1",
      contractRevision: "contract-1",
      role: valid.governanceControl.humanReviewPolicy.accountableRole,
      reviewerType: "human",
      reviewerId: "reviewer-1",
      status: "approved",
      evidenceRef: "approval:1",
      reviewedAt: "2026-09-20T10:00:00Z"
    }],
    completion: { claim: "accepted" }
  });
  writeJson(statusPath, valid);
  const accepted = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(accepted.status === 0, "governance accepts a fully evidenced terminal claim", accepted.stdout + accepted.stderr);

  for (const role of valid.rolePlan) {
    if (["delivery-manager", "risk-manager"].includes(role.role)) {
      role.mode = "active";
      role.stages = ["Input", "Risk Boundary"];
      role.reason = "Owns the selected workflow stage.";
    }
  }
  const workspaceDir = path.join(outputDir, "workspace", "validated-task");
  writeJson(path.join(workspaceDir, "workflow-status.json"), valid);
  writeText(path.join(workspaceDir, "research-brief.md"), "# Research brief\n\nEvidence: E-01\n");
  writeText(path.join(workspaceDir, "risk-register.md"), "# Risk register\n\nEvidence: E-01\n");
  writeText(path.join(workspaceDir, "evidence-index.md"), "# Evidence\n\n| ID | Source |\n| --- | --- |\n| E-01 | fixture |\n");
  const workspaceAccepted = runNode([
    "scripts/validate-workspace.js",
    "--status",
    "workspace/validated-task/workflow-status.json",
    "--require-ready",
    "--min-score",
    "90",
    "--json"
  ], { cwd: outputDir });
  assert(workspaceAccepted.status === 0, "workspace validation accepts a complete governed task", workspaceAccepted.stdout + workspaceAccepted.stderr);

  const invalidOwner = JSON.parse(JSON.stringify(valid));
  invalidOwner.rolePlan.find((role) => role.role === "risk-manager").mode = "not_applicable";
  invalidOwner.rolePlan.find((role) => role.role === "risk-manager").stages = [];
  writeJson(path.join(workspaceDir, "workflow-status.json"), invalidOwner);
  const invalidOwnerResult = runNode([
    "scripts/validate-workspace.js",
    "--status",
    "workspace/validated-task/workflow-status.json",
    "--json"
  ], { cwd: outputDir });
  assert(invalidOwnerResult.status !== 0, "workspace validation rejects a not_applicable stage owner");

  const missingOutcome = JSON.parse(JSON.stringify(valid));
  missingOutcome.verificationScopes.strategyOutcome = "V1";
  writeJson(path.join(workspaceDir, "workflow-status.json"), missingOutcome);
  const missingOutcomeResult = runNode([
    "scripts/validate-workspace.js",
    "--status",
    "workspace/validated-task/workflow-status.json",
    "--json"
  ], { cwd: outputDir });
  assert(missingOutcomeResult.status !== 0, "workspace validation rejects unsupported strategy outcome verification");

  writeJson(path.join(workspaceDir, "workflow-status.json"), valid);
  writeText(path.join(workspaceDir, "evidence", "raw.json"), "{\"value\":1}\n");
  writeText(
    path.join(workspaceDir, "evidence-index.md"),
    "# Evidence\n\n| ID | Source |\n| --- | --- |\n| E-01 | [fixture](evidence/raw.json) SHA-256 `0000000000000000000000000000000000000000000000000000000000000000` |\n"
  );
  const invalidDigestResult = runNode([
    "scripts/validate-workspace.js",
    "--status",
    "workspace/validated-task/workflow-status.json",
    "--json"
  ], { cwd: outputDir });
  assert(invalidDigestResult.status !== 0, "workspace validation rejects a mismatched evidence snapshot digest");

  writeJson(statusPath, valid);
  const zeroExecution = JSON.parse(JSON.stringify(valid));
  zeroExecution.governanceControl.verificationRuns[0].result.executed = 0;
  writeJson(statusPath, zeroExecution);
  const zeroResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(zeroResult.status !== 0, "governance rejects zero-execution evidence");

  const emptyEvidence = JSON.parse(JSON.stringify(valid));
  emptyEvidence.governanceControl.verificationRuns[0].evidenceRefs = [];
  writeJson(statusPath, emptyEvidence);
  const emptyEvidenceResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(emptyEvidenceResult.status !== 0, "governance rejects passing runs without evidence");

  const unapprovedRun = JSON.parse(JSON.stringify(valid));
  unapprovedRun.governanceControl.authorizedActions = ["read", "deliver"];
  unapprovedRun.governanceControl.invocations[0].allowedActions = ["read", "deliver"];
  writeJson(statusPath, unapprovedRun);
  const unapprovedRunResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(unapprovedRunResult.status !== 0, "governance rejects runs without verification authorization");

  const conflictingRuns = JSON.parse(JSON.stringify(valid));
  conflictingRuns.governanceControl.checks[0].evidenceRunIds.push("run-2");
  conflictingRuns.governanceControl.verificationRuns.push({
    id: "run-2",
    invocationId: "invocation-1",
    checkIds: ["check-1"],
    verificationLevel: "V2",
    result: {
      assertion: "fail",
      executed: 1,
      runner: { status: "passed", exitCode: 0 },
      wrapper: { status: "not_applicable", exitCode: null }
    },
    evidenceRefs: ["evidence:run-2"]
  });
  writeJson(statusPath, conflictingRuns);
  const conflictingRunsResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(conflictingRunsResult.status !== 0, "governance rejects conflicting evidence for a required check");

  const unauthorized = JSON.parse(JSON.stringify(valid));
  unauthorized.governanceControl.invocations[0].allowedActions.push("write_source");
  writeJson(statusPath, unauthorized);
  const unauthorizedResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(unauthorizedResult.status !== 0, "governance rejects invocation actions outside task authorization");

  const agentApproval = JSON.parse(JSON.stringify(valid));
  agentApproval.governanceControl.approvals[0].reviewerType = "agent";
  writeJson(statusPath, agentApproval);
  const agentApprovalResult = runNode([
    "scripts/assess-governance.js",
    "--status",
    "assets/templates/workflow-status.json",
    "--require-ready",
    "--json"
  ], { cwd: outputDir });
  assert(agentApprovalResult.status !== 0, "governance rejects Agent self-review as human approval");
}

function testExecutionAcceptanceRequiresObservedResults() {
  const dir = tmpDir("execution-acceptance");
  const { outputDir } = generateFixture(dir);
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, "generation-report.json"), "utf8"));
  const contracts = runNode([
    path.join(outputDir, "scripts", "run-acceptance-scenarios.js"),
    outputDir,
    "--mode",
    "contracts"
  ]);
  assert(contracts.status === 0, "acceptance contract validation remains available", contracts.stdout + contracts.stderr);

  const baseline = buildExecutionResults(outputDir, report);
  const passing = runExecutionAcceptance(outputDir, baseline);
  assert(passing.status === 0, "execution acceptance accepts complete observed results", passing.stdout + passing.stderr);

  const rejectedCases = [
    {
      label: "missing scenario run",
      mutate(results) { results.runs.pop(); }
    },
    {
      label: "zero executed assertions",
      mutate(results) { results.runs[0].result.executed = 0; }
    },
    {
      label: "failed runner",
      mutate(results) { results.runs[0].result.runner = { status: "failed", exitCode: 1 }; }
    },
    {
      label: "unknown wrapper",
      mutate(results) { results.runs[0].result.wrapper = { status: "unknown", exitCode: null }; }
    },
    {
      label: "incomplete role partition",
      mutate(results) {
        const rolePlan = results.runs[0].rolePlan;
        const populatedMode = ["notApplicable", "consulted", "active"]
          .find((mode) => rolePlan[mode].length > 0);
        rolePlan[populatedMode].pop();
      }
    },
    {
      label: "missing expected artifact",
      mutate(results) { results.runs[0].producedArtifacts.pop(); }
    },
    {
      label: "absolute artifact path",
      mutate(results) {
        results.runs[0].producedArtifacts[0].path = `/${results.runs[0].producedArtifacts[0].path}`;
      }
    },
    {
      label: "missing required gate",
      mutate(results) { results.runs[0].passedGates.pop(); }
    },
    {
      label: "missing failure assertion",
      mutate(results) { results.runs[0].failureAssertions.pop(); }
    },
    {
      label: "empty execution evidence",
      mutate(results) { results.runs[0].evidenceRefs = []; }
    },
    {
      label: "Agent approval presented as human approval",
      mutate(results) {
        results.runs[0].humanApproval.reviewerType = "agent";
      }
    }
  ];
  for (const rejected of rejectedCases) {
    const results = buildExecutionResults(outputDir, report);
    rejected.mutate(results);
    const outcome = runExecutionAcceptance(outputDir, results);
    assert(outcome.status !== 0, `execution acceptance rejects ${rejected.label}`);
  }

  const blockedClaim = buildExecutionResults(outputDir, report);
  const artifact = blockedClaim.runs[0].producedArtifacts[0];
  const blockedContent = report.riskControls.blockedClaims[0];
  writeText(path.join(outputDir, artifact.path), blockedContent);
  artifact.sha256 = sha256(blockedContent);
  const blockedResult = runExecutionAcceptance(outputDir, blockedClaim);
  assert(blockedResult.status !== 0, "execution acceptance rejects produced output containing a blocked claim");

  const extraBlockedClaim = buildExecutionResults(outputDir, report);
  const extraPath = path.posix.join("workspace", "acceptance", "extra-output.md");
  writeText(path.join(outputDir, extraPath), blockedContent);
  extraBlockedClaim.runs[0].producedArtifacts.push({
    artifact: "extra-output.md",
    path: extraPath,
    sha256: sha256(blockedContent)
  });
  const extraBlockedResult = runExecutionAcceptance(outputDir, extraBlockedClaim);
  assert(extraBlockedResult.status !== 0, "execution acceptance checks blocked claims in extra produced artifacts");
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
  testGeneratedFixtureRunnerCleansTemporaryDirectories();
  testGeneratedCommandContractCompatibility();
  testUnmatchedDomainPackFallsBackToDraft();
  testExternalSkillAdaptersBlockAGrade();
  testInvalidSpecCannotScoreA();
  testHighRiskWithoutHumanReviewIsRejected();
  testCandidateMemberMayNotOwnStaticStage();
  testAcceptanceRequiresParticipatingOwners();
  testVenturePackMatchesEntrepreneurGoal();
  testUnknownMedicalGoalUsesAssuranceAndHumanReview();
  testGeneratedStatusCarriesExecutionContract();
  testGeneratedGovernanceEnforcesReadiness();
  testExecutionAcceptanceRequiresObservedResults();
  testSkillAuditIsStaticAndSupportsBatchRoots();
  testSkillAuditChecksTeamRoleActivation();
  console.log("\nAll release regression checks passed.");
}

if (require.main === module) main();
