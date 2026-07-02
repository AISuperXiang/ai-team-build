#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  commandFileName,
  ensureDir,
  kebabToTitle,
  markdownList,
  parseArgs,
  readJson,
  writeFile,
  yamlScalar,
  yamlList
} = require("./template-utils");
const { validateSpec } = require("./validate-team-spec");
const { renderScoreMarkdown, scoreSpec } = require("./score-team-spec");
const generationPlan = require("./generation-plan");
const templateEngine = require("./template-engine");

const DEFAULT_SKILLS_ROOT = process.env.AI_TEAM_BUILD_SKILLS_ROOT || path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(__dirname, "..");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function tableRow(cells) {
  return `| ${cells.map((cell) => String(cell || "").replace(/\n/g, "<br>")).join(" | ")} |`;
}

function writeJson(filePath, value) {
  writeFile(filePath, json(value));
}

function expandPortablePath(value) {
  const raw = String(value || "");
  if (raw.startsWith("<skills-root>")) {
    return path.join(DEFAULT_SKILLS_ROOT, raw.slice("<skills-root>".length));
  }
  if (raw.startsWith("$SKILLS_ROOT")) {
    return path.join(DEFAULT_SKILLS_ROOT, raw.slice("$SKILLS_ROOT".length));
  }
  return raw;
}

function portablePath(value) {
  const absolutePath = path.resolve(String(value || ""));
  const skillsRoot = path.resolve(DEFAULT_SKILLS_ROOT);
  const fromSkillsRoot = path.relative(skillsRoot, absolutePath);
  if (fromSkillsRoot && !fromSkillsRoot.startsWith("..") && !path.isAbsolute(fromSkillsRoot)) {
    return `<skills-root>/${fromSkillsRoot}`;
  }
  const fromCwd = path.relative(process.cwd(), absolutePath);
  if (!fromCwd.startsWith("..") && !path.isAbsolute(fromCwd)) return fromCwd || ".";
  return path.basename(absolutePath);
}

function commandUsage(spec, command) {
  return `${spec.commands.prefix} ${command.name}`;
}

function defaultOwner(spec) {
  const delivery = spec.members.find((member) => member.id === "delivery-manager" || member.role === "delivery");
  return delivery ? delivery.id : spec.members[0].id;
}

function safeJoin(root, relativePath) {
  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(normalized) || normalized === "." || normalized.startsWith("..") || normalized.split(path.sep).includes("..")) {
    throw new Error(`Unsafe generated path: ${relativePath}`);
  }
  return path.join(root, normalized);
}

function renderGeneratedSkillMd(spec) {
  const commandRows = spec.commands.items.map((command) => tableRow([
    `\`${commandUsage(spec, command)}\``,
    command.workflow,
    command.description,
    command.defaultOutput
  ])).join("\n");

  const memberRows = spec.members.map((member) => tableRow([
    member.name,
    `\`${member.id}\``,
    member.role,
    member.primary_outputs.join(", ")
  ])).join("\n");

  const workflowRows = spec.workflows.map((workflow) => tableRow([
    workflow.title,
    `\`workflows/${workflow.id}.md\``,
    workflow.execution_mode,
    workflow.members.join(", ")
  ])).join("\n");

  return `---
name: ${yamlScalar(spec.skill.id)}
description: ${yamlScalar(`${spec.skill.description} Use when users invoke ${spec.commands.prefix} or need ${spec.skill.domain} expert-team workflows.`)}
metadata:
  version: ${yamlScalar(spec.skill.version)}
---

# ${spec.skill.name}

## Agent 目标

\`${spec.skill.id}\` 是 ${spec.skill.domain} 专家团队编排 Skill。Agent 使用它把用户输入或 \`${spec.commands.prefix}\` 指令路由到标准工作流，并按角色完成分析、决策、执行、验证和交付。

核心价值：${spec.skill.primaryValue}

目标用户：

${markdownList(spec.skill.targetUsers)}

## 触发边界

满足以下任一情况时使用本 Skill：

- 用户输入 \`${spec.commands.prefix}\` 指令。
- 用户要求 ${spec.skill.domain} 团队协作。
- 用户要求本团队覆盖的分析、设计、执行、验证或交付工作流。

不适用场景：

- 用户只问简单知识点。
- 用户要求超出本团队风险边界的确定性承诺。
- 用户需要真实调用外部系统但未提供授权、数据来源或工具能力。

## 命令表

| 指令 | 工作流 | 说明 | 默认输出 |
| --- | --- | --- | --- |
${commandRows}

## 角色

| 角色 | ID | 类型 | 主要产出 |
| --- | --- | --- | --- |
${memberRows}

## 工作流

| 工作流 | 文件 | 执行模式 | 参与角色 |
| --- | --- | --- | --- |
${workflowRows}

## 执行循环

1. Intake：理解目标、输入、成功标准、风险边界和信息缺口。
2. Route：按 \`commands/${commandFileName(spec.commands.prefix)}.md\` 和 \`workflows/route-table.md\` 选择主工作流。
3. Load：只加载当前工作流、相关角色、质量门禁和模板。
4. Execute：按阶段产出结论、证据、风险和需决策项。
5. Validate：检查工作流门禁、证据要求和风险控制。
6. Score：读取 \`evaluation-report.md\`，结合评分短板给出升级建议。
7. Deliver：输出最终结论、证据索引、评分、风险和下一步建议。

## 风险控制

风险等级：\`${spec.riskControls.domainRiskLevel}\`

### 必须声明

${markdownList(spec.riskControls.requiredDisclaimers)}

### 禁止性承诺

${markdownList(spec.riskControls.blockedClaims)}

### 证据规则

${markdownList(spec.riskControls.evidenceRules)}

## 最终输出契约

最终回复必须包含：

- 采用的工作流。
- 参与角色。
- 已完成产出。
- 证据、数据来源或验证结果。
- 评分结论和升级建议。
- 风险、置信度和失效条件。
- 需用户决策项，最多 3 个。

## 维护规则

- 新增角色时修改 \`members/\` 并更新 \`members/README.md\`。
- 新增工作流时修改 \`workflows/\` 并更新 \`workflows/route-table.md\`。
- 新增命令时修改 \`commands/${commandFileName(spec.commands.prefix)}.md\`。
- 修改结构或契约后运行 \`npm test\`。
`;
}

