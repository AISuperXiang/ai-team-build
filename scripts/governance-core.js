"use strict";

const LEVELS = ["V0", "V1", "V2", "V3", "V4"];
const CLAIMS = ["pending", "candidate", "accepted", "analysis_complete"];
const CONTRACT_STATUSES = ["draft", "confirmed", "conflicted"];
const OPERATIONS = ["start", "resume", "verify", "review", "deliver"];
const ASSERTIONS = ["pass", "fail", "not_run", "unknown"];
const PROCESS_STATUSES = ["passed", "failed", "not_applicable", "unknown"];
const VERIFICATION_SCOPES = [
  "data",
  "facts",
  "workflow",
  "strategyOutcome",
  "personalization"
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(value) {
  return Array.isArray(value) &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length;
}

function addDiagnostic(diagnostics, code, detail, blocking = true) {
  diagnostics.push({ code, detail, blocking });
}

function validateProcessResult(value, label, diagnostics) {
  if (!isObject(value)) {
    addDiagnostic(diagnostics, "PROCESS_RESULT_INVALID", `${label} must be an object`);
    return;
  }
  if (!PROCESS_STATUSES.includes(value.status)) {
    addDiagnostic(diagnostics, "PROCESS_STATUS_INVALID", `${label}.status is invalid`);
  }
  if (!(value.exitCode === null || Number.isInteger(value.exitCode))) {
    addDiagnostic(diagnostics, "PROCESS_EXIT_CODE_INVALID", `${label}.exitCode must be an integer or null`);
  }
}

function indexUnique(items, key, label, diagnostics) {
  const result = new Map();
  for (const item of items) {
    const id = item && item[key];
    if (!nonEmptyString(id)) {
      addDiagnostic(diagnostics, "IDENTIFIER_REQUIRED", `${label}.${key} is required`);
      continue;
    }
    if (result.has(id)) {
      addDiagnostic(diagnostics, "DUPLICATE_IDENTIFIER", `${label}.${key} is duplicated: ${id}`);
      continue;
    }
    result.set(id, item);
  }
  return result;
}

function validateGovernanceState(status) {
  const diagnostics = [];
  if (!isObject(status)) {
    addDiagnostic(diagnostics, "STATUS_INVALID", "workflow status must be an object");
    return diagnostics;
  }
  const control = status.governanceControl;
  if (!isObject(control)) {
    addDiagnostic(diagnostics, "GOVERNANCE_CONTROL_REQUIRED", "governanceControl is required");
    return diagnostics;
  }
  if (control.schemaVersion !== "1.0") {
    addDiagnostic(diagnostics, "GOVERNANCE_VERSION_UNSUPPORTED", "governanceControl.schemaVersion must be 1.0");
  }
  if (typeof control.taskId !== "string") {
    addDiagnostic(diagnostics, "TASK_ID_INVALID", "taskId must be a string");
  }
  if (!Array.isArray(control.authorizedActions) || !uniqueStrings(control.authorizedActions)) {
    addDiagnostic(diagnostics, "AUTHORIZED_ACTIONS_INVALID", "authorizedActions must be a unique string array");
  }
  if (!(control.activeContractRevision === null || nonEmptyString(control.activeContractRevision))) {
    addDiagnostic(diagnostics, "ACTIVE_CONTRACT_INVALID", "activeContractRevision must be a non-empty string or null");
  }
  if (!(control.currentInvocationId === null || nonEmptyString(control.currentInvocationId))) {
    addDiagnostic(diagnostics, "CURRENT_INVOCATION_ID_INVALID", "currentInvocationId must be a non-empty string or null");
  }
  for (const field of ["contracts", "checks", "invocations", "verificationRuns", "approvals"]) {
    if (!Array.isArray(control[field])) {
      addDiagnostic(diagnostics, "GOVERNANCE_ARRAY_REQUIRED", `governanceControl.${field} must be an array`);
    }
  }
  if (!isObject(control.completion) || !CLAIMS.includes(control.completion.claim)) {
    addDiagnostic(diagnostics, "COMPLETION_INVALID", "completion.claim is invalid");
  }
  const policy = control.humanReviewPolicy;
  if (!isObject(policy) ||
      typeof policy.required !== "boolean" ||
      typeof policy.blockedWithoutApproval !== "boolean" ||
      typeof policy.accountableRole !== "string" ||
      policy.requiredReviewerType !== "human") {
    addDiagnostic(diagnostics, "HUMAN_REVIEW_POLICY_INVALID", "humanReviewPolicy is invalid");
  }
  if (!isObject(status.verificationScopes)) {
    addDiagnostic(diagnostics, "VERIFICATION_SCOPES_REQUIRED", "verificationScopes is required");
  } else {
    for (const scope of VERIFICATION_SCOPES) {
      if (!LEVELS.includes(status.verificationScopes[scope])) {
        addDiagnostic(diagnostics, "VERIFICATION_SCOPE_INVALID", `verificationScopes.${scope} is invalid`);
      }
    }
  }

  const contracts = Array.isArray(control.contracts) ? control.contracts : [];
  const checks = Array.isArray(control.checks) ? control.checks : [];
  const invocations = Array.isArray(control.invocations) ? control.invocations : [];
  const runs = Array.isArray(control.verificationRuns) ? control.verificationRuns : [];
  const approvals = Array.isArray(control.approvals) ? control.approvals : [];
  const authorizedActions = Array.isArray(control.authorizedActions) ? control.authorizedActions : [];
  const contractIndex = indexUnique(contracts, "revision", "contract", diagnostics);
  const checkIndex = indexUnique(checks, "id", "check", diagnostics);
  const invocationIndex = indexUnique(invocations, "id", "invocation", diagnostics);
  const runIndex = indexUnique(runs, "id", "verificationRun", diagnostics);
  indexUnique(approvals, "id", "approval", diagnostics);

  for (const contract of contracts) {
    if (!CONTRACT_STATUSES.includes(contract.status)) {
      addDiagnostic(diagnostics, "CONTRACT_STATUS_INVALID", `contract ${contract.revision || "unknown"} status is invalid`);
    }
    if (!nonEmptyString(contract.sourceRef)) {
      addDiagnostic(diagnostics, "CONTRACT_SOURCE_REQUIRED", `contract ${contract.revision || "unknown"} requires sourceRef`);
    }
    if (!uniqueStrings(contract.checkIds || [])) {
      addDiagnostic(diagnostics, "CONTRACT_CHECKS_INVALID", `contract ${contract.revision || "unknown"} checkIds are invalid`);
    }
    for (const checkId of contract.checkIds || []) {
      if (!checkIndex.has(checkId)) {
        addDiagnostic(diagnostics, "CONTRACT_CHECK_UNKNOWN", `contract ${contract.revision || "unknown"} references unknown check ${checkId}`);
      }
    }
  }

  for (const check of checks) {
    if (typeof check.required !== "boolean") {
      addDiagnostic(diagnostics, "CHECK_REQUIRED_FLAG_INVALID", `check ${check.id || "unknown"} required must be boolean`);
    }
    if (!LEVELS.includes(check.minimumVerificationLevel)) {
      addDiagnostic(diagnostics, "CHECK_LEVEL_INVALID", `check ${check.id || "unknown"} minimumVerificationLevel is invalid`);
    }
    if (!uniqueStrings(check.evidenceRunIds || [])) {
      addDiagnostic(diagnostics, "CHECK_RUNS_INVALID", `check ${check.id || "unknown"} evidenceRunIds are invalid`);
    }
    for (const runId of check.evidenceRunIds || []) {
      const run = runIndex.get(runId);
      if (!run) {
        addDiagnostic(diagnostics, "CHECK_RUN_UNKNOWN", `check ${check.id || "unknown"} references unknown run ${runId}`);
      } else if (!Array.isArray(run.checkIds) || !run.checkIds.includes(check.id)) {
        addDiagnostic(diagnostics, "CHECK_RUN_NOT_RECIPROCAL", `run ${runId} does not reference check ${check.id}`);
      }
    }
  }

  for (let index = 0; index < invocations.length; index += 1) {
    const invocation = invocations[index];
    if (!OPERATIONS.includes(invocation.operation)) {
      addDiagnostic(diagnostics, "INVOCATION_OPERATION_INVALID", `invocation ${invocation.id || "unknown"} operation is invalid`);
    }
    if (!uniqueStrings(invocation.allowedActions || [])) {
      addDiagnostic(diagnostics, "INVOCATION_ACTIONS_INVALID", `invocation ${invocation.id || "unknown"} allowedActions are invalid`);
    }
    for (const action of invocation.allowedActions || []) {
      if (!authorizedActions.includes(action)) {
        addDiagnostic(diagnostics, "INVOCATION_ACTION_UNAUTHORIZED", `invocation ${invocation.id || "unknown"} is not authorized for ${action}`);
      }
    }
    if (!nonEmptyString(invocation.authorizationRef)) {
      addDiagnostic(diagnostics, "INVOCATION_AUTHORIZATION_REQUIRED", `invocation ${invocation.id || "unknown"} requires authorizationRef`);
    }
    const expectedPrevious = index === 0 ? null : invocations[index - 1].id;
    if (invocation.previousInvocationId !== expectedPrevious) {
      addDiagnostic(diagnostics, "INVOCATION_CHAIN_INVALID", `invocation ${invocation.id || "unknown"} does not reference its immediate predecessor`);
    }
  }
  if (control.currentInvocationId !== null) {
    const current = invocationIndex.get(control.currentInvocationId);
    if (!current || invocations[invocations.length - 1] !== current) {
      addDiagnostic(diagnostics, "CURRENT_INVOCATION_INVALID", "currentInvocationId must reference the latest invocation");
    }
  }

  for (const run of runs) {
    const invocation = invocationIndex.get(run.invocationId);
    if (!invocation) {
      addDiagnostic(diagnostics, "RUN_INVOCATION_UNKNOWN", `run ${run.id || "unknown"} references an unknown invocation`);
    } else if (!Array.isArray(invocation.allowedActions) ||
        !invocation.allowedActions.includes("run_verification")) {
      addDiagnostic(
        diagnostics,
        "RUN_VERIFICATION_UNAUTHORIZED",
        `run ${run.id || "unknown"} invocation is not authorized to run verification`
      );
    }
    if (!uniqueStrings(run.checkIds || [])) {
      addDiagnostic(diagnostics, "RUN_CHECKS_INVALID", `run ${run.id || "unknown"} checkIds are invalid`);
    }
    for (const checkId of run.checkIds || []) {
      if (!checkIndex.has(checkId)) {
        addDiagnostic(diagnostics, "RUN_CHECK_UNKNOWN", `run ${run.id || "unknown"} references unknown check ${checkId}`);
      }
    }
    if (!LEVELS.includes(run.verificationLevel)) {
      addDiagnostic(diagnostics, "RUN_LEVEL_INVALID", `run ${run.id || "unknown"} verificationLevel is invalid`);
    }
    if (!isObject(run.result)) {
      addDiagnostic(diagnostics, "RUN_RESULT_INVALID", `run ${run.id || "unknown"} result is required`);
    } else {
      if (!ASSERTIONS.includes(run.result.assertion)) {
        addDiagnostic(diagnostics, "RUN_ASSERTION_INVALID", `run ${run.id || "unknown"} assertion is invalid`);
      }
      if (!Number.isInteger(run.result.executed) || run.result.executed < 0) {
        addDiagnostic(diagnostics, "RUN_EXECUTED_INVALID", `run ${run.id || "unknown"} executed must be a non-negative integer`);
      }
      validateProcessResult(run.result.runner, `run ${run.id || "unknown"}.runner`, diagnostics);
      validateProcessResult(run.result.wrapper, `run ${run.id || "unknown"}.wrapper`, diagnostics);
    }
    if (!uniqueStrings(run.evidenceRefs || [])) {
      addDiagnostic(diagnostics, "RUN_EVIDENCE_INVALID", `run ${run.id || "unknown"} evidenceRefs are invalid`);
    } else if (run.result &&
        ["pass", "fail"].includes(run.result.assertion) &&
        run.result.executed > 0 &&
        run.evidenceRefs.length === 0) {
      addDiagnostic(diagnostics, "RUN_EVIDENCE_REQUIRED", `run ${run.id || "unknown"} requires evidenceRefs`);
    }
  }

  for (const approval of approvals) {
    if (!contractIndex.has(approval.contractRevision)) {
      addDiagnostic(diagnostics, "APPROVAL_CONTRACT_UNKNOWN", `approval ${approval.id || "unknown"} references an unknown contract`);
    }
    if (!nonEmptyString(approval.role) ||
        approval.reviewerType !== "human" ||
        !nonEmptyString(approval.reviewerId) ||
        !["approved", "rejected"].includes(approval.status) ||
        !nonEmptyString(approval.evidenceRef) ||
        !nonEmptyString(approval.reviewedAt) ||
        Number.isNaN(Date.parse(approval.reviewedAt))) {
      addDiagnostic(diagnostics, "APPROVAL_INVALID", `approval ${approval.id || "unknown"} is incomplete`);
    }
  }

  return diagnostics;
}

function processPassed(processResult, allowNotApplicable) {
  if (!isObject(processResult)) return false;
  if (processResult.status === "passed") return processResult.exitCode === 0;
  return allowNotApplicable &&
    processResult.status === "not_applicable" &&
    processResult.exitCode === null;
}

function resultSupportsPass(result) {
  return isObject(result) &&
    result.assertion === "pass" &&
    Number.isInteger(result.executed) &&
    result.executed > 0 &&
    processPassed(result.runner, false) &&
    processPassed(result.wrapper, true);
}

function levelAtLeast(actual, minimum) {
  return LEVELS.indexOf(actual) >= LEVELS.indexOf(minimum);
}

function assessGovernanceState(status) {
  const structuralDiagnostics = validateGovernanceState(status);
  const diagnostics = [...structuralDiagnostics];
  if (structuralDiagnostics.length > 0) {
    return {
      valid: false,
      readiness: "blocked",
      claim: status && status.governanceControl && status.governanceControl.completion
        ? status.governanceControl.completion.claim
        : "pending",
      derivedVerificationLevel: "V0",
      checks: [],
      diagnostics
    };
  }

  const control = status.governanceControl;
  const terminal = ["accepted", "analysis_complete"].includes(control.completion.claim);
  let blocked = false;
  let pending = false;
  const issue = (code, detail, hard = false) => {
    const blocking = hard || terminal;
    addDiagnostic(diagnostics, code, detail, blocking);
    if (blocking) blocked = true;
    else pending = true;
  };
  const contractIndex = new Map(control.contracts.map((item) => [item.revision, item]));
  const runIndex = new Map(control.verificationRuns.map((item) => [item.id, item]));
  const activeContract = contractIndex.get(control.activeContractRevision);
  if (terminal && !nonEmptyString(control.taskId)) {
    issue("TASK_ID_REQUIRED", "a taskId is required before a terminal claim");
  }
  if (!activeContract || activeContract.status !== "confirmed") {
    issue("ACTIVE_CONTRACT_REQUIRED", "a confirmed active contract is required");
  }
  if (control.currentInvocationId === null) {
    issue("CURRENT_INVOCATION_REQUIRED", "a current invocation is required");
  }

  const activeCheckIds = new Set(activeContract ? activeContract.checkIds : []);
  const requiredChecks = control.checks.filter((check) => check.required && activeCheckIds.has(check.id));
  if (requiredChecks.length === 0) {
    issue("REQUIRED_CHECKS_MISSING", "the active contract must contain at least one required check");
  }
  for (const check of control.checks) {
    if (check.required && !activeCheckIds.has(check.id)) {
      issue("REQUIRED_CHECK_UNBOUND", `required check ${check.id} is not bound to the active contract`, true);
    }
  }

  let highestLevelIndex = 0;
  const checkResults = requiredChecks.map((check) => {
    const runs = check.evidenceRunIds.map((id) => runIndex.get(id)).filter(Boolean);
    const passing = runs.find((run) =>
      run.checkIds.includes(check.id) &&
      resultSupportsPass(run.result) &&
      levelAtLeast(run.verificationLevel, check.minimumVerificationLevel));
    const failed = runs.find((run) =>
      run.result &&
      run.result.assertion === "fail" &&
      run.result.executed > 0);
    if (passing && failed) {
      issue("REQUIRED_CHECK_CONFLICT", `required check ${check.id} has conflicting pass and fail evidence`, true);
      return { id: check.id, status: "CONFLICT", runId: null };
    }
    if (passing) {
      highestLevelIndex = Math.max(highestLevelIndex, LEVELS.indexOf(passing.verificationLevel));
      return { id: check.id, status: "PASSED", runId: passing.id };
    }
    if (failed) {
      issue("REQUIRED_CHECK_FAILED", `required check ${check.id} failed`, true);
      return { id: check.id, status: "FAILED", runId: failed.id };
    }
    if (runs.length > 0) {
      issue("REQUIRED_CHECK_BLOCKED", `required check ${check.id} has no trustworthy passing run`);
      return { id: check.id, status: "BLOCKED", runId: null };
    }
    issue("REQUIRED_CHECK_NOT_RUN", `required check ${check.id} has not run`);
    return { id: check.id, status: "NOT_RUN", runId: null };
  });

  const derivedVerificationLevel = LEVELS[highestLevelIndex];
  const workflowVerificationLevel = status.verificationScopes.workflow;
  if (status.verificationLevel !== workflowVerificationLevel) {
    issue(
      "VERIFICATION_LEVEL_SCOPE_MISMATCH",
      `reported ${status.verificationLevel} must match workflow scope ${workflowVerificationLevel}`
    );
  }
  if (LEVELS.indexOf(workflowVerificationLevel) > highestLevelIndex) {
    issue(
      "VERIFICATION_LEVEL_EXCEEDS_EVIDENCE",
      `reported workflow ${workflowVerificationLevel} exceeds evidence-backed ${derivedVerificationLevel}`
    );
  }
  if (Array.isArray(status.blockers) && status.blockers.length > 0) {
    issue("OPEN_BLOCKERS", "workflow status contains unresolved blockers", true);
  }
  const activeStages = Array.isArray(status.stages)
    ? status.stages.filter((stage) => stage.workflowId === status.workflow)
    : [];
  if (terminal && !nonEmptyString(status.workflow)) {
    issue("ACTIVE_WORKFLOW_REQUIRED", "workflow is required before a terminal claim");
  } else if (terminal && activeStages.length === 0) {
    issue("ACTIVE_STAGES_REQUIRED", "the selected workflow must have stages");
  } else if (activeStages.some((stage) => stage.status !== "completed")) {
    issue("STAGES_INCOMPLETE", "all selected workflow stages must be completed before a terminal claim");
  }

  const policy = control.humanReviewPolicy;
  if (policy.required && policy.blockedWithoutApproval) {
    const approved = control.approvals.some((approval) =>
      approval.contractRevision === control.activeContractRevision &&
      approval.role === policy.accountableRole &&
      approval.reviewerType === policy.requiredReviewerType &&
      nonEmptyString(approval.reviewerId) &&
      approval.status === "approved" &&
      nonEmptyString(approval.evidenceRef) &&
      nonEmptyString(approval.reviewedAt));
    if (!approved) {
      issue("HUMAN_APPROVAL_REQUIRED", `approval from ${policy.accountableRole || "the accountable role"} is required`);
    }
  }

  if (!terminal) {
    issue("TERMINAL_CLAIM_REQUIRED", "completion claim must be accepted or analysis_complete");
  }
  let readiness = blocked ? "blocked" : pending ? "review" : "ready";
  if (terminal && readiness !== "ready") {
    addDiagnostic(diagnostics, "CLAIM_EXCEEDS_READINESS", "terminal claim exceeds current governance evidence", true);
    readiness = "blocked";
  }

  return {
    valid: true,
    readiness,
    claim: control.completion.claim,
    derivedVerificationLevel,
    checks: checkResults,
    diagnostics
  };
}

module.exports = {
  LEVELS,
  assessGovernanceState,
  resultSupportsPass,
  validateGovernanceState
};
