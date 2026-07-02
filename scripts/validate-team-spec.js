#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs, readJson } = require("./template-utils");

const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COMMAND_PREFIX = /^\/[a-z0-9]+(-[a-z0-9]+)*$/;
const COMMAND_NAME = /^[a-z][a-z0-9-]*$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isSafeRelativePath(value) {
  const raw = String(value || "");
  if (raw.includes("\\")) return false;
  if (raw.split("/").includes("..")) return false;
  const normalized = path.normalize(raw);
  return normalized &&
    !path.isAbsolute(normalized) &&
    normalized !== "." &&
    !normalized.startsWith("..") &&
    !normalized.split(path.sep).includes("..");
}

function isSafeOutputDirectory(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  for (const prefix of ["<skills-root>", "$SKILLS_ROOT"]) {
    if (raw === prefix || raw.startsWith(`${prefix}\\`)) return false;
    if (raw.startsWith(`${prefix}/`)) return isSafeRelativePath(raw.slice(prefix.length + 1));
  }
  return isSafeRelativePath(raw);
}

function portablePathBasename(value) {
  let raw = String(value || "").trim();
  for (const prefix of ["<skills-root>", "$SKILLS_ROOT"]) {
    if (raw.startsWith(`${prefix}/`)) raw = raw.slice(prefix.length + 1);
  }
  return path.basename(path.normalize(raw));
}

function createReporter() {
  const results = [];
  return {
    record(ok, message) {
      results.push({ ok, message });
    },
    print() {
      for (const result of results) {
        console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
      }
      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        console.error(`\n${failed.length} spec validation check(s) failed.`);
      } else {
        console.log(`\nAll ${results.length} spec validation checks passed.`);
      }
      return failed.length;
    },
    failedCount() {
      return results.filter((result) => !result.ok).length;
    },
    results
  };
}

function requireObject(reporter, parent, field, label) {
  const value = parent ? parent[field] : undefined;
  const ok = isObject(value);
  reporter.record(ok, `${label}.${field} is object`);
  return ok ? value : null;
}

function requireString(reporter, parent, field, label) {
  const value = parent ? parent[field] : undefined;
  const ok = isNonEmptyString(value);
  reporter.record(ok, `${label}.${field} is non-empty string`);
  return ok ? value : "";
}

function requireArray(reporter, parent, field, label) {
  const value = parent ? parent[field] : undefined;
  const ok = isNonEmptyArray(value);
  reporter.record(ok, `${label}.${field} is non-empty array`);
  return ok ? value : [];
}

function requireBoolean(reporter, parent, field, label) {
  const value = parent ? parent[field] : undefined;
  const ok = typeof value === "boolean";
  reporter.record(ok, `${label}.${field} is boolean`);
  return ok ? value : false;
}

function requireKebab(reporter, value, label) {
  const ok = KEBAB_ID.test(String(value || ""));
  reporter.record(ok, `${label} uses kebab-case id`);
  return ok;
}

function validateUniqueIds(reporter, items, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item || !item.id) continue;
    const ok = !seen.has(item.id);
    reporter.record(ok, `${label} id is unique: ${item.id}`);
    seen.add(item.id);
  }
}

function validateStringList(reporter, value, label) {
  reporter.record(isNonEmptyArray(value), `${label} is non-empty array`);
  for (const item of value || []) {
    reporter.record(isNonEmptyString(item), `${label} entry is non-empty string`);
  }
}

function validateContentMap(reporter, value, label, sectionNames) {
  if (value === undefined) return;
  reporter.record(isObject(value), `${label}.content is object`);
  if (!isObject(value)) return;
  for (const [section, items] of Object.entries(value)) {
    reporter.record(sectionNames.includes(section), `${label}.content section exists in sections: ${section}`);
    validateStringList(reporter, items, `${label}.content.${section}`);
  }
}