function renderGeneratedReadme(spec) {
  return `# ${spec.skill.name}

\`${spec.skill.id}\` 是一个面向 Agent / IDE 的 ${spec.skill.domain} 专家团队 Skill。

核心价值：${spec.skill.primaryValue}

## 适合谁使用

${markdownList(spec.skill.targetUsers)}

## 常用入口

\`\`\`text
${spec.commands.items.map((command) => `${commandUsage(spec, command)} <输入>`).join("\n")}
\`\`\`

完整命令说明见 [commands/${commandFileName(spec.commands.prefix)}.md](commands/${commandFileName(spec.commands.prefix)}.md)。

## 目录结构

\`\`\`text
${spec.skill.id}/
├── SKILL.md
├── README.md
├── package.json
├── skill-runtime.json
├── evaluation-report.md
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
\`\`\`

## 风险边界

${markdownList(spec.riskControls.requiredDisclaimers)}

禁止性承诺：

${markdownList(spec.riskControls.blockedClaims)}

## 团队评分

评分报告见 [evaluation-report.md](evaluation-report.md)。报告包含总分、等级、维度得分、短板、升级建议和能力补齐方向。

## 验证

\`\`\`bash
npm test
\`\`\`

## 文档职责

- \`README.md\` 面向人类用户，说明这个 Skill 是什么、如何使用和如何维护。
- \`SKILL.md\` 面向 Agent，定义触发、路由、加载顺序、执行协议和输出契约。
`;
}

function renderMember(member) {
  return `---
id: ${yamlScalar(member.id)}
name: ${yamlScalar(member.name)}
role: ${yamlScalar(member.role)}
when_to_load:
${yamlList(member.when_to_load)}
primary_outputs:
${yamlList(member.primary_outputs)}
quality_gates:
${yamlList(member.quality_gates)}
---

# ${member.name}

## 职责边界

${markdownList(member.responsibilities)}

## 输入

${markdownList(member.inputs)}

## 输出

${markdownList(member.outputs)}

## 工作逻辑

${member.workingLogic.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## 可调用外部能力

${markdownList(member.externalSkills && member.externalSkills.length > 0 ? member.externalSkills : ["按需读取 external-skills/role-map.md，未授权前不安装外部 Skill。"])}

## 检查清单

${markdownList(member.checklist)}

## 升级条件

${markdownList(member.escalation)}

## 不可做事项

${markdownList(member.doNotDo)}
`;
}

function renderMembersReadme(spec) {
  const rows = spec.members.map((member) => tableRow([
    member.name,
    `\`${member.id}.md\``,
    member.role,
    member.primary_outputs.join(", ")
  ])).join("\n");

  return `# Members

本目录维护 ${spec.skill.name} 的专家团队成员定义。工作流只加载它声明需要的成员文件，避免一次性加载全部角色上下文。

## 成员文件约定

每个成员文件必须包含 YAML frontmatter：\`id\`、\`name\`、\`role\`、\`when_to_load\`、\`primary_outputs\`、\`quality_gates\`。

## 当前成员

| 成员 | 文件 | 角色域 | 主要产出 |
| --- | --- | --- | --- |
${rows}
`;
}

function renderWorkflow(workflow) {
  const stageRows = workflow.stages.map((stage) => tableRow([
    stage.name,
    stage.owner,
    stage.actions.join("<br>"),
    stage.outputs.join("<br>"),
    stage.gates.join(", ")
  ])).join("\n");

  return `---
id: ${yamlScalar(workflow.id)}
title: ${yamlScalar(workflow.title)}
triggers:
${yamlList(workflow.triggers)}
commands:
${yamlList(workflow.commands)}
members:
${yamlList(workflow.members)}
execution_mode: ${yamlScalar(workflow.execution_mode)}
quality_gates:
${yamlList(workflow.quality_gates)}
outputs:
${yamlList(workflow.outputs)}
---

# ${workflow.title}

## 适用场景

${markdownList(workflow.triggers)}

## 阶段表

| 阶段 | 负责人 | 动作 | 产出 | 门禁 |
| --- | --- | --- | --- | --- |
${stageRows}

## 完成定义

- 所有阶段产出已形成。
- 工作流门禁已检查。
- 结论带证据、风险、置信度和需决策项。
`;
}

function renderWorkflowsReadme(spec) {
  const rows = spec.workflows.map((workflow) => tableRow([
    workflow.title,
    `\`${workflow.id}.md\``,
    workflow.execution_mode,
    workflow.outputs.join(", ")
  ])).join("\n");

  return `# Workflows

本目录维护 ${spec.skill.name} 的标准工作流。

| 工作流 | 文件 | 执行模式 | 默认产出 |
| --- | --- | --- | --- |
${rows}
`;
}

