#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { assessGovernanceState } = require("./governance-core");

const MAX_FILE_BYTES = 4 * 1024 * 1024;

class CliError extends Error {}

function parseArgs(argv) {
  const options = { json: false, requireReady: false, minScore: 0 };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--status", "--json", "--require-ready", "--min-score"].includes(arg)) {
      throw new CliError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) throw new CliError(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--require-ready") {
      options.requireReady = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CliError(`${arg} requires a value`);
    if (arg === "--status") options.status = value;
    if (arg === "--min-score") options.minScore = Number(value);
    index += 1;
  }
  if (!options.status) throw new CliError("--status is required");
  if (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 100) {
    throw new CliError("--min-score must be between 0 and 100");
  }
  return options;
}

function resolveRegularFile(root, relativePath) {
  const raw = String(relativePath || "").trim();
  if (!raw || raw.includes("\\") || path.isAbsolute(raw) || raw.split("/").includes("..")) return null;
  const rootReal = fs.realpathSync(root);
  const candidate = path.resolve(rootReal, raw);
  if (!fs.existsSync(candidate)) return null;
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) return null;
  const fileReal = fs.realpathSync(candidate);
  const relative = path.relative(rootReal, fileReal);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return { absolutePath: fileReal, relativePath: relative };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new CliError(`Invalid JSON: ${filePath}`);
  }
}

function addDiagnostic(diagnostics, code, detail, penalty, blocking = true) {
  diagnostics.push({ code, detail, penalty, blocking });
}

function extractEvidenceIds(content) {
  const ids = new Set();
  const pattern = /^\|\s*([A-Za-z]+-[A-Za-z0-9-]+)\s*\|/gm;
  for (const match of content.matchAll(pattern)) {
    if (!/^[-:]+$/.test(match[1])) ids.add(match[1]);
  }
  return ids;
}

function extractEvidenceRows(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Za-z]+-[A-Za-z0-9-]+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      const link = (cells[1] || "").match(/\[[^\]]+\]\(([^)]+)\)/);
      const digest = line.match(/SHA-256\s+`([a-f0-9]{64})`/i);
      return {
        id: cells[0],
        source: link ? link[1] : "",
        sha256: digest ? digest[1].toLowerCase() : ""
      };
    });
}

