#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { LEVELS, resultSupportsPass } = require("./governance-core");
const generatedArtifacts = require("./generated-artifacts");

const TEXT_EXTENSIONS = new Set([".md", ".json", ".js"]);
const MAX_RESULTS_BYTES = 256 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const REQUIRED_GENERATED_FILES = [
  "SKILL.md",
  "README.md",
  "README_EN.md",
  "evaluation-report.md",
  "team-spec.snapshot.json",
  "generation-manifest.json",
  "generation-report.json",
  "docs/acceptance-scenarios.md",
  "docs/quality-gates.md",
  "docs/quality-rubrics.md",
  "docs/team-operating-model.md",
  "docs/execution-methodology.md",
  "docs/verification-methodology.md",
  "docs/feedback-loop.md",
  "docs/integrations/data-contracts.md",
  "assets/templates/workflow-status.json",
  "assets/templates/acceptance-results.json",
  "assets/templates/iteration-feedback.json",
  "assets/templates/decision-log.md",
  "assets/templates/risk-register.md",
  "assets/templates/role-handoff.md",
  "assets/templates/evidence-index.md",
  "assets/templates/delivery-summary.md",
  "scripts/generated-artifacts.js",
  "scripts/summarize-feedback.js",
  "schemas/feedback.schema.json",
  "test/governance-core.test.js"
];

class CliError extends Error {}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", "coverage"].includes(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, files);
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

