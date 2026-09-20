"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { assessGovernanceState } = require("../scripts/governance-core");

const ROOT = path.resolve(__dirname, "..");

function completedStatus() {
  return {
    workflow: "test-workflow",
    verificationLevel: "V3",
    verificationScopes: {
      data: "V2",
      facts: "V3",
      workflow: "V3",
      strategyOutcome: "V0",
      personalization: "V0"
    },
    blockers: [],
    stages: [{ workflowId: "test-workflow", status: "completed" }],
    governanceControl: {
      schemaVersion: "1.0",
      taskId: "task-001",
      authorizedActions: ["run_verification"],
      activeContractRevision: "r1",
      currentInvocationId: "inv-1",
      humanReviewPolicy: {
        required: false,
        accountableRole: "",
        blockedWithoutApproval: false,
        requiredReviewerType: "human"
      },
      contracts: [{
        revision: "r1",
        status: "confirmed",
        sourceRef: "task-brief.md",
        checkIds: ["required-check"]
      }],
      checks: [{
        id: "required-check",
        required: true,
        minimumVerificationLevel: "V3",
        evidenceRunIds: ["run-1"]
      }],
      invocations: [{
        id: "inv-1",
        operation: "verify",
        allowedActions: ["run_verification"],
        authorizationRef: "user-request",
        previousInvocationId: null
      }],
      verificationRuns: [{
        id: "run-1",
        invocationId: "inv-1",
        checkIds: ["required-check"],
        verificationLevel: "V3",
        result: {
          assertion: "pass",
          executed: 1,
          runner: { status: "passed", exitCode: 0 },
          wrapper: { status: "not_applicable", exitCode: null }
        },
        evidenceRefs: ["evidence/result.json"]
      }],
      approvals: [],
      completion: { claim: "analysis_complete" }
    }
  };
}

test("initial template is valid but remains in review", () => {
  const template = JSON.parse(
    fs.readFileSync(path.join(ROOT, "assets/templates/workflow-status.json"), "utf8")
  );
  const report = assessGovernanceState(template);
  assert.equal(report.valid, true);
  assert.equal(report.readiness, "review");
  assert.equal(report.derivedVerificationLevel, "V0");
});

test("confirmed contract and trustworthy evidence become ready", () => {
  const report = assessGovernanceState(completedStatus());
  assert.equal(report.valid, true);
  assert.equal(report.readiness, "ready");
  assert.equal(report.derivedVerificationLevel, "V3");
});

test("zero executed checks cannot support a terminal claim", () => {
  const status = completedStatus();
  status.governanceControl.verificationRuns[0].result.executed = 0;
  status.governanceControl.verificationRuns[0].evidenceRefs = [];
  const report = assessGovernanceState(status);
  assert.equal(report.readiness, "blocked");
  assert.ok(report.diagnostics.some((item) => item.code === "REQUIRED_CHECK_BLOCKED"));
});

test("required human review blocks delivery without approval", () => {
  const status = completedStatus();
  status.governanceControl.humanReviewPolicy = {
    required: true,
    accountableRole: "human-reviewer",
    blockedWithoutApproval: true,
    requiredReviewerType: "human"
  };
  const report = assessGovernanceState(status);
  assert.equal(report.readiness, "blocked");
  assert.ok(report.diagnostics.some((item) => item.code === "HUMAN_APPROVAL_REQUIRED"));
});