function renderRouteTable(spec) {
  const rows = spec.workflows.map((workflow, index) => tableRow([
    index === 0 ? "P0" : "P1",
    workflow.triggers.join("、"),
    workflow.title,
    `\`workflows/${workflow.id}.md\``,
    workflow.commands[0] || spec.commands.prefix
  ])).join("\n");

  return `# 工作流路由表

按优先级从上到下匹配。若多个规则命中，选择更具体的工作流；若仍冲突，由交付经理或主协调角色说明原因并选择主工作流。

| 优先级 | 触发输入 | 工作流 | 文件 | 默认命令 |
| --- | --- | --- | --- | --- |
${rows}

## 路由规则

1. 明确有 \`${spec.commands.prefix}\` 命令时，优先按 \`commands/${commandFileName(spec.commands.prefix)}.md\` 的命令映射。
2. 没有命令时，按用户意图和关键词匹配本表。
3. 工作流执行前必须读取 \`workflows/execution-protocol.md\`。
4. 无法路由时，给出最多 3 个候选工作流并询问用户。
`;
}

function renderExecutionProtocol(spec) {
  return `# Execution Protocol

## 执行状态

所有工作流都应维护状态板：

| 阶段 | 负责人 | 状态 | 当前产出 | 门禁 |
| --- | --- | --- | --- | --- |

状态使用 \`pending\`、\`in_progress\`、\`blocked\`、\`review\`、\`completed\`。

## 通用步骤

1. Intake：明确目标、输入、成功标准、风险和缺口。
2. Route：选择一个主工作流。
3. Load：只加载当前阶段需要的成员文件、模板和门禁。
4. Execute：按阶段推进。
5. Validate：检查门禁、证据和风险。
6. Score：按 \`evaluation-report.md\` 输出评分、短板和升级建议。
7. Deliver：输出结论、证据、评分、风险和下一步。

## 风险要求

${markdownList(spec.riskControls.requiredDisclaimers)}

禁止性承诺：

${markdownList(spec.riskControls.blockedClaims)}
`;
}

function renderCommand(spec) {
  const owner = defaultOwner(spec);
  const rows = spec.commands.items.map((command) => tableRow([
    `\`${commandUsage(spec, command)} <输入>\``,
    command.workflow,
    `\`workflows/${command.workflow}.md\``,
    command.requiredInput,
    command.defaultOutput
  ])).join("\n");

  return `---
id: ${yamlScalar(commandFileName(spec.commands.prefix))}
title: ${yamlScalar(`${spec.commands.prefix} 快捷指令`)}
triggers:
${yamlList([spec.commands.prefix])}
members:
${yamlList([owner])}
execution_mode: ${yamlScalar("sequential")}
---

# ${spec.commands.prefix} 快捷指令

## 命令表

| 指令 | 工作流 | 文件 | 必需输入 | 默认输出 |
| --- | --- | --- | --- | --- |
${rows}

## 自然语言触发

用户要求 ${spec.skill.domain} 团队协作、分析、执行、验证或交付时，可映射到 \`${spec.commands.prefix}\` 指令。

## 执行要求

1. 解析指令后读取目标工作流。
2. 读取 \`workflows/execution-protocol.md\`。
3. 建立状态板。
4. 加载工作流声明的成员文件。
5. 按阶段执行并检查质量门禁、证据和风险边界。

## 失败处理

- 指令缺少输入：要求用户补充目标、上下文或数据来源。
- 指令未知：展示命令表并推荐最近似命令。
- 输入同时匹配多个工作流：优先选择命令指定工作流。
- 高风险领域缺少证据或风险边界：阻断交付，不输出确定性结论。
`;
}

function renderCommandsReadme(spec) {
  return `# Commands

本目录维护 ${spec.skill.name} 的 Slash 指令。

主入口：\`${spec.commands.prefix}\`

详细说明见 [${commandFileName(spec.commands.prefix)}.md](${commandFileName(spec.commands.prefix)}.md)。
`;
}

function renderDocsReadme(spec) {
  return `# Docs

本目录维护 ${spec.skill.name} 的方法论、标准、集成契约、质量门禁和评分规则。

## 质量文件

- \`quality-gates.md\`
- \`quality-rubrics.md\`
- \`handoff-contract.md\`
- \`capability-matrix.md\`
- \`acceptance-scenarios.md\`
- \`integrations/data-contracts.md\`

## 风险边界

${markdownList(spec.riskControls.requiredDisclaimers)}
`;
}

function renderQualityGates(spec) {
  return `# Quality Gates

## 通用门禁

${markdownList(spec.docs.qualityGates)}

## 风险声明

${markdownList(spec.riskControls.requiredDisclaimers)}

## 禁止性承诺

${markdownList(spec.riskControls.blockedClaims)}

## 证据规则

${markdownList(spec.riskControls.evidenceRules)}
`;
}

function renderQualityRubrics(spec) {
  return `# Quality Rubrics

## 评分维度

${markdownList(spec.docs.rubrics)}

## 通过阈值

- 结论必须带证据来源、置信度、反向证据和失效条件。
- 高风险输出必须通过免责声明、禁止性承诺和人工复核检查。
- 方法论文档和交付模板不得为空壳，不得仅保留待补齐占位。
- A 级团队必须包含验收场景、数据契约和能力矩阵。

## 高风险输出要求

${markdownList(spec.riskControls.requiredDisclaimers)}

${markdownList(spec.riskControls.blockedClaims)}

${markdownList(spec.riskControls.evidenceRules)}
`;
}