function validateWorkspace(root, statusRelativePath) {
  const diagnostics = [];
  const statusFile = resolveRegularFile(root, statusRelativePath);
  if (!statusFile) throw new CliError("--status must reference a bounded regular file inside the skill");
  const status = readJson(statusFile.absolutePath);
  const report = readJson(path.join(root, "generation-report.json"));
  const workspaceDir = path.dirname(statusFile.absolutePath);
  const memberIds = new Set((report.teamContract && report.teamContract.memberIds) || []);
  const terminal = ["accepted", "analysis_complete"].includes(
    status.governanceControl &&
    status.governanceControl.completion &&
    status.governanceControl.completion.claim
  );

  const governance = assessGovernanceState(status);
  for (const item of governance.diagnostics) {
    addDiagnostic(
      diagnostics,
      `GOVERNANCE_${item.code}`,
      item.detail,
      item.blocking ? 4 : 1,
      item.blocking
    );
  }

  const rolePlan = Array.isArray(status.rolePlan) ? status.rolePlan : [];
  const roleIndex = new Map();
  for (const role of rolePlan) {
    if (!role || typeof role.role !== "string") continue;
    if (roleIndex.has(role.role)) {
      addDiagnostic(diagnostics, "DUPLICATE_ROLE", `rolePlan duplicates ${role.role}`, 8);
    }
    roleIndex.set(role.role, role);
    if (role.mode === "not_applicable" && Array.isArray(role.stages) && role.stages.length > 0) {
      addDiagnostic(diagnostics, "N_A_ROLE_HAS_STAGES", `${role.role} is not_applicable but has stages`, 5);
    }
  }
  for (const memberId of memberIds) {
    if (!roleIndex.has(memberId)) {
      addDiagnostic(diagnostics, "ROLE_MISSING", `rolePlan does not cover ${memberId}`, 8);
    }
  }
  for (const roleId of roleIndex.keys()) {
    if (!memberIds.has(roleId)) {
      addDiagnostic(diagnostics, "ROLE_UNKNOWN", `rolePlan references unknown role ${roleId}`, 8);
    }
  }

  const evidenceIndexPath = path.join(workspaceDir, "evidence-index.md");
  const evidenceContent = fs.existsSync(evidenceIndexPath)
    ? fs.readFileSync(evidenceIndexPath, "utf8")
    : "";
  const evidenceIds = extractEvidenceIds(evidenceContent);
  const evidenceRows = extractEvidenceRows(evidenceContent);
  if (terminal && evidenceIds.size === 0) {
    addDiagnostic(diagnostics, "EVIDENCE_INDEX_MISSING", "terminal research workspace requires evidence-index.md with IDs", 15);
  }
  for (const evidence of evidenceRows) {
    if (!evidence.source || /^https?:\/\//i.test(evidence.source)) continue;
    const relativeSnapshot = path.relative(root, path.resolve(workspaceDir, evidence.source));
    const snapshot = resolveRegularFile(root, relativeSnapshot);
    if (!snapshot) {
      addDiagnostic(diagnostics, "EVIDENCE_SNAPSHOT_MISSING", `${evidence.id} snapshot is missing or unsafe`, 6);
      continue;
    }
    if (!evidence.sha256) {
      addDiagnostic(diagnostics, "EVIDENCE_DIGEST_MISSING", `${evidence.id} local snapshot has no SHA-256`, 2, false);
      continue;
    }
    const actualDigest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(snapshot.absolutePath))
      .digest("hex");
    if (actualDigest !== evidence.sha256) {
      addDiagnostic(diagnostics, "EVIDENCE_DIGEST_MISMATCH", `${evidence.id} snapshot SHA-256 does not match`, 10);
    }
  }

  const stages = Array.isArray(status.stages) ? status.stages : [];
  for (const stage of stages) {
    const selected = !stage.workflowId || stage.workflowId === status.workflow;
    if (!selected) continue;
    const owner = roleIndex.get(stage.owner);
    if (!owner) {
      addDiagnostic(diagnostics, "STAGE_OWNER_UNKNOWN", `${stage.name} owner ${stage.owner} is not in rolePlan`, 6);
    } else if (terminal && owner.mode === "not_applicable") {
      addDiagnostic(diagnostics, "STAGE_OWNER_NOT_APPLICABLE", `${stage.name} owner ${stage.owner} is not_applicable`, 8);
    }
    if (terminal && stage.status !== "completed") {
      addDiagnostic(diagnostics, "STAGE_INCOMPLETE", `${stage.name} is ${stage.status}`, 5);
    }
    if (stage.status !== "completed") continue;
    for (const artifact of stage.artifacts || []) {
      const relativeArtifact = path.relative(root, path.join(workspaceDir, artifact));
      const resolved = resolveRegularFile(root, relativeArtifact);
      if (!resolved || fs.statSync(resolved.absolutePath).size === 0) {
        addDiagnostic(diagnostics, "ARTIFACT_MISSING", `${stage.name} artifact is missing or empty: ${artifact}`, 5);
      }
    }
    for (const evidenceId of stage.evidence || []) {
      if (!evidenceIds.has(evidenceId)) {
        addDiagnostic(diagnostics, "EVIDENCE_UNDEFINED", `${stage.name} references undefined evidence ${evidenceId}`, 4);
      }
    }
  }

  const scopes = status.verificationScopes || {};
  if (terminal && scopes.strategyOutcome !== "V0" && !fs.existsSync(path.join(workspaceDir, "outcome-review.md"))) {
    addDiagnostic(
      diagnostics,
      "OUTCOME_EVIDENCE_MISSING",
      "strategyOutcome above V0 requires outcome-review.md",
      10
    );
  }
  if (terminal && scopes.personalization !== "V0" && !fs.existsSync(path.join(workspaceDir, "user-risk-profile.md"))) {
    addDiagnostic(
      diagnostics,
      "PERSONALIZATION_EVIDENCE_MISSING",
      "personalization above V0 requires user-risk-profile.md",
      10
    );
  }

  const totalPenalty = Math.min(100, diagnostics.reduce((sum, item) => sum + item.penalty, 0));
  const score = 100 - totalPenalty;
  return {
    schemaVersion: "1.0",
    kind: "ai-team-build.workspace-assessment",
    status: diagnostics.some((item) => item.blocking) ? "failed" : "passed",
    score,
    governance: {
      readiness: governance.readiness,
      derivedVerificationLevel: governance.derivedVerificationLevel
    },
    summary: {
      roles: rolePlan.length,
      stages: stages.length,
      evidenceIds: evidenceIds.size,
      diagnostics: diagnostics.length
    },
    diagnostics
  };
}

function main(argv) {
  const options = parseArgs(argv);
  const report = validateWorkspace(process.cwd(), options.status);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`status=${report.status} score=${report.score} readiness=${report.governance.readiness}`);
    for (const item of report.diagnostics) {
      console.log(`${item.blocking ? "BLOCK" : "REVIEW"} ${item.code}: ${item.detail}`);
    }
  }
  if (report.status !== "passed" ||
      (options.requireReady && report.governance.readiness !== "ready") ||
      report.score < options.minScore) {
    process.exitCode = 1;
  }
}

try {
  if (require.main === module) main(process.argv.slice(2));
} catch (error) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      schemaVersion: "1.0",
      kind: "ai-team-build.workspace-assessment",
      status: "failed",
      score: 0,
      diagnostics: [{ code: "INVALID_INPUT", detail: error.message, penalty: 100, blocking: true }]
    }));
  } else {
    console.error(error.message);
  }
  process.exitCode = error instanceof CliError ? 2 : 1;
}

module.exports = {
  extractEvidenceIds,
  extractEvidenceRows,
  validateWorkspace
};
