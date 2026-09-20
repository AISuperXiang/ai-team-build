# Quality Gates

{{docs.qualityGates}}

## Core Gates

- role-activation-gate
- value-gate
- decision-gate
- handoff-gate
- complexity-gate
- evidence-gate
- verification-gate
- governance-readiness-gate
- execution-acceptance-gate
- human-review-gate
- delivery-gate
- feedback-loop-gate

Generated teams must retain `team-spec.snapshot.json`, a valid `generation-manifest.json`, and
governance regression tests. Task feedback informs future spec changes but cannot raise verification.

Human approval requires a real person recorded with `reviewerType=human`, reviewer identity,
review time, scope, and evidence. An Agent role review cannot satisfy this gate.

## 风险控制

{{riskControls.requiredDisclaimers}}
