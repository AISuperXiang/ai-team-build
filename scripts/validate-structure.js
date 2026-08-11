#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  isValidRequiredCommandField,
  REQUIRED_COMMAND_FIELDS
} = require("./command-contract");

const ROOT = path.resolve(__dirname, "..");
const INSTALL_VERIFY_COMMAND = "npm run verify:install";

const requiredDirs = [
  "commands",
  "docs",
  "schemas",
  "assets/templates",
  "scripts",
  "domain-packs",
  "domain-packs/stock-trading",
  "domain-packs/product-rd",
  "domain-packs/venture-building",
  "examples",
  "fixtures"
];

const requiredFiles = [
  "SKILL.md",
  "AGENTS.md",
  "README.md",
  "README_EN.md",
  "package.json",
  "skill-runtime.json",
  "commands/README.md",
  "commands/team-build.md",
  "docs/README.md",
  "docs/reference-standard.md",
  "docs/generation-methodology.md",
  "docs/spec-authoring-guide.md",
  "docs/risk-control-standard.md",
  "docs/team-scoring-rubric.md",
  "docs/generated-skill-quality-gates.md",
  "docs/skill-evolution-methodology.md",
  "schemas/team-spec.schema.json",
  "schemas/generated-skill.schema.json",
  "schemas/domain-pack.schema.json",
  "scripts/template-utils.js",
  "scripts/command-contract.js",
  "scripts/template-engine.js",
  "scripts/generation-plan.js",
  "scripts/generate-team-skill.js",
  "scripts/synthesize-team-spec.js",
  "scripts/run-acceptance-scenarios.js",
  "scripts/run-generated-fixture-test.js",
  "scripts/audit-skills.js",
  "scripts/score-team-spec.js",
  "scripts/validate-structure.js",
  "scripts/validate-team-spec.js",
  "scripts/validate-generated-skill.js",
  "scripts/validate-domain-packs.js",
  "domain-packs/README.md",
  "domain-packs/stock-trading/domain-pack.json",
  "domain-packs/product-rd/domain-pack.json",
  "domain-packs/venture-building/domain-pack.json",
  "examples/product-rd-team.team-spec.json",
  "examples/venture-building-team.team-spec.json",
  "fixtures/stock-trading-team.team-spec.json"
];

const templateFiles = [
  "assets/templates/generated-SKILL.md.tpl",
  "assets/templates/generated-README.md.tpl",
  "assets/templates/generated-README_EN.md.tpl",
  "assets/templates/generated-package.json.tpl",
  "assets/templates/generated-skill-runtime.json.tpl",
  "assets/templates/member.md.tpl",
  "assets/templates/members-README.md.tpl",
  "assets/templates/command.md.tpl",
  "assets/templates/commands-README.md.tpl",
  "assets/templates/workflow.md.tpl",
  "assets/templates/workflows-README.md.tpl",
  "assets/templates/route-table.md.tpl",
  "assets/templates/execution-protocol.md.tpl",
  "assets/templates/team-operating-model.md.tpl",
  "assets/templates/verification-methodology.md.tpl",
  "assets/templates/role-activation-methodology.md.tpl",
  "assets/templates/quality-gates.md.tpl",
  "assets/templates/quality-rubrics.md.tpl",
  "assets/templates/handoff-contract.md.tpl",
  "assets/templates/external-skills-catalog.json.tpl",
  "assets/templates/external-skills-role-map.md.tpl",
  "assets/templates/external-skills-install-policy.md.tpl",
  "assets/templates/external-cli-README.md.tpl",
  "assets/templates/workspace-README.md.tpl",
  "assets/templates/template-md.md.tpl",
  "assets/templates/workflow-status.json.tpl",
  "assets/templates/validate-structure.js.tpl",
  "assets/templates/validate-contracts.js.tpl",
  "assets/templates/list-external-skills.js.tpl",
  "assets/templates/install-external-skills.js.tpl"
];

const results = [];

function record(ok, message) {
  results.push({ ok, message });
}

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function existsFile(relativePath) {
  return fs.existsSync(abs(relativePath)) && fs.statSync(abs(relativePath)).isFile();
}

function existsDir(relativePath) {
  return fs.existsSync(abs(relativePath)) && fs.statSync(abs(relativePath)).isDirectory();
}