function renderHandoffContract() {
  return `# Handoff Contract

## 强制交接规则

角色切换时必须交接：

- 背景
- 当前阶段
- 已确认决策
- 待确认问题
- 风险
- 产出物
- 验证或证据

## 子 Agent 输出契约

| 字段 | 要求 |
| --- | --- |
| 结论 | 通过、修改后通过、不通过或需用户决策 |
| 证据 | 文档、命令、截图、数据来源或人工验收依据 |
| 风险 | 影响、概率、严重级别、缓解动作和责任角色 |
| 置信度 | 高 / 中 / 低，并说明不确定来源 |
| 需决策项 | 最多 3 个 |
`;
}

function renderWorkflowStatus(spec) {
  const stages = spec.workflows.flatMap((workflow) => workflow.stages.map((stage) => ({
    name: `${workflow.title} / ${stage.name}`,
    owner: stage.owner,
    status: "pending",
    gates: stage.gates,
    artifacts: stage.outputs,
    evidence: []
  })));
  return {
    workflow: "",
    requirementFolder: "",
    complexityLevel: "S",
    updatedAt: "",
    stages
  };
}

function renderExternalSkillsReadme(spec) {
  return `# External Skills

本目录维护 ${spec.skill.name} 可推荐的外部 Skill。

安装外部能力前必须读取：

- \`catalog.json\`
- \`adapters.json\`
- \`install-policy.md\`
- \`role-map.md\`

\`adapters.json\` 记录外部能力的输入、输出、授权、降级和验证命令。未获得用户明确授权前，不安装外部 Skill。
`;
}

function renderRoleMap(spec) {
  const rows = spec.externalSkills.roleMap.map((entry) => tableRow([
    entry.role,
    entry.skills.join(", ")
  ])).join("\n");

  return `# External Skill Role Map

| 角色 | 可用外部 Skill |
| --- | --- |
${rows || "| - | - |"}
`;
}

function renderExternalCliReadme(spec) {
  return `# External CLI

本目录用于登记 ${spec.skill.name} 可使用的本地 CLI 能力。

只记录能力摘要、适用角色、验证方式和安全边界；不得记录密钥、Cookie、Token 或个人凭证。
`;
}

function renderWorkspaceReadme(spec) {
  return `# Workspace

本目录用于保存 ${spec.skill.name} 的过程产物、证据、决策和交付摘要。

代码或真实业务变更应发生在用户指定项目中；workspace 只保存过程材料。

建议结构：

\`\`\`text
workspace/
└── YYYYMMDD-short-task-slug/
    ├── README.md
    ├── workflow-status.json
    ├── decision-log.md
    ├── risk-register.md
    ├── delivery-summary.md
    └── evidence/
\`\`\`
`;
}

function baseSchema(title, required, properties) {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    title,
    type: "object",
    required,
    properties,
    additionalProperties: true
  };
}

function stringArraySchema() {
  return {
    type: "array",
    minItems: 1,
    items: {
      type: "string",
      minLength: 1
    }
  };
}

function renderMemberSchema(title) {
  return baseSchema(title, ["id", "name", "role", "when_to_load", "primary_outputs", "quality_gates"], {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    name: { type: "string", minLength: 1 },
    role: { type: "string", minLength: 1 },
    when_to_load: stringArraySchema(),
    primary_outputs: stringArraySchema(),
    quality_gates: stringArraySchema()
  });
}

function renderWorkflowSchema(title) {
  return baseSchema(title, ["id", "title", "triggers", "commands", "members", "execution_mode", "quality_gates", "outputs"], {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    title: { type: "string", minLength: 1 },
    triggers: stringArraySchema(),
    commands: stringArraySchema(),
    members: stringArraySchema(),
    execution_mode: { type: "string", enum: ["sequential", "hybrid"] },
    quality_gates: stringArraySchema(),
    outputs: stringArraySchema()
  });
}

function renderCommandSchema(title) {
  return baseSchema(title, ["id", "title", "triggers", "members", "execution_mode"], {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    triggers: stringArraySchema(),
    members: stringArraySchema(),
    execution_mode: { type: "string", enum: ["sequential", "hybrid"] }
  });
}

function renderStatusSchema(title) {
  return baseSchema(title, ["workflow", "requirementFolder", "complexityLevel", "updatedAt", "stages"], {
    workflow: { type: "string" },
    requirementFolder: { type: "string" },
    complexityLevel: { type: "string", enum: ["S", "M", "L", "XL"] },
    updatedAt: { type: "string" },
    stages: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "owner", "status", "gates", "artifacts", "evidence"],
        properties: {
          name: { type: "string", minLength: 1 },
          owner: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["pending", "in_progress", "blocked", "review", "completed"] },
          gates: stringArraySchema(),
          artifacts: stringArraySchema(),
          evidence: { type: "array", items: { type: "string" } }
        },
        additionalProperties: true
      }
    }
  });
}

function renderRuntimeSchema(title) {
  return baseSchema(title, ["schemaVersion", "skill", "runtime", "entrypoints", "install"], {
    schemaVersion: { type: "string", minLength: 1 },
    skill: { type: "object" },
    runtime: { type: "object" },
    entrypoints: { type: "object" },
    install: { type: "object" }
  });
}

