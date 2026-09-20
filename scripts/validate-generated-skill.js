#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  isValidRequiredCommandField,
  REQUIRED_COMMAND_FIELDS
} = require("./command-contract");
const { assessGovernanceState } = require("./governance-core");
const generatedArtifacts = require("./generated-artifacts");

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".tmp"]);
const TEXT_EXTENSIONS = new Set([".md", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

const results = [];

function record(ok, message) {
  results.push({ ok, message });
}

function existsFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
}

function existsDir(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
}

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function parseJson(root, relativePath) {
  try {
    return JSON.parse(read(root, relativePath));
  } catch (error) {
    record(false, `${relativePath} is valid JSON (${error.message})`);
    return null;
  }
}

function parseYamlScalar(rawValue) {
  const value = String(rawValue || "").trim();
  if (value === "") return { ok: true, value: [] };
  if (value.startsWith("\"")) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string"
        ? { ok: true, value: parsed }
        : { ok: false, error: `expected quoted string, got ${typeof parsed}` };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length === 1) {
      return { ok: false, error: "unclosed single-quoted scalar" };
    }
    return { ok: true, value: value.slice(1, -1).replace(/''/g, "'") };
  }
  if (/["']/.test(value)) {
    return { ok: false, error: "unquoted scalar contains quote characters" };
  }
  return { ok: true, value };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const data = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, rawValue] = keyMatch;
      const parsed = parseYamlScalar(rawValue);
      if (!parsed.ok) return { __parseError: `${key}: ${parsed.error}` };
      currentKey = key;
      data[key] = parsed.value;
      continue;
    }
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey && Array.isArray(data[currentKey])) {
      const parsed = parseYamlScalar(arrayMatch[1]);
      if (!parsed.ok) return { __parseError: `${currentKey}: ${parsed.error}` };
      data[currentKey].push(parsed.value);
    }
  }
  return data;
}

function hasValidFrontmatter(data) {
  return Boolean(data && !data.__parseError);
}

function parseStageRows(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---") || line.includes("阶段 | 负责人")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    rows.push({
      stage: cells[0],
      owner: cells[1],
      artifacts: cells[3].split(/<br>|[,，]/).map((artifact) => artifact.trim()).filter(Boolean),
      gates: cells[4].split(/[,，]/).map((gate) => gate.trim()).filter(Boolean)
    });
  }
  return rows;
}

function hasHollowContent(content) {
  return content.includes("待执行时按当前团队上下文补齐") ||
    content.includes("尚未声明") ||
    /(^|\n)-\s*(\n|$)/.test(content);
}

function schemaIsDeep(schema) {
  return schema &&
    Array.isArray(schema.required) &&
    schema.required.length > 0 &&
    schema.properties &&
    Object.keys(schema.properties).length > 0;
}

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

function listMarkdownFiles(root, relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(relativeDir, file));
}

