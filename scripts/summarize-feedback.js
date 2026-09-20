#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 200;
const OUTCOMES = new Set(["delivered", "partial", "blocked", "abandoned"]);
const USER_ACCEPTANCE = new Set(["accepted", "changes_requested", "rejected", "not_requested"]);
const ROLE_STATUSES = new Set([
  "active_valuable",
  "active_low_value",
  "missing",
  "overloaded",
  "not_applicable_correct",
  "not_applicable_incorrect"
]);

class CliError extends Error {}

function parseArgs(argv) {
  const options = { json: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--input", "--json"].includes(arg)) throw new CliError(`Unknown argument: ${arg}`);
    if (seen.has(arg)) throw new CliError(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CliError("--input requires a value");
    options.input = value;
    index += 1;
  }
  if (!options.input) throw new CliError("--input is required");
  return options;
}

function resolveInside(root, inputPath) {
  const candidate = path.resolve(root, inputPath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CliError("--input must resolve inside the generated skill");
  }
  if (!fs.existsSync(candidate)) throw new CliError("--input does not exist");
  return candidate;
}

function collectJsonFiles(inputPath, files = []) {
  const stat = fs.lstatSync(inputPath);
  if (stat.isSymbolicLink()) throw new CliError("feedback input cannot contain symlinks");
  if (stat.isFile()) {
    if (path.extname(inputPath) !== ".json") throw new CliError("feedback input must be JSON");
    if (stat.size > MAX_FILE_BYTES) throw new CliError("feedback file exceeds size limit");
    files.push(inputPath);
    if (files.length > MAX_FILES) throw new CliError("feedback input exceeds file limit");
    return files;
  }
  if (!stat.isDirectory()) throw new CliError("feedback input must be a file or directory");
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    collectJsonFiles(path.join(inputPath, entry.name), files);
  }
  return files;
}

function stringArray(value) {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function validateFeedback(feedback, context, filePath) {
  const errors = [];
  const requiredStrings = ["schemaVersion", "skillId", "skillVersion", "taskId", "workflow", "recordedAt"];
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return [`${filePath}: feedback must be an object`];
  }
  for (const field of requiredStrings) {
    if (typeof feedback[field] !== "string" || feedback[field].trim().length === 0) {
      errors.push(`${filePath}: ${field} is required`);
    }
  }
  if (feedback.schemaVersion !== "1.0") errors.push(`${filePath}: unsupported schemaVersion`);
  if (feedback.skillId !== context.skillId) errors.push(`${filePath}: skillId mismatch`);
  if (!context.workflows.has(feedback.workflow)) errors.push(`${filePath}: unknown workflow`);
  if (!OUTCOMES.has(feedback.outcome)) errors.push(`${filePath}: outcome must be final`);
  if (!USER_ACCEPTANCE.has(feedback.userAcceptance)) errors.push(`${filePath}: invalid userAcceptance`);
  if (!Number.isSafeInteger(feedback.reworkCycles) || feedback.reworkCycles < 0) {
    errors.push(`${filePath}: reworkCycles must be a non-negative integer`);
  }
  if (Number.isNaN(Date.parse(feedback.recordedAt))) errors.push(`${filePath}: recordedAt must be a timestamp`);
  for (const field of ["friction", "evidenceGaps", "missingCapabilities", "suggestedChanges"]) {
    if (!stringArray(feedback[field])) errors.push(`${filePath}: ${field} must contain non-empty strings`);
  }
  if (!Array.isArray(feedback.roleSignals)) {
    errors.push(`${filePath}: roleSignals must be an array`);
  } else {
    for (const signal of feedback.roleSignals) {
      if (!signal || !context.members.has(signal.role)) {
        errors.push(`${filePath}: roleSignals references an unknown role`);
      } else if (!ROLE_STATUSES.has(signal.status)) {
        errors.push(`${filePath}: roleSignals has an invalid status`);
      } else if (typeof signal.note !== "string" || signal.note.trim().length === 0) {
        errors.push(`${filePath}: roleSignals note is required`);
      }
    }
  }
  return errors;
}

function countValues(records, selector) {
  const counts = new Map();
  for (const value of records.flatMap(selector)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "en"));
}

