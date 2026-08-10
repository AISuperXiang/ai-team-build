#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const TEXT_EXTENSIONS = new Set([".md", ".json", ".js"]);
const REQUIRED_GENERATED_FILES = [
  "SKILL.md",
  "README.md",
  "README_EN.md",
  "evaluation-report.md",
  "generation-report.json",
  "docs/acceptance-scenarios.md",
  "docs/quality-gates.md",
  "docs/quality-rubrics.md",
  "docs/team-operating-model.md",
  "docs/execution-methodology.md",
  "docs/verification-methodology.md",
  "docs/integrations/data-contracts.md",
  "assets/templates/decision-log.md",
  "assets/templates/risk-register.md",
  "assets/templates/role-handoff.md",
  "assets/templates/evidence-index.md",
  "assets/templates/delivery-summary.md"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const raw = String(value || "").trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  const normalized = path.posix.normalize(raw);
  if (!raw ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized)) {
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

function existsFile(root, relativePath) {
  const resolved = resolveInside(root, relativePath);
  return Boolean(resolved && fs.existsSync(resolved.absolutePath) && fs.statSync(resolved.absolutePath).isFile());
}

function readText(root, relativePath) {
  const resolved = resolveInside(root, relativePath);
  if (!resolved || !fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) return "";
  return fs.readFileSync(resolved.absolutePath, "utf8");
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
  const candidates = artifactCandidates(artifact);
  for (const candidate of candidates) {
    if (!plannedFiles.has(candidate)) continue;
    if (existsFile(root, candidate)) return candidate;
  }
  return null;
}

function record(results, ok, message) {
  results.push({ ok, message });
}

function run(root) {
  const reportPath = path.join(root, "generation-report.json");
  const report = readJson(reportPath);
  const scenarios = report.acceptanceScenarios || [];
  const riskControls = report.riskControls || {};
  const teamContract = report.teamContract || {};
  const memberIds = new Set(teamContract.memberIds || []);
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
  record(results, workflows.size > 0, "generation-report has workflow contract");
  record(results, report.verification && report.verification.factoryVerificationLevel === "V2", "factory contract verification is V2");
  record(results, report.verification && report.verification.generatedTeamVerificationLevel === "V0", "new generated team remains V0 before domain execution");

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
      record(results, Boolean(scenario.expectedRolePlan), `scenario ${scenario.id} has expectedRolePlan`);
      const seenRoles = new Set();
      for (const [mode, roles] of Object.entries((scenario.expectedRolePlan || {}))) {
        record(results, ["active", "consulted", "notApplicable"].includes(mode), `scenario ${scenario.id} role mode is valid: ${mode}`);
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

function main() {
  const root = path.resolve(process.cwd(), process.argv[2] || ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`Generated skill path is not a directory: ${root}`);
    process.exit(1);
  }

  const results = run(root);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} acceptance scenario check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} acceptance scenario checks passed.`);
}

if (require.main === module) main();

module.exports = {
  run
};
