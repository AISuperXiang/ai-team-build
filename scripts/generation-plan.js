const path = require("path");
const { commandFileName } = require("./template-utils");
const { MANIFEST_FILE, SPEC_SNAPSHOT_FILE } = require("./generated-artifacts");

const CORE_GOVERNANCE_TEMPLATE_FILES = [
  "assets/templates/decision-log.md",
  "assets/templates/risk-register.md",
  "assets/templates/role-handoff.md",
  "assets/templates/evidence-index.md",
  "assets/templates/delivery-summary.md"
];
const BUILT_IN_TEMPLATE_FILES = [
  ...CORE_GOVERNANCE_TEMPLATE_FILES,
  "assets/templates/workflow-status.json",
  "assets/templates/acceptance-results.json",
  "assets/templates/iteration-feedback.json"
];

function relativeTemplatePath(template) {
  return template.path.startsWith("assets/templates/")
    ? template.path
    : path.join("assets/templates", template.path);
}

function coreGovernanceTemplateFiles(spec) {
  const declaredFiles = new Set((spec.templates || []).map(relativeTemplatePath));
  return CORE_GOVERNANCE_TEMPLATE_FILES.filter((file) => !declaredFiles.has(file));
}

function stageArtifactTemplateFiles(spec) {
  const declaredFiles = new Set([
    ...BUILT_IN_TEMPLATE_FILES,
    ...(spec.templates || []).map(relativeTemplatePath)
  ]);
  const stageArtifacts = spec.workflows
    .flatMap((workflow) => workflow.stages)
    .flatMap((stage) => stage.outputs || [])
    .filter((artifact) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(artifact))
    .map((artifact) => `assets/templates/${artifact}`);
  return [...new Set(stageArtifacts)].filter((file) => !declaredFiles.has(file)).sort();
}

function generationCounts(spec) {
  return {
    members: spec.members.length,
    workflows: spec.workflows.length,
    commands: spec.commands.items.length,
    templates: spec.templates.length,
    stageArtifactTemplates: stageArtifactTemplateFiles(spec).length,
    externalSkills: spec.externalSkills.skills.length,
    acceptanceScenarios: (spec.acceptanceScenarios || []).length,
    dataContracts: (spec.dataContracts || []).length,
    capabilities: (spec.capabilityMatrix || []).length,
    externalAdapters: ((spec.externalSkills && spec.externalSkills.adapters) || []).length
  };
}

function portablePath(value) {
  const raw = String(value || "");
  if (!path.isAbsolute(raw)) return raw;
  const relativePath = path.relative(process.cwd(), raw);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return relativePath || ".";
  return path.basename(raw);
}

function plannedFilesForSpec(spec) {
  const commandFile = `commands/${commandFileName(spec.commands.prefix)}.md`;
  const memberFiles = spec.members.map((member) => `members/${member.id}.md`);
  const workflowFiles = spec.workflows.map((workflow) => `workflows/${workflow.id}.md`);
  const docFiles = [
    ...(spec.docs.methodologies || []),
    ...(spec.docs.standards || []),
    ...(spec.docs.integrations || [])
  ].map((doc) => doc.path);
  const templateFiles = (spec.templates || []).map(relativeTemplatePath);

  return [...new Set([
    "SKILL.md",
    "AGENTS.md",
    ".npmignore",
    "README.md",
    "README_EN.md",
    "evaluation-report.md",
    "package.json",
    "skill-runtime.json",
    SPEC_SNAPSHOT_FILE,
    MANIFEST_FILE,
    "generation-report.json",
    "commands/README.md",
    commandFile,
    "docs/README.md",
    "docs/quality-gates.md",
    "docs/quality-rubrics.md",
    "docs/handoff-contract.md",
    "docs/team-operating-model.md",
    "docs/execution-methodology.md",
    "docs/verification-methodology.md",
    "docs/feedback-loop.md",
    "docs/role-activation-methodology.md",
    "docs/capability-matrix.md",
    "docs/acceptance-scenarios.md",
    "docs/integrations/data-contracts.md",
    "external-cli/README.md",
    "external-skills/README.md",
    "external-skills/catalog.json",
    "external-skills/install-policy.md",
    "external-skills/role-map.md",
    "external-skills/adapters.json",
    "members/README.md",
    "scripts/validate-structure.js",
    "scripts/validate-contracts.js",
    "scripts/generated-artifacts.js",
    "scripts/governance-core.js",
    "scripts/assess-governance.js",
    "scripts/validate-workspace.js",
    "scripts/summarize-feedback.js",
    "scripts/list-external-skills.js",
    "scripts/install-external-skills.js",
    "scripts/run-acceptance-scenarios.js",
    "test/governance-core.test.js",
    "workflows/README.md",
    "workflows/route-table.md",
    "workflows/execution-protocol.md",
    "workspace/README.md",
    "assets/templates/workflow-status.json",
    "assets/templates/acceptance-results.json",
    "assets/templates/iteration-feedback.json",
    ...coreGovernanceTemplateFiles(spec),
    ...stageArtifactTemplateFiles(spec),
    "schemas/member.schema.json",
    "schemas/workflow.schema.json",
    "schemas/command.schema.json",
    "schemas/status.schema.json",
    "schemas/feedback.schema.json",
    "schemas/skill-runtime.schema.json",
    ...memberFiles,
    ...workflowFiles,
    ...docFiles,
    ...templateFiles,
    ...(spec.scripts.includeContextBuilder ? ["scripts/build-context.js"] : [])
  ])];
}

function buildGenerationPlan(spec, outputDir, specPath, options = {}) {
  return {
    generator: "ai-team-build",
    dryRun: Boolean(options.dryRun),
    specSource: portablePath(specPath),
    outputPath: portablePath(outputDir),
    skill: spec.skill,
    commandFile: `commands/${commandFileName(spec.commands.prefix)}.md`,
    counts: generationCounts(spec),
    plannedFiles: plannedFilesForSpec(spec)
  };
}

module.exports = {
  CORE_GOVERNANCE_TEMPLATE_FILES,
  buildGenerationPlan,
  coreGovernanceTemplateFiles,
  generationCounts,
  plannedFilesForSpec,
  relativeTemplatePath,
  stageArtifactTemplateFiles
};