function read(relativePath) {
  return fs.readFileSync(abs(relativePath), "utf8");
}

function parseJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
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
    if (!value.endsWith("'") || value.length === 1) return { ok: false, error: "unclosed single-quoted scalar" };
    return { ok: true, value: value.slice(1, -1).replace(/''/g, "'") };
  }
  if (/["']/.test(value)) return { ok: false, error: "unquoted scalar contains quote characters" };
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

for (const dir of requiredDirs) {
  record(existsDir(dir), `required directory exists: ${dir}`);
}

for (const file of [...requiredFiles, ...templateFiles]) {
  record(existsFile(file), `required file exists: ${file}`);
}

if (existsFile("SKILL.md")) {
  const frontmatter = parseFrontmatter(read("SKILL.md"));
  record(hasValidFrontmatter(frontmatter), frontmatter && frontmatter.__parseError ? `SKILL.md has valid frontmatter (${frontmatter.__parseError})` : "SKILL.md has frontmatter");
  record(hasValidFrontmatter(frontmatter) && frontmatter.name === "ai-team-build", "SKILL.md name is ai-team-build");
  record(Boolean(hasValidFrontmatter(frontmatter) && frontmatter.description && frontmatter.description.includes("/team-build")), "SKILL.md description includes trigger");
}

if (existsFile("commands/team-build.md")) {
  const command = parseFrontmatter(read("commands/team-build.md"));
  record(hasValidFrontmatter(command), "commands/team-build.md has valid frontmatter");
  for (const field of REQUIRED_COMMAND_FIELDS) {
    const value = hasValidFrontmatter(command) && command[field];
    record(
      isValidRequiredCommandField(field, value),
      `commands/team-build.md has required route field: ${field}`
    );
  }
  record(
    hasValidFrontmatter(command) && !Object.prototype.hasOwnProperty.call(command, "members"),
    "commands/team-build.md does not declare command-level members"
  );
}

if (existsFile("assets/templates/command.md.tpl")) {
  const template = parseFrontmatter(read("assets/templates/command.md.tpl"));
  record(hasValidFrontmatter(template), "command.md.tpl has valid frontmatter");
  for (const field of REQUIRED_COMMAND_FIELDS) {
    const value = hasValidFrontmatter(template) && template[field];
    record(
      isValidRequiredCommandField(field, value),
      `command.md.tpl has required route field: ${field}`
    );
  }
  record(
    hasValidFrontmatter(template) && !Object.prototype.hasOwnProperty.call(template, "members"),
    "command.md.tpl does not declare command-level members"
  );
}

if (existsFile("package.json")) {
  const packageJson = parseJson("package.json");
  record(packageJson && packageJson.name === "ai-team-build", "package.json name is ai-team-build");
  record(packageJson && packageJson.private !== true, "package.json is publishable");
  record(packageJson && packageJson.license === "MIT", "package.json license matches LICENSE");
  record(packageJson && packageJson.engines && packageJson.engines.node === ">=18", "package.json declares node >=18");
  record(packageJson && packageJson.scripts && packageJson.scripts.test, "package.json has test script");
  record(Boolean(packageJson && packageJson.scripts && packageJson.scripts["verify:install"]), "package.json has verify:install script");
  record(
    Boolean(packageJson && packageJson.scripts && packageJson.scripts["verify:install"] && packageJson.scripts["verify:install"].includes("--dry-run")),
    "verify:install includes a dry-run generation smoke test"
  );
  record(
    Boolean(packageJson && packageJson.scripts && !packageJson.scripts["verify:install"].includes("--overwrite")),
    "verify:install does not allow generated output overwrite"
  );
  record(
    Boolean(packageJson && packageJson.scripts &&
      !packageJson.scripts["verify:install"].includes("npm test") &&
      !packageJson.scripts["verify:install"].includes("test:fixture") &&
      !packageJson.scripts["verify:install"].includes("test:venture") &&
      !packageJson.scripts["verify:install"].includes("test:regression")),
    "verify:install does not invoke complete or materializing test suites"
  );
  record(
    Boolean(packageJson && packageJson.scripts && packageJson.scripts["test:fixture"] && packageJson.scripts["test:fixture"].includes("run-generated-fixture-test.js")),
    "test:fixture uses the system temporary directory runner"
  );
  record(
    Boolean(packageJson && packageJson.scripts && packageJson.scripts["test:venture"] && packageJson.scripts["test:venture"].includes("run-generated-fixture-test.js")),
    "test:venture uses the system temporary directory runner"
  );
  record(packageJson && Array.isArray(packageJson.files) && packageJson.files.length > 0, "package.json declares publish files allowlist");
  record(packageJson && Array.isArray(packageJson.files) && packageJson.files.includes("AGENTS.md"), "package.json publishes AGENTS.md");
  record(packageJson && Array.isArray(packageJson.files) && packageJson.files.includes("README_EN.md"), "package.json publishes README_EN.md");
}

if (existsFile("skill-runtime.json")) {
  const runtime = parseJson("skill-runtime.json");
  const packageJson = existsFile("package.json") ? parseJson("package.json") : null;
  record(runtime && runtime.skill && runtime.skill.id === "ai-team-build", "skill-runtime.json skill id is ai-team-build");
  record(runtime && runtime.entrypoints && runtime.entrypoints.skill === "SKILL.md", "skill-runtime.json entrypoint skill is SKILL.md");
  record(runtime && runtime.entrypoints && runtime.entrypoints.commands === "commands/team-build.md", "skill-runtime.json entrypoint commands is commands/team-build.md");
  record(runtime && packageJson && runtime.install && runtime.install.packageName === packageJson.name, "runtime packageName matches package.json");
  record(runtime && packageJson && runtime.skill && runtime.skill.version === packageJson.version, "runtime skill version matches package.json");
  record(runtime && runtime.schemaVersion === "1.1.0", "runtime schemaVersion is 1.1.0");
  record(Boolean(runtime && runtime.agentHints && runtime.agentHints.executionPolicy), "runtime defines execution policy");
  record(Boolean(runtime && runtime.agentHints && runtime.agentHints.roleActivationPolicy), "runtime defines role activation policy");
  record(Boolean(runtime && runtime.agentHints && runtime.agentHints.verificationPolicy), "runtime defines verification boundary");
  record(
    runtime && runtime.install && Array.isArray(runtime.install.postInstall) &&
      runtime.install.postInstall.length === 1 && runtime.install.postInstall[0] === INSTALL_VERIFY_COMMAND,
    "runtime postInstall uses verify:install"
  );
  if (runtime && runtime.install && Array.isArray(runtime.install.methods)) {
    for (const method of runtime.install.methods) {
      record(
        typeof method.verify === "string" && method.verify.endsWith(INSTALL_VERIFY_COMMAND),
        `runtime install method uses verify:install: ${method.id || "unknown"}`
      );
    }
  }
  const runtimeText = JSON.stringify(runtime);
  const localPathPlaceholder = ["/path", "to"].join("/");
  const platformCopyCommand = ["cp", "-R"].join(" ");
  record(runtime && !runtimeText.includes(localPathPlaceholder) && !runtimeText.includes(platformCopyCommand), "skill-runtime.json has portable install methods");
  if (runtime && runtime.install && Array.isArray(runtime.install.requiredFiles)) {
    for (const requiredPath of runtime.install.requiredFiles) {
      const normalized = requiredPath.replace(/\/$/, "");
      const ok = requiredPath.endsWith("/") ? existsDir(normalized) : existsFile(normalized);
      record(ok, `runtime required path exists: ${requiredPath}`);
    }
  }
}

for (const file of [
  "schemas/team-spec.schema.json",
  "schemas/generated-skill.schema.json",
  "schemas/domain-pack.schema.json",
  "examples/product-rd-team.team-spec.json",
  "examples/venture-building-team.team-spec.json",
  "fixtures/stock-trading-team.team-spec.json",
  "domain-packs/stock-trading/domain-pack.json",
  "domain-packs/product-rd/domain-pack.json",
  "domain-packs/venture-building/domain-pack.json"
]) {
  if (existsFile(file)) {
    const parsed = parseJson(file);
    record(Boolean(parsed), `${file} parses as JSON`);
  }
}

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} structure validation check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} structure validation checks passed.`);