function summarizeFeedback(records, context) {
  const priorities = [];
  const evidenceGaps = countValues(records, (record) => record.evidenceGaps);
  const missingCapabilities = countValues(records, (record) => record.missingCapabilities);
  const friction = countValues(records, (record) => record.friction);
  const roleSignals = countValues(records, (record) => record.roleSignals
    .filter((signal) => ["missing", "overloaded", "not_applicable_incorrect"].includes(signal.status))
    .map((signal) => `${signal.role}:${signal.status}`));

  for (const item of evidenceGaps) {
    priorities.push({
      priority: "P1",
      signal: `evidence-gap:${item.value}`,
      count: item.count,
      recommendation: "Strengthen the data contract, evidence template, or verification gate."
    });
  }
  for (const item of missingCapabilities) {
    priorities.push({
      priority: item.count >= 2 ? "P1" : "P2",
      signal: `missing-capability:${item.value}`,
      count: item.count,
      recommendation: "Review capabilityMatrix, role ownership, workflow stages, and adapters."
    });
  }
  for (const item of roleSignals) {
    priorities.push({
      priority: "P2",
      signal: `role:${item.value}`,
      count: item.count,
      recommendation: "Adjust role activation rules or split overloaded ownership."
    });
  }
  for (const item of friction) {
    priorities.push({
      priority: item.count >= 2 ? "P2" : "P3",
      signal: `friction:${item.value}`,
      count: item.count,
      recommendation: "Simplify the relevant workflow, template, or tool entrypoint."
    });
  }
  const reworked = records.filter((record) => record.reworkCycles > 0).length;
  if (records.length > 0 && reworked / records.length >= 0.3) {
    priorities.push({
      priority: "P1",
      signal: "rework-rate",
      count: reworked,
      recommendation: "Review intake completeness, handoff contracts, and acceptance criteria."
    });
  }

  const rank = { P1: 0, P2: 1, P3: 2 };
  priorities.sort((left, right) =>
    rank[left.priority] - rank[right.priority] ||
    right.count - left.count ||
    left.signal.localeCompare(right.signal, "en"));

  return {
    schemaVersion: "1.0",
    kind: "ai-team-build.feedback-summary",
    skillId: context.skillId,
    skillVersion: context.skillVersion,
    summary: {
      records: records.length,
      delivered: records.filter((record) => record.outcome === "delivered").length,
      accepted: records.filter((record) => record.userAcceptance === "accepted").length,
      totalReworkCycles: records.reduce((sum, record) => sum + record.reworkCycles, 0)
    },
    byWorkflow: countValues(records, (record) => [record.workflow]),
    evidenceGaps,
    missingCapabilities,
    roleSignals,
    friction,
    suggestedChanges: countValues(records, (record) => record.suggestedChanges),
    priorities
  };
}

function loadFeedback(root, inputPath) {
  const report = JSON.parse(fs.readFileSync(path.join(root, "generation-report.json"), "utf8"));
  const context = {
    skillId: report.skill.id,
    skillVersion: report.skill.version,
    workflows: new Set((report.teamContract.workflows || []).map((workflow) => workflow.id)),
    members: new Set(report.teamContract.memberIds || [])
  };
  const files = collectJsonFiles(resolveInside(root, inputPath));
  if (files.length === 0) throw new CliError("feedback input contains no JSON files");
  const records = [];
  const errors = [];
  for (const file of files) {
    let feedback;
    try {
      feedback = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      errors.push(`${path.relative(root, file)}: invalid JSON`);
      continue;
    }
    const relativePath = path.relative(root, file).split(path.sep).join("/");
    const recordErrors = validateFeedback(feedback, context, relativePath);
    if (recordErrors.length > 0) errors.push(...recordErrors);
    else records.push(feedback);
  }
  if (errors.length > 0) throw new CliError(errors.join("; "));
  return summarizeFeedback(records, context);
}

function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(__dirname, "..");
  const report = loadFeedback(root, options.input);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`records=${report.summary.records} delivered=${report.summary.delivered} accepted=${report.summary.accepted}`);
  for (const item of report.priorities) {
    console.log(`${item.priority} ${item.signal} (${item.count}): ${item.recommendation}`);
  }
}

try {
  if (require.main === module) main(process.argv.slice(2));
} catch (error) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      schemaVersion: "1.0",
      kind: "ai-team-build.feedback-summary",
      status: "failed",
      error: error.message
    }));
  } else {
    console.error(error.message);
  }
  process.exitCode = error instanceof CliError ? 2 : 1;
}

module.exports = {
  loadFeedback,
  summarizeFeedback,
  validateFeedback
};