function renderGeneratedValidateStructureScript(spec) {
  const expectedMembers = spec.members.map((member) => `members/${member.id}.md`);
  const expectedWorkflows = spec.workflows.map((workflow) => `workflows/${workflow.id}.md`);
  const commandFile = `commands/${commandFileName(spec.commands.prefix)}.md`;
  const expectedFiles = [
    "SKILL.md",
    "README.md",
    "evaluation-report.md",
    "package.json",
    "skill-runtime.json",
    "commands/README.md",
    commandFile,
    "docs/README.md",
    "docs/quality-gates.md",
    "docs/quality-rubrics.md",
    "docs/handoff-contract.md",
    "docs/capability-matrix.md",
    "docs/acceptance-scenarios.md",
    "docs/integrations/data-contracts.md",
    "members/README.md",
    "workflows/README.md",
    "workflows/route-table.md",
    "workflows/execution-protocol.md",
    "external-skills/README.md",
    "external-skills/catalog.json",
    "external-skills/adapters.json",
    "external-skills/install-policy.md",
    "external-skills/role-map.md",
    "external-cli/README.md",
    "workspace/README.md",
    "scripts/run-acceptance-scenarios.js",
    "generation-report.json",
    ...expectedMembers,
    ...expectedWorkflows
  ];

  return `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const requiredDirs = ${json([
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
    "workflows",
    "workspace"
  ])};
const requiredFiles = ${json(expectedFiles)};
const results = [];
function record(ok, message) { results.push({ ok, message }); }
function existsFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
}
function existsDir(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
}
for (const dir of requiredDirs) record(existsDir(dir), "required directory exists: " + dir);
for (const file of requiredFiles) record(existsFile(file), "required file exists: " + file);
const failed = results.filter((result) => !result.ok);
for (const result of results) console.log((result.ok ? "PASS" : "FAIL") + " " + result.message);
if (failed.length > 0) {
  console.error("\\n" + failed.length + " structure validation check(s) failed.");
  process.exit(1);
}
console.log("\\nAll " + results.length + " structure validation checks passed.");
`;
}

function renderGeneratedValidateContractsScript(spec) {
  return `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const riskControls = ${json(spec.riskControls)};
const results = [];
function record(ok, message) { results.push({ ok, message }); }
function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), "utf8"); }
function parseJson(relativePath) {
  try { return JSON.parse(read(relativePath)); }
  catch (error) { record(false, relativePath + " is valid JSON (" + error.message + ")"); return null; }
}
function listMarkdownFiles(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir).filter((file) => file.endsWith(".md")).map((file) => path.join(relativeDir, file));
}
function parseFrontmatter(content) {
  const lines = content.split(/\\r?\\n/);
  if (lines[0] !== "---") return null;
  const data = {};
  let currentKey = null;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") break;
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      data[currentKey] = keyMatch[2].trim() === "" ? [] : keyMatch[2].trim().replace(/^[\\"']|[\\"']$/g, "");
      continue;
    }
    const arrayMatch = line.match(/^\\s+-\\s+(.+)$/);
    if (arrayMatch && currentKey && Array.isArray(data[currentKey])) data[currentKey].push(arrayMatch[1].trim());
  }
  return data;
}
function parseStageRows(content) {
  const rows = [];
  for (const line of content.split(/\\r?\\n/)) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---") || line.includes("阶段 | 负责人")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    rows.push({
      owner: cells[1],
      gates: cells[4].split(/[,，]/).map((gate) => gate.trim()).filter(Boolean)
    });
  }
  return rows;
}
function hasHollowContent(content) {
  if (content.includes("待执行时按当前团队上下文补齐") || content.includes("尚未声明")) return true;
  return content.split(/\\r?\\n/).some((line) => line.trim() === "-");
}
function schemaIsDeep(schema) {
  return schema && Array.isArray(schema.required) && schema.required.length > 0 && schema.properties && Object.keys(schema.properties).length > 0;
}
function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(absolutePath, files);
    else if (entry.isFile() && [".md", ".json", ".js"].includes(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}
const readme = read("README.md");
const skill = read("SKILL.md");
record(readme.includes("面向人类用户"), "README states human-facing responsibility");
record(skill.includes("Agent"), "SKILL states Agent-facing responsibility");
const allRiskText = [skill, read("docs/quality-gates.md"), read("docs/quality-rubrics.md")].join("\\n");
for (const item of riskControls.requiredDisclaimers || []) record(allRiskText.includes(item), "risk disclaimer present: " + item);
for (const item of riskControls.blockedClaims || []) record(allRiskText.includes(item), "blocked claim present: " + item);
for (const item of riskControls.evidenceRules || []) record(allRiskText.includes(item), "evidence rule present: " + item);
for (const workflowFile of listMarkdownFiles("workflows").filter((file) => !file.endsWith("README.md") && !file.endsWith("route-table.md") && !file.endsWith("execution-protocol.md"))) {
  const content = read(workflowFile);
  const data = parseFrontmatter(content);
  const stageRows = parseStageRows(content);
  record(Boolean(data), workflowFile + " has frontmatter");
  record(stageRows.length > 0, workflowFile + " has executable stage rows");
  const stageOwners = new Set(stageRows.map((row) => row.owner));
  const stageGates = new Set(stageRows.flatMap((row) => row.gates));
  for (const member of (data && data.members) || []) record(stageOwners.has(member), workflowFile + " declared member owns a stage: " + member);
  for (const gate of (data && data.quality_gates) || []) record(stageGates.has(gate), workflowFile + " declared quality gate appears in stage rows: " + gate);
}
for (const file of [
  ...listMarkdownFiles("docs/methodologies"),
  ...listMarkdownFiles("docs/engineering-standards"),
  ...listMarkdownFiles("docs/integrations"),
  ...listMarkdownFiles("assets/templates")
]) {
  if (file.endsWith("workflow-status.json")) continue;
  record(!hasHollowContent(read(file)), file + " has non-hollow generated content");
}
for (const schemaFile of [
  "schemas/member.schema.json",
  "schemas/workflow.schema.json",
  "schemas/command.schema.json",
  "schemas/status.schema.json",
  "schemas/skill-runtime.schema.json"
]) {
  record(schemaIsDeep(parseJson(schemaFile)), schemaFile + " has required fields and properties");
}
const adapters = parseJson("external-skills/adapters.json");
const catalog = parseJson("external-skills/catalog.json");
const catalogSkillIds = new Set(((catalog && catalog.skills) || []).map((item) => item.id));
for (const adapter of ((adapters && adapters.adapters) || [])) {
  record(Boolean(adapter.id), "adapter has id: " + (adapter.id || "unknown"));
  record(catalogSkillIds.has(adapter.skill), "adapter " + (adapter.id || "unknown") + " references catalog skill: " + (adapter.skill || "unknown"));
  record(Boolean(adapter.provider), "adapter " + (adapter.id || "unknown") + " has provider");
  record(Array.isArray(adapter.inputSchema) && adapter.inputSchema.length > 0, "adapter " + (adapter.id || "unknown") + " has inputSchema");
  record(Array.isArray(adapter.outputSchema) && adapter.outputSchema.length > 0, "adapter " + (adapter.id || "unknown") + " has outputSchema");
  record(Boolean(adapter.auth), "adapter " + (adapter.id || "unknown") + " has auth");
  record(Boolean(adapter.fallback), "adapter " + (adapter.id || "unknown") + " has fallback");
  record(Boolean(adapter.verifyCommand), "adapter " + (adapter.id || "unknown") + " has verifyCommand");
}
for (const file of collectFiles(ROOT)) {
  const relativePath = path.relative(ROOT, file);
  const content = fs.readFileSync(file, "utf8");
  record(!content.includes(String.fromCharCode(123, 123)), relativePath + " has no unresolved template opener");
  record(!content.includes(String.fromCharCode(125, 125)), relativePath + " has no unresolved template closer");
}
const failed = results.filter((result) => !result.ok);
for (const result of results) console.log((result.ok ? "PASS" : "FAIL") + " " + result.message);
if (failed.length > 0) {
  console.error("\\n" + failed.length + " contract validation check(s) failed.");
  process.exit(1);
}
console.log("\\nAll " + results.length + " contract validation checks passed.");
`;
}

