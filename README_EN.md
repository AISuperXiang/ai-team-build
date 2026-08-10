# AI Team Build

**Language: [简体中文](./README.md) | English**

> A universal AI team Skill factory that turns a described problem or `team-spec.json` into a complete, governed, verifiable team Skill that an Agent can use directly.

## Overview

`ai-team-build` does not rely on a fixed job roster. The Agent derives the team design from the problem's value chain, domain packs contribute specialized knowledge, and deterministic scripts handle generation, validation, scoring, and acceptance.

```text
Problem and value goal
  -> teamDesign
  -> governance model
  -> on-demand roles
  -> workflows and capabilities
  -> acceptance evidence
  -> installable team Skill
```

It can create product-engineering, stock-research, customer-service quality, and other specialized teams. It can also build a venture team covering customer discovery, solution validation, GTM, cash flow, and operating decisions.

## Contents

- [When to Use It](#when-to-use-it)
- [Core Capabilities](#core-capabilities)
- [Quick Start](#quick-start)
- [Slash Commands](#slash-commands)
- [How It Works](#how-it-works)
- [Specification and Governance](#specification-and-governance)
- [Generated Output](#generated-output)
- [Quality Gates](#quality-gates)
- [Domain Packs](#domain-packs)
- [Safety Boundaries](#safety-boundaries)
- [Project Structure](#project-structure)
- [Maintenance and Validation](#maintenance-and-validation)

## When to Use It

`ai-team-build` is a good fit when you need to:

- Create a new AI team Skill from a natural-language goal.
- Generate, review, complete, score, or validate a team Skill from `team-spec.json`.
- Turn domain methodology into an installable and verifiable capability that Agents can invoke.
- Design roles, commands, workflows, governance documents, delivery templates, and quality gates.
- Audit an existing Skill's routing, execution, role activation, verification, safety, and maintainability.
- Evaluate team Skills in batches and produce P0/P1/P2/P3 upgrade recommendations.

It is usually unnecessary when:

- You only want to use an existing team Skill to perform a business task.
- You only need a regular prompt, a single Markdown file, or a non-team script.
- You want the tool to install external Skills directly. Generated teams may declare external capabilities, but installation always requires separate user approval.

## Core Capabilities

| Capability | Problem addressed | Primary output |
| --- | --- | --- |
| Natural-language spec synthesis | A team goal exists without a structured design | `team-spec.json` |
| Problem-value modeling | The team lacks a mission, outcomes, constraints, or value metrics | `teamDesign`, `governance` |
| On-demand role design | A fixed roster creates redundant roles or responsibility gaps | Candidate roles, activation rules, `rolePlan` |
| Team Skill generation | Hand-built directories often miss files or contracts | Complete Skill structure, commands, workflows, templates |
| Domain enhancement | A generic team lacks specialized content | Domain knowledge and constraints from `domain-packs/` |
| Scoring and acceptance | A directory is structurally complete but operationally empty | Evaluation report, acceptance scenarios, evidence |
| Existing Skill audit | Routing, verification, safety, or evolution is weak | Prioritized findings, audit report, upgrade guidance |
| External capability governance | External Skills lack authorization, fallback, or verification rules | Capability Adapters and data contracts |

## Quick Start

### Requirements

- Node.js `>=18`
- `npm`
- Core generation requires no network access or credentials

### Get and Validate

```bash
git clone https://github.com/AISuperXiang/ai-team-build.git
cd ai-team-build
npm test
```

### Generate a Spec from a Goal

```bash
npm run spec -- \
  --goal "Create an A-share trend research team" \
  --output .tmp/stock-spec.json
```

### Generate a Team Skill from a Spec

```bash
npm run generate -- \
  --spec examples/product-rd-team.team-spec.json \
  --output .tmp/product-rd-team
```

Venture-building example:

```bash
npm run spec -- \
  --goal "I am a first-time founder and need a team to validate customers, solutions, GTM, and cash flow" \
  --output .tmp/venture-spec.json

npm run generate -- \
  --spec examples/venture-building-team.team-spec.json \
  --output .tmp/venture-building-team
```

### Preview a Generation Plan

```bash
npm run generate -- \
  --spec fixtures/stock-trading-team.team-spec.json \
  --dry-run
```

### Validate Generated Output

```bash
npm run validate:generated -- <skills-root>/product-rd-team
```

### Audit an Existing Skill

```bash
npm run audit:skills -- <skill-path>
npm run audit:skills -- --root <skills-root> --output-dir .tmp/skill-audits
```

Audits perform static analysis only. They do not run target tests, network calls, or other target scripts. Recommended verification commands must be reviewed against the target repository, permissions, and side-effect boundaries before execution.

## Slash Commands

Use `/team-build` in an Agent / IDE:

| Command | Purpose |
| --- | --- |
| `/team-build intake <team-goal>` | Clarify the problem, value, constraints, risks, and information gaps |
| `/team-build spec <team-goal>` | Generate a team specification from a natural-language goal |
| `/team-build review <team-spec.json>` | Review spec completeness, governance, and quality gates |
| `/team-build create <team-goal>` | Create and validate a complete team Skill from a goal |
| `/team-build from-spec <spec-path>` | Generate a team Skill from an existing spec |
| `/team-build validate <skill-path>` | Validate a generated team Skill |
| `/team-build elevate <skill-path...>` | Audit and selectively upgrade existing Skills |
| `/team-build list-templates` | List available templates and domain packs |

Examples:

```text
/team-build create General product engineering team
/team-build create A-share research team --output <skills-root>/stock-trading-team
/team-build from-spec examples/product-rd-team.team-spec.json
/team-build validate <skills-root>/stock-trading-team
/team-build elevate <skills-root>/ai-work-team <skills-root>/stock-trading-team
```

See [`commands/team-build.md`](./commands/team-build.md) for the complete command reference.

## How It Works

### Create a Team Skill

```text
Intake
  -> Spec
  -> Review
  -> Generate
  -> Validate
  -> Score
  -> Acceptance
  -> Deliver
```

1. **Intake**: Define the problem, value goal, stakeholders, constraints, non-goals, assumptions, and risk boundaries.
2. **Spec**: The Agent derives `teamDesign`, candidate roles, and `governance`; domain packs enhance known domains.
3. **Review**: Check role activation, execution profiles, verification levels, human accountability, capability matrix, data contracts, and risk controls.
4. **Generate**: Run `scripts/generate-team-skill.js` to create the complete directory.
5. **Validate**: Check entrypoints, structure, content depth, Schema, and Capability Adapter contracts.
6. **Score**: Generate `evaluation-report.md` with scores, grade, weaknesses, and upgrade recommendations.
7. **Acceptance**: Run the generated team's golden acceptance scenarios.
8. **Deliver**: Report the output path, file inventory, validation result, risks, and registration steps.

### Upgrade an Existing Skill

```text
Audit
  -> Prioritize
  -> Upgrade
  -> Verify
  -> Re-audit
```

1. **Audit**: Statically inspect discovery, context, execution, verification, safety, and evolution quality.
2. **Prioritize**: Rank findings as P0/P1/P2/P3 and act only on evidence-backed gaps.
3. **Upgrade**: Apply the smallest change consistent with the target Skill's responsibility boundary.
4. **Verify**: Run declared target checks after confirming permissions and side effects.
5. **Re-audit**: Measure score changes and record residual risks and uncovered scope.

## Specification and Governance

Every generation task starts with `team-spec.json`. A compatible v2 specification should include:

- `schemaVersion`: Specification version.
- `teamDesign`: Problem statement, mission, target outcomes, stakeholders, constraints, assumptions, and value metrics.
- `governance`: Complexity, execution profile, evidence rules, human accountability, and risk boundaries.
- `members[].activation`: Activation, exclusion, and reassessment signals for each role.
- `domainKnowledge`: Real domain methods, terminology, and decision rules.
- `capabilityMatrix`: Capabilities, owners, inputs, outputs, and verification methods.
- `acceptanceScenarios`: Executable golden acceptance scenarios.
- `dataContracts`: Data sources, freshness, missing-data handling, and permitted use.
- `externalSkills.adapters`: Inputs, outputs, authorization, fallback, and verification commands for external capabilities.

### Role Activation

Workflow members form a candidate pool, not a mandatory attendance list:

| Mode | Meaning |
| --- | --- |
| `active` | Directly responsible for a stage output, decision, implementation, or verification |
| `consulted` | Provides a conclusion or evidence for a bounded question |
| `not_applicable` | Not relevant to the current task, with a recorded scenario rationale |

The `rolePlan` must be reassessed whenever scope or risk changes.

### Execution Profiles

| Profile | Appropriate for |
| --- | --- |
| `lightweight` | Localized, low-risk work with clear boundaries |
| `standard` | Multi-module work or moderate uncertainty |
| `assurance` | High-risk, `L/XL`, permissions, data, or costly rollback |

### Verification Levels

| Level | Evidence | Conclusion boundary |
| --- | --- | --- |
| `V0` | No verification or reasoning only | Describe only designs, hypotheses, or pending conclusions |
| `V1` | Static checks, lint, typecheck | Claim only that static constraints passed |
| `V2` | Reproducible scripts, unit tests, or integration tests | Claim that tested contracts or behavior passed |
| `V3` | Runtime, browser, or end-to-end critical paths | Claim that critical paths were verified |
| `V4` | Real acceptance, rollout, or production observation | Claim that delivery or benefit was verified |

Factory validation is capped at `V2`. A generated team's real domain capability starts at `V0`; an A-grade blueprint is not proof of business outcomes.

## Generated Output

Default output directory:

```text
<skills-root>/<new-skill-id>
```

Core structure:

```text
<new-skill-id>/
├── SKILL.md
├── README.md
├── package.json
├── skill-runtime.json
├── evaluation-report.md
├── generation-report.json
├── members/
├── workflows/
├── commands/
├── docs/
├── schemas/
├── assets/templates/
├── external-skills/
├── external-cli/
├── workspace/
└── scripts/
```

| File or directory | Responsibility |
| --- | --- |
| `README.md` | User documentation for purpose, usage, and maintenance |
| `SKILL.md` | Agent entrypoint for triggers, routing, loading order, execution, and outputs |
| `members/` | Candidate roles, responsibilities, activation rules, and quality gates |
| `workflows/` | Workflows, stages, outputs, gates, and routing |
| `commands/` | Slash command entrypoints |
| `docs/team-operating-model.md` | Problem-value blueprint, governance, and human accountability |
| `docs/role-activation-methodology.md` | `rolePlan`, participation modes, and N/A rules |
| `docs/execution-methodology.md` | Complexity and execution profiles |
| `docs/verification-methodology.md` | `V0-V4` evidence levels and conclusion limits |
| `docs/capability-matrix.md` | Team capability matrix |
| `docs/acceptance-scenarios.md` | Golden acceptance scenarios |
| `docs/integrations/data-contracts.md` | Data sources, freshness, missing-data handling, and permitted use |
| `assets/templates/` | Decision, risk, handoff, evidence, and delivery templates |
| `external-skills/adapters.json` | Authorization, inputs, outputs, fallback, and verification for external capabilities |
| `evaluation-report.md` | Team score, weaknesses, and capability upgrades |
| `generation-report.json` | Generation plan, file inventory, risk controls, and acceptance index |
| `scripts/` | Structure, contract, acceptance, and helper scripts |

## Quality Gates

`ai-team-build` blocks low-quality team Skills instead of merely generating directories:

- `team-spec` must include domain knowledge, a capability matrix, acceptance scenarios, and data contracts.
- An A-grade team must contain real domain content, not headings, empty lists, or "fill later" placeholders.
- Declared external Skills require a Capability Adapter with inputs, outputs, authorization, fallback, and verification commands.
- `generic-draft` is reviewable scaffolding and cannot receive an A grade.
- High-risk domains require disclaimers, blocked claims, evidence rules, confidence, and invalidation conditions.
- High-risk domains require a human owner and must block delivery or irreversible action without approval.
- Generated output must pass structure validation, contract validation, scoring, and acceptance scenarios.
- Every candidate member must appear in `rolePlan`; only participating roles are loaded, and N/A decisions retain evidence.
- An A grade certifies blueprint and contract quality, not real domain capability or outcomes.

## Domain Packs

`domain-packs/` provides reusable keywords, recommended specs, parameters, capabilities, gates, and outputs for vertical domains.

| Domain pack | Purpose |
| --- | --- |
| `stock-trading` | A-share investment research and trading-plan support team |
| `product-rd` | Product engineering and delivery team |
| `venture-building` | Customer discovery, Offer, GTM, runway, and operating-decision team |

`scripts/synthesize-team-spec.js` selects the closest domain pack from a natural-language goal. If no pack matches, it uses a controlled generic value-chain draft that requires Agent review.

Investment-research examples are for research and education only. They are not investment advice, do not promise returns, and do not replace a licensed advisor.

## Safety Boundaries

- Do not write local absolute paths into source, README, SKILL, or generated output. Use `<skills-root>`, `<ai-team-build-root>`, or relative paths.
- Do not store private credentials, tokens, cookies, machine names, or environment-specific paths.
- Do not install external Skills by default. Only capability catalogs and Adapter contracts may be generated.
- Before using `--overwrite`, confirm that the target was created by this tool and contains a valid `generation-report.json`.
- High-risk teams must not make deterministic promises and must define evidence rules and human review.
- Generators remain offline, deterministic, and free of external side effects.

## Project Structure

```text
ai-team-build/
├── SKILL.md
├── README.md
├── README_EN.md
├── package.json
├── skill-runtime.json
├── commands/
├── docs/
├── domain-packs/
├── examples/
├── fixtures/
├── schemas/
├── assets/
│   └── templates/
└── scripts/
```

## Maintenance and Validation

Common maintenance entrypoints:

- Change spec fields: update `schemas/team-spec.schema.json`, `docs/spec-authoring-guide.md`, `scripts/validate-team-spec.js`, `scripts/score-team-spec.js`, and fixtures.
- Change generated structure: update `docs/reference-standard.md`, `assets/templates/`, `scripts/generate-team-skill.js`, `scripts/generation-plan.js`, `scripts/template-engine.js`, and `scripts/validate-generated-skill.js`.
- Change domain packs: update `domain-packs/`, `schemas/domain-pack.schema.json`, `scripts/validate-domain-packs.js`, and related example specs.
- Change commands: update [`commands/team-build.md`](./commands/team-build.md).
- Change audit rules: update `docs/skill-evolution-methodology.md`, `scripts/audit-skills.js`, and `scripts/run-release-regression-tests.js`.
- Change runtime requirements, entrypoints, installation, or user-facing functionality: update `skill-runtime.json`, `package.json`, and both README files.

Run after structural or contract changes:

```bash
npm test
```

Before release, also run:

```bash
npm pack --dry-run --json
git status --short
```

## Document Responsibilities

- [`README.md`](./README.md): Default Simplified Chinese user documentation.
- [`README_EN.md`](./README_EN.md): English user documentation.
- [`SKILL.md`](./SKILL.md): Agent execution entrypoint.
- [`skill-runtime.json`](./skill-runtime.json): Machine-readable runtime declaration for installers and generic Agents.

## Repository

Public repository: <https://github.com/AISuperXiang/ai-team-build>

License: [`MIT`](./LICENSE)