function validateSpec(spec, options = {}) {
  const reporter = options.reporter || createReporter();
  reporter.record(isObject(spec), "spec is object");
  if (!isObject(spec)) return reporter;

  const skill = requireObject(reporter, spec, "skill", "spec");
  if (skill) {
    const id = requireString(reporter, skill, "id", "skill");
    requireKebab(reporter, id, "skill.id");
    for (const field of ["name", "description", "version", "domain", "primaryValue"]) {
      requireString(reporter, skill, field, "skill");
    }
    requireArray(reporter, skill, "targetUsers", "skill");
  }

  const commands = requireObject(reporter, spec, "commands", "spec");
  if (commands) {
    const prefix = requireString(reporter, commands, "prefix", "commands");
    reporter.record(COMMAND_PREFIX.test(prefix), "commands.prefix starts with slash and uses kebab-case");
    const items = requireArray(reporter, commands, "items", "commands");
    for (const item of items) {
      reporter.record(isObject(item), "commands.items entry is object");
      if (!isObject(item)) continue;
      const name = requireString(reporter, item, "name", `command ${item.name || "unknown"}`);
      reporter.record(COMMAND_NAME.test(name), `command name is valid: ${name}`);
      requireString(reporter, item, "workflow", `command ${name}`);
      requireString(reporter, item, "description", `command ${name}`);
      requireString(reporter, item, "requiredInput", `command ${name}`);
      requireString(reporter, item, "defaultOutput", `command ${name}`);
    }
  }

  const members = requireArray(reporter, spec, "members", "spec");
  const memberIds = new Set();
  for (const member of members) {
    reporter.record(isObject(member), "members entry is object");
    if (!isObject(member)) continue;
    const id = requireString(reporter, member, "id", `member ${member.id || "unknown"}`);
    requireKebab(reporter, id, `member.id ${id}`);
    if (id) memberIds.add(id);
    for (const field of ["name", "role"]) requireString(reporter, member, field, `member ${id}`);
    for (const field of [
      "when_to_load",
      "primary_outputs",
      "quality_gates",
      "responsibilities",
      "inputs",
      "outputs",
      "workingLogic",
      "checklist",
      "escalation",
      "doNotDo"
    ]) {
      requireArray(reporter, member, field, `member ${id}`);
    }
  }
  validateUniqueIds(reporter, members, "member");

  const workflows = requireArray(reporter, spec, "workflows", "spec");
  const workflowIds = new Set();
  for (const workflow of workflows) {
    reporter.record(isObject(workflow), "workflows entry is object");
    if (!isObject(workflow)) continue;
    const id = requireString(reporter, workflow, "id", `workflow ${workflow.id || "unknown"}`);
    requireKebab(reporter, id, `workflow.id ${id}`);
    if (id) workflowIds.add(id);
    requireString(reporter, workflow, "title", `workflow ${id}`);
    for (const field of ["triggers", "commands", "members", "quality_gates", "outputs", "stages"]) {
      requireArray(reporter, workflow, field, `workflow ${id}`);
    }
    reporter.record(["sequential", "hybrid"].includes(workflow.execution_mode), `workflow ${id} execution_mode is valid`);
    for (const memberId of workflow.members || []) {
      reporter.record(memberIds.has(memberId), `workflow ${id} references existing member: ${memberId}`);
    }
    const stageOwners = new Set();
    const stageGates = new Set();
    for (const stage of workflow.stages || []) {
      reporter.record(isObject(stage), `workflow ${id} stage is object`);
      if (!isObject(stage)) continue;
      for (const field of ["name", "owner"]) requireString(reporter, stage, field, `workflow ${id} stage`);
      if (stage.owner) {
        reporter.record(memberIds.has(stage.owner), `workflow ${id} stage owner references existing member: ${stage.owner}`);
        reporter.record((workflow.members || []).includes(stage.owner), `workflow ${id} stage owner is declared in workflow members: ${stage.owner}`);
        stageOwners.add(stage.owner);
      }
      for (const field of ["actions", "outputs", "gates"]) requireArray(reporter, stage, field, `workflow ${id} stage ${stage.name || "unknown"}`);
      for (const gate of stage.gates || []) stageGates.add(gate);
    }
    for (const memberId of workflow.members || []) {
      reporter.record(stageOwners.has(memberId), `workflow ${id} declared member owns at least one stage: ${memberId}`);
    }
    for (const gate of workflow.quality_gates || []) {
      reporter.record(stageGates.has(gate), `workflow ${id} declared gate appears in stage gates: ${gate}`);
    }
  }
  validateUniqueIds(reporter, workflows, "workflow");

  if (commands && Array.isArray(commands.items)) {
    for (const item of commands.items) {
      if (!item || !item.workflow) continue;
      reporter.record(workflowIds.has(item.workflow), `command ${item.name || "unknown"} references existing workflow: ${item.workflow}`);
    }
  }

  const docs = requireObject(reporter, spec, "docs", "spec");
  const qualityGateIds = new Set();
  if (docs) {
    for (const field of ["methodologies", "standards", "integrations", "qualityGates", "rubrics"]) {
      requireArray(reporter, docs, field, "docs");
    }
    for (const gate of docs.qualityGates || []) qualityGateIds.add(gate);
    for (const group of ["methodologies", "standards", "integrations"]) {
      for (const doc of docs[group] || []) {
        if (!isObject(doc)) continue;
        const label = `docs.${group} ${doc.path || "unknown"}`;
        const docPath = requireString(reporter, doc, "path", label);
        reporter.record(isSafeRelativePath(docPath), `${label}.path stays inside generated skill`);
        requireString(reporter, doc, "title", label);
        const sections = requireArray(reporter, doc, "sections", label);
        validateContentMap(reporter, doc.content, label, sections);
      }
    }
  }

  const templates = requireArray(reporter, spec, "templates", "spec");
  validateUniqueIds(reporter, templates, "template");
  for (const template of templates) {
    if (!isObject(template)) continue;
    requireKebab(reporter, requireString(reporter, template, "id", `template ${template.id || "unknown"}`), "template.id");
    const templatePath = requireString(reporter, template, "path", `template ${template.id || "unknown"}`);
    reporter.record(isSafeRelativePath(templatePath), `template ${template.id || "unknown"}.path stays inside generated skill`);
    requireString(reporter, template, "title", `template ${template.id || "unknown"}`);
    const sections = requireArray(reporter, template, "sections", `template ${template.id || "unknown"}`);
    validateContentMap(reporter, template.content, `template ${template.id || "unknown"}`, sections);
  }

  const domainKnowledge = requireObject(reporter, spec, "domainKnowledge", "spec");
  if (domainKnowledge) {
    for (const field of ["concepts", "methods", "evidenceChecklist", "failureModes"]) {
      validateStringList(reporter, domainKnowledge[field], `domainKnowledge.${field}`);
    }
  }

  const capabilityMatrix = requireArray(reporter, spec, "capabilityMatrix", "spec");
  for (const capability of capabilityMatrix) {
    reporter.record(isObject(capability), "capabilityMatrix entry is object");
    if (!isObject(capability)) continue;
    requireString(reporter, capability, "capability", "capabilityMatrix");
    const owner = requireString(reporter, capability, "owner", `capability ${capability.capability || "unknown"}`);
    reporter.record(memberIds.has(owner), `capability ${capability.capability || "unknown"} owner references existing member: ${owner}`);
    for (const field of ["inputs", "outputs", "gates"]) {
      validateStringList(reporter, capability[field], `capability ${capability.capability || "unknown"}.${field}`);
    }
    reporter.record(["draft", "usable", "validated"].includes(capability.maturity), `capability ${capability.capability || "unknown"} maturity is valid`);
  }

  const acceptanceScenarios = requireArray(reporter, spec, "acceptanceScenarios", "spec");
  validateUniqueIds(reporter, acceptanceScenarios, "acceptance scenario");
  for (const scenario of acceptanceScenarios) {
    reporter.record(isObject(scenario), "acceptanceScenarios entry is object");
    if (!isObject(scenario)) continue;
    const id = requireString(reporter, scenario, "id", `acceptance ${scenario.id || "unknown"}`);
    requireKebab(reporter, id, `acceptance.id ${id}`);
    requireString(reporter, scenario, "input", `acceptance ${id}`);
    for (const field of ["expectedOutputs", "mustPassGates", "failureExamples"]) {
      validateStringList(reporter, scenario[field], `acceptance ${id}.${field}`);
    }
    for (const artifact of scenario.expectedOutputs || []) {
      reporter.record(isSafeRelativePath(artifact), `acceptance ${id} expected output path stays inside generated skill: ${artifact}`);
    }
    for (const gate of scenario.mustPassGates || []) {
      reporter.record(qualityGateIds.has(gate), `acceptance ${id} references known quality gate: ${gate}`);
    }
  }

  const dataContracts = requireArray(reporter, spec, "dataContracts", "spec");
  for (const contract of dataContracts) {
    reporter.record(isObject(contract), "dataContracts entry is object");
    if (!isObject(contract)) continue;
    for (const field of ["source", "freshness", "missingDataPolicy"]) {
      requireString(reporter, contract, field, `dataContract ${contract.source || "unknown"}`);
    }
    validateStringList(reporter, contract.requiredFields, `dataContract ${contract.source || "unknown"}.requiredFields`);
    validateStringList(reporter, contract.allowedUse, `dataContract ${contract.source || "unknown"}.allowedUse`);
  }

  const externalSkills = requireObject(reporter, spec, "externalSkills", "spec");
  const externalSkillIds = new Set();
  if (externalSkills) {
    const skills = Array.isArray(externalSkills.skills) ? externalSkills.skills : [];
    reporter.record(Array.isArray(externalSkills.skills), "externalSkills.skills is array");
    for (const skillRef of skills) {
      if (!isObject(skillRef)) continue;
      const id = requireString(reporter, skillRef, "id", `external skill ${skillRef.id || "unknown"}`);
      requireKebab(reporter, id, `external skill ${id}`);
      if (id) externalSkillIds.add(id);
      for (const field of ["name", "package", "qualityTier"]) requireString(reporter, skillRef, field, `external skill ${id}`);
      requireArray(reporter, skillRef, "roles", `external skill ${id}`);
      requireArray(reporter, skillRef, "keywords", `external skill ${id}`);
      requireArray(reporter, skillRef, "useWhen", `external skill ${id}`);
      for (const role of skillRef.roles || []) {
        reporter.record(memberIds.has(role), `external skill ${id} references existing member: ${role}`);
      }
    }
    reporter.record(Array.isArray(externalSkills.roleMap), "externalSkills.roleMap is array");
    for (const roleMap of externalSkills.roleMap || []) {
      if (!isObject(roleMap)) continue;
      const role = requireString(reporter, roleMap, "role", "externalSkills.roleMap");
      reporter.record(memberIds.has(role), `roleMap references existing member: ${role}`);
      const mappedSkills = requireArray(reporter, roleMap, "skills", `roleMap ${role}`);
      for (const skillId of mappedSkills) {
        reporter.record(externalSkillIds.has(skillId), `roleMap ${role} references existing external skill: ${skillId}`);
      }
    }
    if (skills.length > 0 || externalSkills.adapters !== undefined) {
      reporter.record(Array.isArray(externalSkills.adapters), "externalSkills.adapters is array when external skills are declared");
      reporter.record(skills.length === 0 || (Array.isArray(externalSkills.adapters) && externalSkills.adapters.length > 0), "declared external skills have adapters");
      validateUniqueIds(reporter, externalSkills.adapters || [], "external skill adapter");
      for (const adapter of externalSkills.adapters || []) {
        reporter.record(isObject(adapter), "externalSkills.adapters entry is object");
        if (!isObject(adapter)) continue;
        const id = requireString(reporter, adapter, "id", `adapter ${adapter.id || "unknown"}`);
        requireKebab(reporter, id, `adapter.id ${id}`);
        const skillId = requireString(reporter, adapter, "skill", `adapter ${id}`);
        reporter.record(externalSkillIds.has(skillId), `adapter ${id} references existing external skill: ${skillId}`);
        for (const field of ["provider", "fallback", "verifyCommand"]) {
          requireString(reporter, adapter, field, `adapter ${id}`);
        }
        for (const field of ["inputSchema", "outputSchema"]) {
          validateStringList(reporter, adapter[field], `adapter ${id}.${field}`);
        }
        reporter.record(["none", "user-approval", "credential-required"].includes(adapter.auth), `adapter ${id} auth mode is valid`);
      }
    }
    requireString(reporter, externalSkills, "installPolicy", "externalSkills");
  }

  const scripts = requireObject(reporter, spec, "scripts", "spec");
  if (scripts) {
    for (const field of ["includeContextBuilder", "includeExternalSkillInstaller", "includeValidation"]) {
      requireBoolean(reporter, scripts, field, "scripts");
    }
  }

  const riskControls = requireObject(reporter, spec, "riskControls", "spec");
  if (riskControls) {
    const level = requireString(reporter, riskControls, "domainRiskLevel", "riskControls");
    reporter.record(["low", "medium", "high"].includes(level), "riskControls.domainRiskLevel is valid");
    for (const field of ["requiredDisclaimers", "blockedClaims", "evidenceRules"]) {
      const value = riskControls[field];
      const ok = Array.isArray(value);
      reporter.record(ok, `riskControls.${field} is array`);
      if (level === "high") reporter.record(isNonEmptyArray(value), `high risk requires riskControls.${field}`);
    }
  }

  const output = requireObject(reporter, spec, "output", "spec");
  if (output) {
    const outputDirectory = requireString(reporter, output, "defaultDirectory", "output");
    reporter.record(isSafeOutputDirectory(outputDirectory), "output.defaultDirectory is a safe portable directory");
    reporter.record(portablePathBasename(outputDirectory) === (skill && skill.id), "output.defaultDirectory ends with skill id");
    reporter.record(["block", "overwrite"].includes(output.overwritePolicy), "output.overwritePolicy is valid");
  }

  return reporter;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = args._[0] || args.spec;
  if (!specPath) {
    console.error("Usage: node scripts/validate-team-spec.js <spec-path>");
    process.exit(1);
  }

  const absoluteSpecPath = path.resolve(process.cwd(), specPath);
  if (!fs.existsSync(absoluteSpecPath)) {
    console.error(`Spec not found: ${absoluteSpecPath}`);
    process.exit(1);
  }

  let spec;
  try {
    spec = readJson(absoluteSpecPath);
  } catch (error) {
    console.error(`Invalid JSON: ${absoluteSpecPath} (${error.message})`);
    process.exit(1);
  }

  const reporter = validateSpec(spec);
  const failed = reporter.print();
  if (failed > 0) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  validateSpec
};