function renderListExternalSkillsScript() {
  return `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const catalogPath = path.resolve(__dirname, "..", "external-skills", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const args = process.argv.slice(2);
const roleIndex = args.indexOf("--role");
const queryIndex = args.indexOf("--query");
const role = roleIndex >= 0 ? args[roleIndex + 1] : "";
const query = queryIndex >= 0 ? args[queryIndex + 1] : "";
const normalizedQuery = String(query || "").toLowerCase();
const skills = (catalog.skills || []).filter((skill) => {
  const roleMatched = role ? (skill.roles || []).includes(role) : true;
  const queryMatched = normalizedQuery
    ? [skill.id, skill.name, ...(skill.keywords || [])].join(" ").toLowerCase().includes(normalizedQuery)
    : true;
  return roleMatched && queryMatched;
});
for (const skill of skills) {
  console.log([skill.id, skill.qualityTier, skill.package].join("\\t"));
}
`;
}

function renderInstallExternalSkillsScript() {
  return `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const catalogPath = path.resolve(__dirname, "..", "external-skills", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const target = args.find((arg) => !arg.startsWith("--"));
const skills = (catalog.skills || []).filter((skill) => target ? skill.id === target : skill.qualityTier === "recommended");
if (skills.length === 0) {
  console.error("No external skills matched.");
  process.exit(1);
}
for (const skill of skills) {
  const command = "npx skills add " + skill.package + " -g -y";
  console.log((dryRun ? "DRY-RUN " : "INSTALL ") + command);
}
if (!dryRun) {
  console.log("Installation is intentionally not executed by this generated helper. Run the printed commands after user approval.");
}
`;
}

function renderBuildContextScript(spec) {
  return `#!/usr/bin/env node
console.log("${spec.skill.id}:buildContext:start");
console.log("This generated context builder is a placeholder. Extend it with project-specific scanning rules before relying on it.");
console.log("${spec.skill.id}:buildContext:end");
`;
}

function renderPackageJson(spec) {
  return {
    name: spec.skill.id,
    version: spec.skill.version,
    description: spec.skill.description,
    engines: {
      node: ">=18"
    },
    scripts: {
      validate: "node scripts/validate-structure.js",
      "validate:structure": "node scripts/validate-structure.js",
      "validate:contracts": "node scripts/validate-contracts.js",
      acceptance: "node scripts/run-acceptance-scenarios.js .",
      "skills:list": "node scripts/list-external-skills.js",
      "skills:install": "node scripts/install-external-skills.js",
      test: "npm run validate:structure && npm run validate:contracts && npm run acceptance"
    },
    license: "MIT"
  };
}