function allText(root) {
  return collectFiles(root)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

function normalizeRelativePath(value) {
  const raw = String(value || "").trim();
  if (!raw ||
      raw.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(raw) ||
      path.posix.isAbsolute(raw)) {
    return null;
  }
  const relative = raw.startsWith("./") ? raw.slice(2) : raw;
  const normalized = path.posix.normalize(relative);
  if (!relative ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === "..") {
    return null;
  }
  return normalized;
}

function resolveInside(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return null;
  const absolutePath = path.resolve(root, normalized);
  const relativeFromRoot = path.relative(root, absolutePath);
  if (!relativeFromRoot || relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) return null;
  return { normalized, absolutePath };
}

function resolveRegularFile(root, relativePath, maxBytes = MAX_ARTIFACT_BYTES) {
  const resolved = resolveInside(root, relativePath);
  if (!resolved || !fs.existsSync(resolved.absolutePath)) return null;
  const stat = fs.lstatSync(resolved.absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return null;
  const rootReal = fs.realpathSync(root);
  const fileReal = fs.realpathSync(resolved.absolutePath);
  const relativeReal = path.relative(rootReal, fileReal);
  if (!relativeReal || relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) return null;
  return { ...resolved, size: stat.size };
}

function existsFile(root, relativePath) {
  return Boolean(resolveRegularFile(root, relativePath));
}

function readText(root, relativePath) {
  const resolved = resolveRegularFile(root, relativePath);
  return resolved ? fs.readFileSync(resolved.absolutePath, "utf8") : "";
}

function readSafeJson(root, relativePath) {
  const resolved = resolveRegularFile(root, relativePath, MAX_RESULTS_BYTES);
  if (!resolved) throw new CliError("--results must reference a regular JSON file inside the generated skill");
  try {
    return readJson(resolved.absolutePath);
  } catch {
    throw new CliError("--results must contain valid JSON");
  }
}

function hasHollowContent(content) {
  const templateOpen = ["{", "{"].join("");
  const templateClose = ["}", "}"].join("");
  return content.includes(templateOpen) ||
    content.includes(templateClose) ||
    content.includes("待执行时按当前团队上下文补齐") ||
    content.includes("尚未声明") ||
    /(^|\n)-\s*(\n|$)/.test(content);
}

function artifactCandidates(artifact) {
  const normalized = normalizeRelativePath(artifact);
  if (!normalized) return [];
  return [...new Set([
    normalized,
    path.posix.join("assets/templates", normalized),
    path.posix.join("docs", normalized),
    path.posix.join("workspace", normalized)
  ])];
}

function resolveExpectedArtifact(root, plannedFiles, artifact) {
  for (const candidate of artifactCandidates(artifact)) {
    if (plannedFiles.has(candidate) && existsFile(root, candidate)) return candidate;
  }
  return null;
}

function record(results, ok, message) {
  results.push({ ok: Boolean(ok), message });
}

function uniqueStrings(value) {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0) &&
    new Set(value).size === value.length;
}

function sameStringSet(left, right) {
  return uniqueStrings(left) &&
    uniqueStrings(right) &&
    left.length === right.length &&
    left.every((item) => right.includes(item));
}

function rolePlanRoles(rolePlan) {
  if (!rolePlan || typeof rolePlan !== "object" || Array.isArray(rolePlan)) return [];
  return [
    ...(rolePlan.active || []),
    ...(rolePlan.consulted || []),
    ...(rolePlan.notApplicable || [])
  ];
}

function validateExpectedRolePlan(
  results,
  scenario,
  memberIds,
  expectedWorkflow,
  roleContracts,
  accountableRole,
  strictOwnership
) {
  const rolePlan = scenario.expectedRolePlan;
  record(results, Boolean(rolePlan), `scenario ${scenario.id} has expectedRolePlan`);
  const seenRoles = new Set();
  for (const mode of ["active", "consulted", "notApplicable"]) {
    const roles = rolePlan && rolePlan[mode];
    record(results, Array.isArray(roles), `scenario ${scenario.id} ${mode} roles is an array`);
    for (const role of roles || []) {
      record(results, memberIds.has(role), `scenario ${scenario.id} ${mode} role exists: ${role}`);
      record(results, !seenRoles.has(role), `scenario ${scenario.id} role has one expected mode: ${role}`);
      seenRoles.add(role);
      if (["active", "consulted"].includes(mode) && expectedWorkflow) {
        record(
          results,
          (expectedWorkflow.candidateMembers || []).includes(role),
          `scenario ${scenario.id} participating role is a candidate in expected workflow: ${role}`
        );
      }
    }
  }
  record(
    results,
    seenRoles.size === memberIds.size && [...memberIds].every((role) => seenRoles.has(role)),
    `scenario ${scenario.id} expectedRolePlan partitions every declared member`
  );
  const participating = new Set([
    ...((rolePlan && rolePlan.active) || []),
    ...((rolePlan && rolePlan.consulted) || [])
  ]);
  if (strictOwnership) {
    for (const output of scenario.expectedOutputs || []) {
      const outputId = path.posix.basename(output, path.posix.extname(output));
      const owners = roleContracts
        .filter((contract) => (contract.primaryOutputs || []).includes(outputId))
        .map((contract) => contract.id);
      record(results, owners.length > 0, `scenario ${scenario.id} expected output has a declared owner: ${output}`);
      record(
        results,
        owners.some((owner) => participating.has(owner)),
        `scenario ${scenario.id} expected output has a participating owner: ${output}`
      );
    }
    for (const gate of scenario.mustPassGates || []) {
      const owners = roleContracts
        .filter((contract) => (contract.qualityGates || []).includes(gate))
        .map((contract) => contract.id);
      if (gate === "human-review-gate" && accountableRole) owners.push(accountableRole);
      if (owners.length === 0) continue;
      record(
        results,
        owners.some((owner) => participating.has(owner)),
        `scenario ${scenario.id} required gate has a participating owner: ${gate}`
      );
    }
  }
}

function runContractChecks(root) {
  const report = readJson(path.join(root, "generation-report.json"));
  const scenarios = report.acceptanceScenarios || [];
  const riskControls = report.riskControls || {};
  const teamContract = report.teamContract || {};
  const memberIds = new Set(teamContract.memberIds || []);
  const roleContracts = Array.isArray(teamContract.roleContracts) ? teamContract.roleContracts : [];
  const workflows = new Map((teamContract.workflows || []).map((workflow) => [workflow.id, workflow]));
  const executionProfiles = new Set(teamContract.executionProfiles || []);
  const verificationLevels = new Set(teamContract.verificationLevels || []);
  const plannedFiles = new Set((report.plannedFiles || []).map(normalizeRelativePath).filter(Boolean));
  const text = allText(root);
  const acceptanceDoc = readText(root, "docs/acceptance-scenarios.md");
  const qualityGatesDoc = readText(root, "docs/quality-gates.md");
  const qualityRubricsDoc = readText(root, "docs/quality-rubrics.md");
  const skillDoc = readText(root, "SKILL.md");
  const results = [];

  record(results, report.generator === "ai-team-build", "generation-report was produced by ai-team-build");
  record(results, /^\d+\.\d+\.\d+$/.test(String(report.generatorVersion || "")), "generation-report has semantic generator version");
  record(results, report.specSnapshot === generatedArtifacts.SPEC_SNAPSHOT_FILE, "generation-report records spec snapshot");
  record(results, report.managedManifest === generatedArtifacts.MANIFEST_FILE, "generation-report records managed manifest");
  record(results, report.evaluation && report.evaluation.scoreType === "blueprint-contract", "evaluation score is explicitly blueprint-only");
  record(results, report.evaluation && report.evaluation.runtimeScore === null, "evaluation does not fabricate runtime score");
  record(results, report.evaluation && report.evaluation.outcomeScore === null, "evaluation does not fabricate outcome score");
  record(results, Array.isArray(report.plannedFiles) && report.plannedFiles.length > 0, "generation-report has planned files");
  record(results, plannedFiles.size === (report.plannedFiles || []).length, "all planned files use safe relative paths");
  for (const requiredFile of REQUIRED_GENERATED_FILES) {
    record(results, plannedFiles.has(requiredFile), `planned files include required file: ${requiredFile}`);
    record(results, existsFile(root, requiredFile), `required generated file exists: ${requiredFile}`);
  }
  for (const plannedFile of plannedFiles) {
    record(results, existsFile(root, plannedFile), `planned file exists: ${plannedFile}`);
  }
  record(results, report.counts && report.counts.acceptanceScenarios === scenarios.length, "acceptance scenario count matches generation-report counts");
  record(results, report.counts && report.counts.dataContracts > 0, "generation-report has data contracts");
  record(results, report.counts && report.counts.capabilities > 0, "generation-report has capability matrix entries");
  record(results, scenarios.length > 0, "generation-report has acceptance scenarios");
  record(results, Boolean(report.teamDesign && report.teamDesign.problemStatement), "generation-report has problem and value blueprint");
  record(results, Boolean(report.governance && report.governance.defaultExecutionProfile), "generation-report has governance model");
  record(results, memberIds.size > 0, "generation-report has team member contract");
  record(
    results,
    roleContracts.length === memberIds.size,
    "generation-report has role output and gate ownership contracts"
  );
  record(results, workflows.size > 0, "generation-report has workflow contract");
  record(results, report.verification && report.verification.factoryVerificationLevel === "V2", "factory contract verification is V2");
  record(results, report.verification && report.verification.generatedTeamVerificationLevel === "V0", "new generated team remains V0 before domain execution");
  record(results, report.verification && report.verification.governanceContractVersion === "1.0", "generation-report records governance contract version");
  record(
    results,
    report.verification && sameStringSet(report.verification.acceptanceModes, ["contracts", "execution"]),
    "generation-report declares separate acceptance modes"
  );
  try {
    const manifest = generatedArtifacts.readManifest(root, report.skill && report.skill.id);
    record(results, manifest.specDigest === report.specDigest, "managed manifest matches spec digest");
    for (const item of generatedArtifacts.inspectManagedFiles(root, manifest)) {
      record(results, item.status === "unchanged", `managed file matches manifest: ${item.path}`);
    }
  } catch (error) {
    record(results, false, `managed manifest is valid: ${error.message}`);
  }

  for (const scenario of scenarios) {
    record(results, Boolean(scenario.id), `scenario has id: ${scenario.id || "unknown"}`);
    record(results, Boolean(scenario.input), `scenario ${scenario.id} has input`);
    record(results, acceptanceDoc.includes(`## ${scenario.id}`), `scenario ${scenario.id} is documented in acceptance-scenarios.md`);
    record(results, acceptanceDoc.includes(scenario.input), `scenario ${scenario.id} input is documented`);
    record(results, Array.isArray(scenario.expectedOutputs) && scenario.expectedOutputs.length > 0, `scenario ${scenario.id} has expected outputs`);
    record(results, Array.isArray(scenario.mustPassGates) && scenario.mustPassGates.length > 0, `scenario ${scenario.id} has required gates`);
    record(results, Array.isArray(scenario.failureExamples) && scenario.failureExamples.length > 0, `scenario ${scenario.id} has failure examples`);
    const requiresExecutionContract = report.evaluation && report.evaluation.grade === "A";
    if (requiresExecutionContract || scenario.expectedWorkflow !== undefined) {
      const expectedWorkflow = workflows.get(scenario.expectedWorkflow);
      record(results, Boolean(expectedWorkflow), `scenario ${scenario.id} expectedWorkflow references generated workflow`);
      record(results, executionProfiles.has(scenario.expectedProfile), `scenario ${scenario.id} expectedProfile is valid`);
      record(results, verificationLevels.has(scenario.minimumVerificationLevel), `scenario ${scenario.id} minimumVerificationLevel is valid`);
      validateExpectedRolePlan(
        results,
        scenario,
        memberIds,
        expectedWorkflow,
        roleContracts,
        report.governance && report.governance.humanReview
          ? report.governance.humanReview.accountableRole
          : "",
        (scenario.mustPassGates || []).includes("human-review-gate")
      );
      record(results, acceptanceDoc.includes(scenario.expectedWorkflow || ""), `scenario ${scenario.id} expectedWorkflow is documented`);
      record(results, acceptanceDoc.includes(scenario.expectedProfile || ""), `scenario ${scenario.id} expectedProfile is documented`);
      record(results, acceptanceDoc.includes(scenario.minimumVerificationLevel || ""), `scenario ${scenario.id} minimum verification is documented`);
    }
    for (const artifact of scenario.expectedOutputs || []) {
      const normalized = normalizeRelativePath(artifact);
      const resolvedArtifact = normalized ? resolveExpectedArtifact(root, plannedFiles, artifact) : null;
      const content = resolvedArtifact ? readText(root, resolvedArtifact) : "";
      record(results, Boolean(normalized), `scenario ${scenario.id} expected artifact path is safe: ${artifact}`);
      record(results, Boolean(resolvedArtifact), `scenario ${scenario.id} expected artifact exists in planned files: ${artifact}`);
      record(results, Boolean(resolvedArtifact && !hasHollowContent(content)), `scenario ${scenario.id} expected artifact has concrete content: ${resolvedArtifact || artifact}`);
      record(results, acceptanceDoc.includes(artifact), `scenario ${scenario.id} expected artifact is documented: ${artifact}`);
    }
    for (const gate of scenario.mustPassGates || []) {
      record(results, qualityGatesDoc.includes(gate), `scenario ${scenario.id} required gate is documented in quality-gates.md: ${gate}`);
      record(results, acceptanceDoc.includes(gate), `scenario ${scenario.id} required gate is tied to acceptance scenario: ${gate}`);
    }
    for (const failureExample of scenario.failureExamples || []) {
      record(results, acceptanceDoc.includes(failureExample), `scenario ${scenario.id} failure example is documented in acceptance-scenarios.md: ${failureExample}`);
    }
  }

  for (const disclaimer of riskControls.requiredDisclaimers || []) {
    record(results, skillDoc.includes(disclaimer), `risk disclaimer is documented in SKILL.md: ${disclaimer}`);
    record(results, qualityGatesDoc.includes(disclaimer) || qualityRubricsDoc.includes(disclaimer), `risk disclaimer is documented in quality docs: ${disclaimer}`);
  }
  for (const blockedClaim of riskControls.blockedClaims || []) {
    record(results, skillDoc.includes(blockedClaim), `blocked claim is documented in SKILL.md: ${blockedClaim}`);
    record(results, qualityGatesDoc.includes(blockedClaim) || qualityRubricsDoc.includes(blockedClaim), `blocked claim is documented in quality docs: ${blockedClaim}`);
  }
  for (const evidenceRule of riskControls.evidenceRules || []) {
    record(results, qualityGatesDoc.includes(evidenceRule) || qualityRubricsDoc.includes(evidenceRule), `evidence rule is documented in quality docs: ${evidenceRule}`);
    record(results, text.includes(evidenceRule), `evidence rule appears in generated text corpus: ${evidenceRule}`);
  }
  return results;
}

function runExecutionChecks(root, resultsPath) {
  const report = readJson(path.join(root, "generation-report.json"));
  const envelope = readSafeJson(root, resultsPath);
  const scenarios = report.acceptanceScenarios || [];
  const scenarioIndex = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const runs = Array.isArray(envelope.runs) ? envelope.runs : [];
  const memberIds = new Set((report.teamContract && report.teamContract.memberIds) || []);
  const results = [];

  record(results, envelope.schemaVersion === "1.0", "execution results use schemaVersion 1.0");
  record(results, envelope.skillId === report.skill.id, "execution results match generated skill id");
  record(results, envelope.generatorVersion === report.generatorVersion, "execution results match generator version");
  record(results, Array.isArray(envelope.runs), "execution results contain runs");
  record(results, runs.length === scenarios.length, "every declared scenario has exactly one execution run");

  const runCounts = new Map();
  for (const run of runs) {
    const count = (runCounts.get(run && run.scenarioId) || 0) + 1;
    runCounts.set(run && run.scenarioId, count);
    record(results, scenarioIndex.has(run && run.scenarioId), `execution run references a declared scenario: ${(run && run.scenarioId) || "unknown"}`);
  }
  for (const scenario of scenarios) {
    record(results, runCounts.get(scenario.id) === 1, `scenario ${scenario.id} has one execution run`);
    const run = runs.find((item) => item && item.scenarioId === scenario.id);
    if (!run) continue;

    record(results, run.inputDigest === sha256(scenario.input), `scenario ${scenario.id} input digest matches`);
    record(results, run.workflow === scenario.expectedWorkflow, `scenario ${scenario.id} workflow matches`);
    record(results, run.executionProfile === scenario.expectedProfile, `scenario ${scenario.id} execution profile matches`);
    record(results, LEVELS.includes(run.verificationLevel), `scenario ${scenario.id} verification level is valid`);
    record(
      results,
      LEVELS.indexOf(run.verificationLevel) >= LEVELS.indexOf(scenario.minimumVerificationLevel),
      `scenario ${scenario.id} meets minimum verification level`
    );
    for (const mode of ["active", "consulted", "notApplicable"]) {
      record(
        results,
        sameStringSet((run.rolePlan && run.rolePlan[mode]) || [], (scenario.expectedRolePlan && scenario.expectedRolePlan[mode]) || []),
        `scenario ${scenario.id} ${mode} role plan matches`
      );
    }
    record(
      results,
      sameStringSet(rolePlanRoles(run.rolePlan), [...memberIds]),
      `scenario ${scenario.id} execution role plan partitions every declared member`
    );

    const artifacts = Array.isArray(run.producedArtifacts) ? run.producedArtifacts : [];
    record(results, Array.isArray(run.producedArtifacts), `scenario ${scenario.id} has producedArtifacts`);
    const artifactIndex = new Map();
    const artifactPaths = new Set();
    const producedContents = [];
    for (const artifact of artifacts) {
      const artifactName = artifact && artifact.artifact;
      const validName = typeof artifactName === "string" && artifactName.trim().length > 0;
      record(results, validName, `scenario ${scenario.id} produced artifact has a name`);
      if (!validName) continue;
      record(results, !artifactIndex.has(artifactName), `scenario ${scenario.id} produced artifact is unique: ${artifactName}`);
      artifactIndex.set(artifactName, artifact);

      const normalized = normalizeRelativePath(artifact.path);
      record(results, Boolean(normalized && normalized.startsWith("workspace/")), `scenario ${scenario.id} artifact is inside workspace: ${artifactName}`);
      if (normalized) {
        record(results, !artifactPaths.has(normalized), `scenario ${scenario.id} artifact path is unique: ${artifactName}`);
        artifactPaths.add(normalized);
      }
      const resolved = normalized ? resolveRegularFile(root, normalized) : null;
      record(results, Boolean(resolved), `scenario ${scenario.id} artifact is a bounded regular file: ${artifactName}`);
      if (!resolved) continue;
      const content = fs.readFileSync(resolved.absolutePath);
      producedContents.push(content.toString("utf8"));
      record(results, content.length > 0, `scenario ${scenario.id} artifact is non-empty: ${artifactName}`);
      record(results, artifact.sha256 === sha256(content), `scenario ${scenario.id} artifact digest matches: ${artifactName}`);
    }
    for (const expected of scenario.expectedOutputs || []) {
      const artifact = artifactIndex.get(expected);
      record(results, Boolean(artifact), `scenario ${scenario.id} produced expected artifact: ${expected}`);
    }

    record(results, uniqueStrings(run.passedGates), `scenario ${scenario.id} passedGates are unique strings`);
    for (const gate of scenario.mustPassGates || []) {
      record(results, run.passedGates && run.passedGates.includes(gate), `scenario ${scenario.id} passed required gate: ${gate}`);
    }
    if ((scenario.mustPassGates || []).includes("human-review-gate")) {
      const approval = run.humanApproval;
      record(
        results,
        Boolean(
          approval &&
          approval.reviewerType === "human" &&
          typeof approval.reviewerId === "string" &&
          approval.reviewerId.trim().length > 0 &&
          typeof approval.evidenceRef === "string" &&
          approval.evidenceRef.trim().length > 0 &&
          typeof approval.reviewedAt === "string" &&
          !Number.isNaN(Date.parse(approval.reviewedAt))
        ),
        `scenario ${scenario.id} has verifiable human approval`
      );
    }
    const failureAssertions = Array.isArray(run.failureAssertions) ? run.failureAssertions : [];
    for (const failureExample of scenario.failureExamples || []) {
      const matches = failureAssertions.filter((item) => item && item.example === failureExample);
      record(results, matches.length === 1, `scenario ${scenario.id} has one assertion for failure example: ${failureExample}`);
      if (matches.length === 1) {
        record(results, matches[0].observed === false, `scenario ${scenario.id} did not observe failure example: ${failureExample}`);
        record(
          results,
          typeof matches[0].evidenceRef === "string" && matches[0].evidenceRef.trim().length > 0,
          `scenario ${scenario.id} failure assertion has evidence: ${failureExample}`
        );
      }
    }
    record(results, resultSupportsPass(run.result), `scenario ${scenario.id} has a trustworthy passing result envelope`);
    record(
      results,
      uniqueStrings(run.evidenceRefs) && run.evidenceRefs.length > 0,
      `scenario ${scenario.id} has execution evidence references`
    );

    const combinedOutput = producedContents.join("\n");
    for (const blockedClaim of (report.riskControls && report.riskControls.blockedClaims) || []) {
      record(results, !combinedOutput.includes(blockedClaim), `scenario ${scenario.id} output omits blocked claim: ${blockedClaim}`);
    }
    if (report.riskControls && report.riskControls.domainRiskLevel === "high") {
      for (const disclaimer of report.riskControls.requiredDisclaimers || []) {
        record(results, combinedOutput.includes(disclaimer), `scenario ${scenario.id} output includes required disclaimer: ${disclaimer}`);
      }
    }
  }
  return results;
}

function parseArgs(argv) {
  const options = { root: ".", mode: "contracts", json: false };
  const seen = new Set();
  let rootSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (rootSeen) throw new CliError(`Unexpected positional argument: ${arg}`);
      options.root = arg;
      rootSeen = true;
      continue;
    }
    if (!["--mode", "--results", "--json"].includes(arg)) throw new CliError(`Unknown argument: ${arg}`);
    if (seen.has(arg)) throw new CliError(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CliError(`${arg} requires a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!["contracts", "execution"].includes(options.mode)) throw new CliError("--mode must be contracts or execution");
  if (options.mode === "execution" && !options.results) throw new CliError("--results is required in execution mode");
  if (options.mode === "contracts" && options.results) throw new CliError("--results is only valid in execution mode");
  return options;
}

function buildEnvelope(mode, checks, declaredScenarios) {
  const failed = checks.filter((item) => !item.ok);
  return {
    schemaVersion: "1.0",
    kind: "ai-team-build.acceptance-assessment",
    mode,
    status: failed.length === 0 ? "passed" : "failed",
    claim: {
      scope: mode === "contracts" ? "generated-contracts" : "scenario-execution",
      executionObserved: mode === "execution",
      businessOutcomeVerified: false
    },
    summary: {
      declaredScenarios,
      checks: checks.length,
      failedChecks: failed.length
    },
    checks,
    limitations: mode === "contracts"
      ? ["No domain scenario was executed."]
      : ["Scenario execution evidence does not by itself prove production outcomes."]
  };
}

function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(process.cwd(), options.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new CliError(`Generated skill path is not a directory: ${root}`);
  }
  const report = readJson(path.join(root, "generation-report.json"));
  const checks = options.mode === "contracts"
    ? runContractChecks(root)
    : runExecutionChecks(root, options.results);
  const envelope = buildEnvelope(options.mode, checks, (report.acceptanceScenarios || []).length);
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
    if (envelope.status === "passed") {
      console.log(`\nAll ${checks.length} ${options.mode} acceptance checks passed.`);
    } else {
      console.error(`\n${envelope.summary.failedChecks} ${options.mode} acceptance check(s) failed.`);
    }
  }
  if (envelope.status !== "passed") process.exitCode = 1;
}

try {
  if (require.main === module) main(process.argv.slice(2));
} catch (error) {
  if (require.main === module) {
    const output = {
      schemaVersion: "1.0",
      kind: "ai-team-build.acceptance-assessment",
      mode: "unknown",
      status: "failed",
      claim: { scope: "unknown", executionObserved: false, businessOutcomeVerified: false },
      summary: { declaredScenarios: 0, checks: 0, failedChecks: 1 },
      checks: [{ ok: false, message: error.message }],
      limitations: ["Acceptance input could not be evaluated."]
    };
    if (process.argv.includes("--json")) console.log(JSON.stringify(output));
    else console.error(error.message);
    process.exitCode = error instanceof CliError ? 2 : 1;
  } else {
    throw error;
  }
}

module.exports = {
  run: runContractChecks,
  runContractChecks,
  runExecutionChecks
};