function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error("Usage: node scripts/validate-generated-skill.js <generated-skill-path>");
    process.exit(1);
  }

  const root = path.resolve(process.cwd(), targetPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`Generated skill path is not a directory: ${root}`);
    process.exit(1);
  }

  const requiredDirs = [
    "assets/templates",
    "commands",
    "docs",
    "docs/methodologies",
    "docs/engineering-standards",
    "docs/integrations",
    "external-cli",
    "external-skills",
    "members",
    "schemas",
    "scripts",
    "test",
    "workflows",
    "workspace"
  ];

  const requiredFiles = [
    "SKILL.md",
    "AGENTS.md",
    ".npmignore",
    "README.md",
    "README_EN.md",
    "evaluation-report.md",
    generatedArtifacts.SPEC_SNAPSHOT_FILE,
    generatedArtifacts.MANIFEST_FILE,
    "package.json",
    "skill-runtime.json",
    "commands/README.md",
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
    "assets/templates/workflow-status.json",
    "assets/templates/acceptance-results.json",
    "assets/templates/iteration-feedback.json",
    "assets/templates/decision-log.md",
    "assets/templates/risk-register.md",
    "assets/templates/role-handoff.md",
    "assets/templates/evidence-index.md",
    "assets/templates/delivery-summary.md",
    "external-cli/README.md",
    "external-skills/README.md",
    "external-skills/catalog.json",
    "external-skills/adapters.json",
    "external-skills/install-policy.md",
    "external-skills/role-map.md",
    "members/README.md",
    "scripts/validate-structure.js",
    "scripts/validate-contracts.js",
    "scripts/governance-core.js",
    "scripts/assess-governance.js",
    "scripts/validate-workspace.js",
    "scripts/summarize-feedback.js",
    "scripts/run-acceptance-scenarios.js",
    "test/governance-core.test.js",
    "workflows/README.md",
    "workflows/route-table.md",
    "workflows/execution-protocol.md",
    "workspace/README.md",
    "generation-report.json"
  ];

  for (const dir of requiredDirs) {
    record(existsDir(root, dir), `required directory exists: ${dir}`);
  }

  for (const file of requiredFiles) {
    record(existsFile(root, file), `required file exists: ${file}`);
  }

  const packageJson = existsFile(root, "package.json") ? parseJson(root, "package.json") : null;
  const runtime = existsFile(root, "skill-runtime.json") ? parseJson(root, "skill-runtime.json") : null;
  const report = existsFile(root, "generation-report.json") ? parseJson(root, "generation-report.json") : null;

  if (existsFile(root, "SKILL.md")) {
    const frontmatter = parseFrontmatter(read(root, "SKILL.md"));
    record(hasValidFrontmatter(frontmatter), frontmatter && frontmatter.__parseError ? `SKILL.md has valid frontmatter (${frontmatter.__parseError})` : "SKILL.md has frontmatter");
    if (runtime && runtime.skill) {
      record(hasValidFrontmatter(frontmatter) && frontmatter.name === runtime.skill.id, "SKILL.md name matches runtime skill id");
    }
    record(Boolean(hasValidFrontmatter(frontmatter) && frontmatter.description), "SKILL.md has description");
  }

  if (existsFile(root, "README.md") && existsFile(root, "README_EN.md")) {
    const readme = read(root, "README.md");
    const readmeEn = read(root, "README_EN.md");
    record(readme.includes("[English](./README_EN.md)"), "README.md links to README_EN.md");
    record(readmeEn.includes("[简体中文](./README.md)"), "README_EN.md links to README.md");
    record(readme.includes("默认中文用户文档"), "README.md declares Simplified Chinese responsibility");
    record(readmeEn.includes("English user documentation"), "README_EN.md declares English responsibility");
  }

  if (packageJson && runtime) {
    record(packageJson.private !== true, "generated package.json is publishable");
    record(packageJson.license === "MIT", "generated package.json license is MIT");
    record(runtime.skill && runtime.skill.id === packageJson.name, "runtime skill id matches package name");
    record(runtime.install && runtime.install.packageName === packageJson.name, "runtime packageName matches package name");
    record(runtime.skill && runtime.skill.entry === "SKILL.md", "runtime entry is SKILL.md");
    record(Boolean(runtime.agentHints && runtime.agentHints.executionPolicy), "runtime defines execution policy");
    record(Boolean(runtime.agentHints && runtime.agentHints.roleActivationPolicy), "runtime defines role activation policy");
    record(Boolean(runtime.agentHints && runtime.agentHints.verificationPolicy), "runtime defines verification boundary");
    record(Boolean(runtime.agentHints && runtime.agentHints.evolutionPolicy), "runtime defines feedback and evolution policy");
    record(Boolean(packageJson.scripts && packageJson.scripts["test:governance"]), "package runs governance regression tests");
    record(Boolean(packageJson.scripts && packageJson.scripts["feedback:summary"]), "package exposes feedback summarization");
    const runtimeText = JSON.stringify(runtime);
    const localPathPlaceholder = ["/path", "to"].join("/");
    const platformCopyCommand = ["cp", "-R"].join(" ");
    record(!runtimeText.includes(localPathPlaceholder) && !runtimeText.includes(platformCopyCommand), "runtime install methods are portable");
    if (runtime.install && Array.isArray(runtime.install.requiredFiles)) {
      for (const requiredPath of runtime.install.requiredFiles) {
        const normalized = requiredPath.replace(/\/$/, "");
        const ok = requiredPath.endsWith("/") ? existsDir(root, normalized) : existsFile(root, normalized);
        record(ok, `runtime required path exists: ${requiredPath}`);
      }
    }
  }

  if (report) {
    record(report.generator === "ai-team-build", "generation report records generator id");
    record(report.skill && path.basename(root) === report.skill.id, "generated directory name matches skill id");
    record(/^\d+\.\d+\.\d+$/.test(String(report.generatorVersion || "")), "generation report records semantic generator version");
    record(report.specSnapshot === generatedArtifacts.SPEC_SNAPSHOT_FILE, "generation report records the spec snapshot");
    record(/^[a-f0-9]{64}$/.test(String(report.specDigest || "")), "generation report records the spec digest");
    record(report.managedManifest === generatedArtifacts.MANIFEST_FILE, "generation report records the managed manifest");
    record(Boolean(report.evaluation), "generation-report.json has evaluation summary");
    record(report.evaluation && report.evaluation.scoreType === "blueprint-contract", "evaluation identifies blueprint-contract score type");
    record(typeof (report.evaluation && report.evaluation.totalScore) === "number", "evaluation has numeric totalScore");
    record(report.evaluation && report.evaluation.runtimeScore === null, "evaluation does not fabricate a runtime score");
    record(report.evaluation && report.evaluation.outcomeScore === null, "evaluation does not fabricate an outcome score");
    record(Boolean(report.evaluation && report.evaluation.grade), "evaluation has grade");
    record(report.evaluation && report.evaluation.reportPath === "evaluation-report.md", "evaluation reportPath is evaluation-report.md");
    record(report.verification && report.verification.factoryVerificationLevel === "V2", "generation report records factory verification level");
    record(report.verification && report.verification.generatedTeamVerificationLevel === "V0", "generation report keeps generated team at V0");
    record(report.verification && report.verification.governanceContractVersion === "1.0", "generation report records governance contract version");
    record(
      report.verification &&
        Array.isArray(report.verification.acceptanceModes) &&
        ["contracts", "execution"].every((mode) => report.verification.acceptanceModes.includes(mode)),
      "generation report declares contracts and execution acceptance modes"
    );
    if (report.evaluation && report.evaluation.grade === "A") {
      record(report.counts && report.counts.acceptanceScenarios > 0, "A-grade generated skill has acceptance scenarios");
      record(report.counts && report.counts.dataContracts > 0, "A-grade generated skill has data contracts");
      record(report.counts && report.counts.capabilities > 0, "A-grade generated skill has capability matrix entries");
      if (report.counts && report.counts.externalSkills > 0) {
        record(report.counts.externalAdapters > 0, "A-grade generated skill with external skills has capability adapters");
      }
    }
    if (existsFile(root, generatedArtifacts.SPEC_SNAPSHOT_FILE)) {
      const specDigest = generatedArtifacts.sha256File(path.join(root, generatedArtifacts.SPEC_SNAPSHOT_FILE));
      record(specDigest === report.specDigest, "spec snapshot digest matches generation report");
    }
    try {
      const manifest = generatedArtifacts.readManifest(root, report.skill && report.skill.id);
      record(manifest.specDigest === report.specDigest, "managed manifest matches the spec digest");
      for (const item of generatedArtifacts.inspectManagedFiles(root, manifest)) {
        record(item.status === "unchanged", `managed file matches manifest: ${item.path}`);
      }
    } catch (error) {
      record(false, `managed manifest is valid (${error.message})`);
    }
  }

  if (existsFile(root, "evaluation-report.md")) {
    const evaluationReport = read(root, "evaluation-report.md");
    record(evaluationReport.includes("## 评分结论"), "evaluation-report.md has score conclusion");
    record(evaluationReport.includes("## 维度评分"), "evaluation-report.md has dimension scoring");
    record(evaluationReport.includes("## 可提升项"), "evaluation-report.md has upgrade opportunities");
    record(evaluationReport.includes("## 能力升级建议"), "evaluation-report.md has capability recommendations");
  }

  if (existsFile(root, "docs/role-activation-methodology.md")) {
    const roleMethodology = read(root, "docs/role-activation-methodology.md");
    record(roleMethodology.includes("rolePlan"), "role activation methodology defines rolePlan");
    record(
      ["active", "consulted", "not_applicable"].every((mode) => roleMethodology.includes(mode)),
      "role activation methodology defines all participation modes"
    );
    record(roleMethodology.includes("N/A") && /重新评估|re-?evaluate/i.test(roleMethodology), "role activation methodology covers N/A and reassessment");
  }
  if (existsFile(root, "docs/execution-methodology.md")) {
    const executionMethodology = read(root, "docs/execution-methodology.md");
    record(
      ["lightweight", "standard", "assurance"].every((profile) => executionMethodology.includes(profile)),
      "execution methodology defines all execution profiles"
    );
  }
  if (existsFile(root, "docs/verification-methodology.md")) {
    const verificationMethodology = read(root, "docs/verification-methodology.md");
    record(
      ["V0", "V1", "V2", "V3", "V4"].every((level) => verificationMethodology.includes(level)),
      "verification methodology defines V0-V4"
    );
  }

  const memberFiles = listMarkdownFiles(root, "members").filter((file) => !file.endsWith("README.md"));
  const memberIds = new Set();
  record(memberFiles.length > 0, "generated skill has member files");
  for (const memberFile of memberFiles) {
    const data = parseFrontmatter(read(root, memberFile));
    record(hasValidFrontmatter(data), data && data.__parseError ? `${memberFile} has valid frontmatter (${data.__parseError})` : `${memberFile} has frontmatter`);
    record(Boolean(hasValidFrontmatter(data) && data.id), `${memberFile} has id`);
    record(Boolean(hasValidFrontmatter(data) && data.name), `${memberFile} has name`);
    record(Boolean(hasValidFrontmatter(data) && data.role), `${memberFile} has role`);
    record(Array.isArray(hasValidFrontmatter(data) && data.when_to_load), `${memberFile} has when_to_load array`);
    record(Array.isArray(hasValidFrontmatter(data) && data.primary_outputs), `${memberFile} has primary_outputs array`);
    record(Array.isArray(hasValidFrontmatter(data) && data.quality_gates), `${memberFile} has quality_gates array`);
    if (hasValidFrontmatter(data) && data.id) memberIds.add(data.id);
  }

  const workflowFiles = listMarkdownFiles(root, "workflows").filter((file) => !file.endsWith("README.md") && !file.endsWith("route-table.md") && !file.endsWith("execution-protocol.md"));
  const workflowIds = new Set();
  record(workflowFiles.length > 0, "generated skill has workflow files");
  for (const workflowFile of workflowFiles) {
    const workflowContent = read(root, workflowFile);
    const data = parseFrontmatter(workflowContent);
    record(hasValidFrontmatter(data), data && data.__parseError ? `${workflowFile} has valid frontmatter (${data.__parseError})` : `${workflowFile} has frontmatter`);
    record(Boolean(hasValidFrontmatter(data) && data.id), `${workflowFile} has id`);
    record(Boolean(hasValidFrontmatter(data) && data.title), `${workflowFile} has title`);
    record(Array.isArray(hasValidFrontmatter(data) && data.triggers), `${workflowFile} has triggers array`);
    record(Array.isArray(hasValidFrontmatter(data) && data.members), `${workflowFile} has members array`);
    record(Boolean(hasValidFrontmatter(data) && data.execution_mode), `${workflowFile} has execution_mode`);
    if (hasValidFrontmatter(data) && data.id) workflowIds.add(data.id);
    for (const member of (hasValidFrontmatter(data) && data.members) || []) {
      record(memberIds.has(member), `${workflowFile} references existing member: ${member}`);
    }
    const stageRows = parseStageRows(workflowContent);
    record(stageRows.length > 0, `${workflowFile} has executable stage rows`);
    const stageOwners = new Set(stageRows.map((row) => row.owner));
    const stageGates = new Set(stageRows.flatMap((row) => row.gates));
    for (const owner of stageOwners) {
      record(memberIds.has(owner), `${workflowFile} stage owner references existing member: ${owner}`);
      record(((hasValidFrontmatter(data) && data.members) || []).includes(owner), `${workflowFile} stage owner is declared in workflow members: ${owner}`);
    }
    for (const artifact of stageRows.flatMap((row) => row.artifacts)) {
      if (!artifact.endsWith(".md")) continue;
      record(
        /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(artifact) &&
          existsFile(root, `assets/templates/${artifact}`),
        `${workflowFile} stage artifact has a template: ${artifact}`
      );
    }
    for (const gate of (hasValidFrontmatter(data) && data.quality_gates) || []) {
      record(stageGates.has(gate), `${workflowFile} declared quality gate appears in stage rows: ${gate}`);
    }
  }

  if (existsFile(root, "workflows/route-table.md")) {
    const routeTable = read(root, "workflows/route-table.md");
    for (const workflowFile of workflowFiles) {
      const fileName = path.basename(workflowFile);
      record(routeTable.includes(`workflows/${fileName}`), `route-table references workflow file: ${fileName}`);
    }
  }

  if (report && report.commandFile) {
    record(existsFile(root, report.commandFile), `reported command file exists: ${report.commandFile}`);
    if (existsFile(root, report.commandFile)) {
      const commandContent = read(root, report.commandFile);
      const command = parseFrontmatter(commandContent);
      record(
        hasValidFrontmatter(command),
        command && command.__parseError
          ? `${report.commandFile} has valid frontmatter (${command.__parseError})`
          : `${report.commandFile} has frontmatter`
      );
      for (const field of REQUIRED_COMMAND_FIELDS) {
        record(
          isValidRequiredCommandField(field, hasValidFrontmatter(command) && command[field]),
          `${report.commandFile} has required route field: ${field}`
        );
      }
      record(
        hasValidFrontmatter(command) && !Object.prototype.hasOwnProperty.call(command, "members"),
        `${report.commandFile} does not declare command-level members`
      );
      for (const workflowId of workflowIds) {
        record(commandContent.includes(workflowId), `${report.commandFile} references workflow id: ${workflowId}`);
      }
    }
  }

  const allTextFiles = collectFiles(root);
  for (const file of allTextFiles) {
    const relativePath = path.relative(root, file);
    if ([generatedArtifacts.SPEC_SNAPSHOT_FILE, generatedArtifacts.MANIFEST_FILE].includes(relativePath)) continue;
    const content = fs.readFileSync(file, "utf8");
    record(!content.includes("{{"), `${relativePath} has no unresolved template opener`);
    record(!content.includes("}}"), `${relativePath} has no unresolved template closer`);
  }

  const contentDepthFiles = [
    ...listMarkdownFiles(root, "docs/methodologies"),
    ...listMarkdownFiles(root, "docs/engineering-standards"),
    ...listMarkdownFiles(root, "docs/integrations"),
    ...listMarkdownFiles(root, "assets/templates").filter((file) => !file.endsWith("workflow-status.json"))
  ];
  for (const file of contentDepthFiles) {
    const content = read(root, file);
    record(!hasHollowContent(content), `${file} has non-hollow generated content`);
  }

  for (const schemaFile of [
    "schemas/member.schema.json",
    "schemas/workflow.schema.json",
    "schemas/command.schema.json",
    "schemas/status.schema.json",
    "schemas/feedback.schema.json",
    "schemas/skill-runtime.schema.json"
  ]) {
    const schema = existsFile(root, schemaFile) ? parseJson(root, schemaFile) : null;
    record(schemaIsDeep(schema), `${schemaFile} has required fields and properties`);
    if (schemaFile === "schemas/command.schema.json") {
      record(
        REQUIRED_COMMAND_FIELDS.every((field) => Array.isArray(schema && schema.required) && schema.required.includes(field)),
        "command schema requires route fields"
      );
      record(
        Boolean(
          schema &&
          schema.additionalProperties === false &&
          schema.properties &&
          !Object.prototype.hasOwnProperty.call(schema.properties, "members")
        ),
        "command schema rejects command-level members"
      );
    }
    if (schemaFile === "schemas/status.schema.json") {
      const rolePlan = schema && schema.properties && schema.properties.rolePlan;
      const governanceControl = schema && schema.properties && schema.properties.governanceControl;
      record(Array.isArray(schema && schema.required) && schema.required.includes("rolePlan"), "status schema requires rolePlan");
      record(
        Boolean(rolePlan && rolePlan.items && rolePlan.items.properties && rolePlan.items.properties.mode),
        "status schema defines rolePlan mode"
      );
      record(
        Array.isArray(schema && schema.required) && schema.required.includes("executionProfile"),
        "status schema requires executionProfile"
      );
      record(
        Array.isArray(schema && schema.required) && schema.required.includes("verificationLevel"),
        "status schema requires verificationLevel"
      );
      record(
        Array.isArray(schema && schema.required) && schema.required.includes("verificationScopes"),
        "status schema requires verificationScopes"
      );
      record(
        Array.isArray(schema && schema.required) && schema.required.includes("governanceControl"),
        "status schema requires governanceControl"
      );
      record(
        Boolean(governanceControl && governanceControl.properties && governanceControl.properties.completion),
        "status schema defines governance completion"
      );
    }
    if (schemaFile === "schemas/skill-runtime.schema.json") {
      const agentHints = schema && schema.properties && schema.properties.agentHints;
      record(
        Array.isArray(schema && schema.required) && schema.required.includes("agentHints"),
        "runtime schema requires agentHints"
      );
      record(
        Boolean(agentHints && agentHints.properties && agentHints.properties.verificationPolicy),
        "runtime schema defines verificationPolicy"
      );
      record(
        Boolean(agentHints && agentHints.properties && agentHints.properties.evolutionPolicy),
        "runtime schema defines evolutionPolicy"
      );
    }
  }

  if (existsFile(root, "assets/templates/workflow-status.json")) {
    const status = parseJson(root, "assets/templates/workflow-status.json");
    record(
      ["lightweight", "standard", "assurance"].includes(status && status.executionProfile),
      "workflow status has valid executionProfile"
    );
    record(/^V[0-4]$/.test(String(status && status.verificationLevel)), "workflow status has valid verificationLevel");
    record(Boolean(status && status.verificationScopes), "workflow status has verificationScopes");
    record(/^V[0-4]$/.test(String(status && status.targetVerificationLevel)), "workflow status has targetVerificationLevel");
    record(Array.isArray(status && status.blockers), "workflow status has blockers array");
    record(Array.isArray(status && status.uncoveredRisks), "workflow status has uncoveredRisks array");
    const governanceAssessment = assessGovernanceState(status);
    record(governanceAssessment.valid, "workflow status governance control is structurally valid");
    record(governanceAssessment.readiness === "review", "initial workflow status governance readiness is review");
  }

  if (existsFile(root, "assets/templates/iteration-feedback.json") && report) {
    const feedback = parseJson(root, "assets/templates/iteration-feedback.json");
    record(feedback && feedback.schemaVersion === "1.0", "feedback template has schemaVersion 1.0");
    record(feedback && feedback.skillId === report.skill.id, "feedback template matches skill id");
    record(feedback && feedback.skillVersion === report.skill.version, "feedback template matches skill version");
    record(feedback && feedback.outcome === "pending", "feedback template starts pending");
    record(feedback && feedback.userAcceptance === "not_recorded", "feedback template does not fabricate acceptance");
  }

  if (existsFile(root, "external-skills/adapters.json")) {
    const adapters = parseJson(root, "external-skills/adapters.json");
    const items = adapters && Array.isArray(adapters.adapters) ? adapters.adapters : [];
    record(Array.isArray(items), "external-skills/adapters.json has adapters array");
    const catalog = existsFile(root, "external-skills/catalog.json") ? parseJson(root, "external-skills/catalog.json") : null;
    const skillIds = new Set(((catalog && catalog.skills) || []).map((skill) => skill.id));
    for (const adapter of items) {
      record(Boolean(adapter.id), `adapter has id: ${adapter.id || "unknown"}`);
      record(skillIds.has(adapter.skill), `adapter ${adapter.id || "unknown"} references catalog skill: ${adapter.skill || "unknown"}`);
      record(Boolean(adapter.provider), `adapter ${adapter.id || "unknown"} has provider`);
      record(Array.isArray(adapter.inputSchema) && adapter.inputSchema.length > 0, `adapter ${adapter.id || "unknown"} has inputSchema`);
      record(Array.isArray(adapter.outputSchema) && adapter.outputSchema.length > 0, `adapter ${adapter.id || "unknown"} has outputSchema`);
      record(Boolean(adapter.auth), `adapter ${adapter.id || "unknown"} has auth`);
      record(Boolean(adapter.fallback), `adapter ${adapter.id || "unknown"} has fallback`);
      record(Boolean(adapter.verifyCommand), `adapter ${adapter.id || "unknown"} has verifyCommand`);
    }
  }

  if (report && report.riskControls && report.riskControls.domainRiskLevel === "high") {
    const skillContent = existsFile(root, "SKILL.md") ? read(root, "SKILL.md") : "";
    const riskContent = [
      skillContent,
      existsFile(root, "docs/quality-gates.md") ? read(root, "docs/quality-gates.md") : "",
      existsFile(root, "docs/quality-rubrics.md") ? read(root, "docs/quality-rubrics.md") : ""
    ].join("\n");

    for (const disclaimer of report.riskControls.requiredDisclaimers || []) {
      record(riskContent.includes(disclaimer), `high-risk disclaimer is present: ${disclaimer}`);
    }
    for (const blockedClaim of report.riskControls.blockedClaims || []) {
      record(riskContent.includes(blockedClaim), `high-risk blocked claim is present: ${blockedClaim}`);
    }
    for (const evidenceRule of report.riskControls.evidenceRules || []) {
      record(riskContent.includes(evidenceRule), `high-risk evidence rule is present: ${evidenceRule}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} generated skill validation check(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} generated skill validation checks passed.`);
}

if (require.main === module) main();