function renderRuntime(spec, commandFile) {
  return {
    $schema: "./schemas/skill-runtime.schema.json",
    schemaVersion: "1.0.0",
    skill: {
      id: spec.skill.id,
      name: spec.skill.name,
      version: spec.skill.version,
      entry: "SKILL.md",
      description: spec.skill.description
    },
    runtime: {
      node: ">=18",
      packageManager: "npm",
      requiredCommands: ["node", "npm"],
      optionalCommands: ["npx", "git"],
      environmentVariables: []
    },
    entrypoints: {
      skill: "SKILL.md",
      readme: "README.md",
      commands: commandFile,
      validation: "scripts/validate-structure.js"
    },
    install: {
      packageName: spec.skill.id,
      supportedTargets: ["trae", "codex", "claude", "generic-agent"],
      postInstall: ["npm test"],
      requiredFiles: [
        "SKILL.md",
        "README.md",
        "evaluation-report.md",
        "package.json",
        "skill-runtime.json",
        "members/",
        "workflows/",
        "commands/",
        "docs/",
        "external-cli/",
        "external-skills/",
        "schemas/",
        "assets/templates/",
        "scripts/"
      ],
      methods: [
        {
          id: "current-directory",
          label: "Use this generated directory",
          command: "npm test",
          verify: "npm test"
        },
        {
          id: "manual-copy",
          label: "Manual directory copy",
          instructions: [
            "Copy the generated skill directory into your agent skills root using your platform's file manager or deployment tool.",
            "Run npm test from the copied directory before registering the skill."
          ],
          verify: "npm test"
        }
      ]
    },
    agentHints: {
      readOrder: [
        "SKILL.md",
        commandFile,
        "workflows/route-table.md",
        "workflows/execution-protocol.md"
      ],
      environmentPolicy: "Run Node scripts from the skill root. Core workflows must not require credentials or external services.",
      externalSkillPolicy: "Only install external skills from external-skills/catalog.json after explicit user instruction or approval."
    },
    privacy: {
      portable: true,
      omitLocalSkillNames: true,
      policy: "Do not store environment-specific, locally downloaded, private, or company-internal skill names in this runtime file."
    }
  };
}

function createStandardDirs(outputDir) {
  for (const dir of [
    "assets/templates",
    "commands",
    "docs/methodologies",
    "docs/engineering-standards",
    "docs/integrations",
    "external-cli",
    "external-skills",
    "members",
    "schemas",
    "scripts",
    "workflows",
    "workspace"
  ]) {
    ensureDir(path.join(outputDir, dir));
  }
}

function writeGeneratedSkill(spec, outputDir, options) {
  createStandardDirs(outputDir);

  const commandFile = `commands/${commandFileName(spec.commands.prefix)}.md`;
  const score = scoreSpec(spec);
  const writeRelative = (relativePath, content) => writeFile(safeJoin(outputDir, relativePath), content);
  const writeRelativeJson = (relativePath, value) => writeJson(safeJoin(outputDir, relativePath), value);

  writeRelative("SKILL.md", renderGeneratedSkillMd(spec));
  writeRelative("README.md", renderGeneratedReadme(spec));
  writeRelative("evaluation-report.md", renderScoreMarkdown(spec, score));
  writeRelativeJson("package.json", renderPackageJson(spec));
  writeRelativeJson("skill-runtime.json", renderRuntime(spec, commandFile));

  writeRelative("members/README.md", renderMembersReadme(spec));
  for (const member of spec.members) {
    writeRelative(`members/${member.id}.md`, renderMember(member));
  }

  writeRelative("commands/README.md", renderCommandsReadme(spec));
  writeRelative(commandFile, renderCommand(spec));

  writeRelative("workflows/README.md", renderWorkflowsReadme(spec));
  writeRelative("workflows/route-table.md", renderRouteTable(spec));
  writeRelative("workflows/execution-protocol.md", renderExecutionProtocol(spec));
  for (const workflow of spec.workflows) {
    writeRelative(`workflows/${workflow.id}.md`, renderWorkflow(workflow));
  }

  writeRelative("docs/README.md", renderDocsReadme(spec));
  writeRelative("docs/quality-gates.md", renderQualityGates(spec));
  writeRelative("docs/quality-rubrics.md", renderQualityRubrics(spec));
  writeRelative("docs/handoff-contract.md", renderHandoffContract(spec));
  writeRelative("docs/capability-matrix.md", templateEngine.renderCapabilityMatrix(spec));
  writeRelative("docs/acceptance-scenarios.md", templateEngine.renderAcceptanceScenarios(spec));
  writeRelative("docs/integrations/data-contracts.md", templateEngine.renderDataContracts(spec));
  for (const doc of spec.docs.methodologies) {
    writeRelative(doc.path, templateEngine.renderDoc(doc));
  }
  for (const doc of spec.docs.standards) {
    writeRelative(doc.path, templateEngine.renderDoc(doc));
  }
  for (const doc of spec.docs.integrations) {
    writeRelative(doc.path, templateEngine.renderDoc(doc));
  }

  for (const template of spec.templates) {
    writeRelative(generationPlan.relativeTemplatePath(template), templateEngine.renderTemplateArtifact(template));
  }
  writeRelativeJson("assets/templates/workflow-status.json", renderWorkflowStatus(spec));

  writeRelative("external-skills/README.md", renderExternalSkillsReadme(spec));
  writeRelativeJson("external-skills/catalog.json", {
    version: spec.skill.version,
    updatedAt: today(),
    skills: spec.externalSkills.skills
  });
  writeRelativeJson("external-skills/adapters.json", {
    version: spec.skill.version,
    updatedAt: today(),
    adapters: spec.externalSkills.adapters || []
  });
  writeRelative("external-skills/install-policy.md", `# Install Policy\n\n${spec.externalSkills.installPolicy}\n\n未获得用户明确授权前，不安装外部 Skill。`);
  writeRelative("external-skills/role-map.md", renderRoleMap(spec));
  writeRelative("external-cli/README.md", renderExternalCliReadme(spec));
  writeRelative("workspace/README.md", renderWorkspaceReadme(spec));

  writeRelativeJson("schemas/member.schema.json", renderMemberSchema(`${spec.skill.name} Member`));
  writeRelativeJson("schemas/workflow.schema.json", renderWorkflowSchema(`${spec.skill.name} Workflow`));
  writeRelativeJson("schemas/command.schema.json", renderCommandSchema(`${spec.skill.name} Command`));
  writeRelativeJson("schemas/status.schema.json", renderStatusSchema(`${spec.skill.name} Status`));
  writeRelativeJson("schemas/skill-runtime.schema.json", renderRuntimeSchema(`${spec.skill.name} Runtime`));

  writeRelative("scripts/validate-structure.js", renderGeneratedValidateStructureScript(spec));
  writeRelative("scripts/validate-contracts.js", renderGeneratedValidateContractsScript(spec));
  writeRelative("scripts/run-acceptance-scenarios.js", fs.readFileSync(path.join(__dirname, "run-acceptance-scenarios.js"), "utf8"));
  writeRelative("scripts/list-external-skills.js", renderListExternalSkillsScript(spec));
  writeRelative("scripts/install-external-skills.js", renderInstallExternalSkillsScript(spec));
  if (spec.scripts.includeContextBuilder) {
    writeRelative("scripts/build-context.js", renderBuildContextScript(spec));
  }

  const report = {
    generator: "ai-team-build",
    generatedAt: new Date().toISOString(),
    specSource: portablePath(options.specPath),
    outputPath: portablePath(outputDir),
    dryRun: Boolean(options.dryRun),
    skill: spec.skill,
    commandFile,
    counts: generationPlan.generationCounts(spec),
    evaluation: {
      totalScore: score.totalScore,
      grade: score.grade,
      gradeScore: score.gradeScore,
      gradeBlockers: score.gradeBlockers,
      reportPath: "evaluation-report.md",
      decisionAdvice: score.decisionAdvice,
      upgradeOpportunityCount: score.upgradeOpportunities.length
    },
    riskControls: spec.riskControls,
    acceptanceScenarios: spec.acceptanceScenarios || [],
    dataContracts: spec.dataContracts || [],
    capabilityMatrix: spec.capabilityMatrix || [],
    plannedFiles: generationPlan.plannedFilesForSpec(spec)
  };
  writeRelativeJson("generation-report.json", report);
  return report;
}

function resolveOutputPath(spec, args) {
  const rawOutput = expandPortablePath(args.output || spec.output.defaultDirectory || path.join(DEFAULT_SKILLS_ROOT, spec.skill.id));
  return path.resolve(process.cwd(), rawOutput);
}

function isSameOrAncestor(candidate, target) {
  const relativePath = path.relative(candidate, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function assertSafeOutputPath(outputDir, skillId) {
  const resolved = path.resolve(outputDir);
  const filesystemRoot = path.parse(resolved).root;
  const blockedPaths = [
    filesystemRoot,
    os.homedir(),
    REPO_ROOT,
    path.resolve(DEFAULT_SKILLS_ROOT)
  ].map((item) => path.resolve(item));

  if (blockedPaths.includes(resolved) || isSameOrAncestor(resolved, REPO_ROOT)) {
    throw new Error(`Refusing unsafe output directory: ${resolved}`);
  }
  if (path.basename(resolved) !== skillId) {
    throw new Error(`Output directory must end with skill id "${skillId}": ${resolved}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = args.spec || args._[0];
  if (!specPath) {
    console.error("Usage: node scripts/generate-team-skill.js --spec <team-spec.json> [--output <dir>] [--dry-run] [--overwrite]");
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
    console.error(`Invalid spec JSON: ${error.message}`);
    process.exit(1);
  }

  const reporter = validateSpec(spec);
  if (reporter.failedCount() > 0) {
    reporter.print();
    process.exit(1);
  }

  const outputDir = resolveOutputPath(spec, args);
  try {
    assertSafeOutputPath(outputDir, spec.skill.id);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (args["dry-run"]) {
    console.log(JSON.stringify(generationPlan.buildGenerationPlan(spec, outputDir, absoluteSpecPath, { dryRun: true }), null, 2));
    return;
  }

  const allowOverwrite = Boolean(args.overwrite) || spec.output.overwritePolicy === "overwrite";
  if (fs.existsSync(outputDir)) {
    if (!allowOverwrite) {
      console.error(`Output directory already exists: ${outputDir}. Pass --overwrite to replace it.`);
      process.exit(1);
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  const report = writeGeneratedSkill(spec, outputDir, {
    dryRun: Boolean(args["dry-run"]),
    specPath: absoluteSpecPath
  });

  console.log(`Generated ${spec.skill.id} at ${outputDir}`);
  console.log(`Members: ${report.counts.members}`);
  console.log(`Workflows: ${report.counts.workflows}`);
  console.log(`Commands: ${report.counts.commands}`);
  console.log(`Dry run: ${report.dryRun}`);
}

if (require.main === module) main();
