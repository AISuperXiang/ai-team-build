#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs, readJson } = require("./template-utils");

function points(condition, value) {
  return condition ? value : 0;
}

function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

function findCoordinator(spec) {
  return (spec.members || []).find((member) => {
    const haystack = [member.id, member.role, member.name, ...(member.primary_outputs || [])].join(" ").toLowerCase();
    return /delivery|coordinator|workflow|交付|协调|流程|项目/.test(haystack);
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function workflowMemberCoverage(spec) {
  const memberIds = new Set((spec.members || []).map((member) => member.id));
  const refs = (spec.workflows || []).flatMap((workflow) => workflow.members || []);
  if (refs.length === 0) return 0;
  const validRefs = refs.filter((member) => memberIds.has(member));
  return validRefs.length / refs.length;
}

function commandWorkflowCoverage(spec) {
  const workflowIds = new Set((spec.workflows || []).map((workflow) => workflow.id));
  const commands = (spec.commands && spec.commands.items) || [];
  if (commands.length === 0) return 0;
  const validCommands = commands.filter((command) => workflowIds.has(command.workflow));
  return validCommands.length / commands.length;
}

function workflowStageQuality(spec) {
  const workflows = spec.workflows || [];
  if (workflows.length === 0) return 0;
  const complete = workflows.filter((workflow) => {
    return Array.isArray(workflow.stages) && workflow.stages.length > 0 &&
      workflow.stages.every((stage) => {
        return stage.name && stage.owner &&
          Array.isArray(stage.actions) && stage.actions.length > 0 &&
          Array.isArray(stage.outputs) && stage.outputs.length > 0 &&
          Array.isArray(stage.gates) && stage.gates.length > 0;
      });
  });
  return complete.length / workflows.length;
}

function hasCommandNamed(spec, name) {
  return Boolean(spec.commands && Array.isArray(spec.commands.items) && spec.commands.items.some((command) => command.name === name));
}

function allDocs() {
  const docs = arguments[0] || {};
  return [
    ...(docs.methodologies || []),
    ...(docs.standards || []),
    ...(docs.integrations || [])
  ];
}

function hasContentForEverySection(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((item) => {
    return Array.isArray(item.sections) && item.sections.length > 0 &&
      item.content &&
      item.sections.every((section) => Array.isArray(item.content[section]) && item.content[section].length > 0);
  });
}

function workflowConsistency(spec) {
  const workflows = spec.workflows || [];
  if (workflows.length === 0) return 0;
  const consistent = workflows.filter((workflow) => {
    const stageOwners = new Set((workflow.stages || []).map((stage) => stage.owner));
    const stageGates = new Set((workflow.stages || []).flatMap((stage) => stage.gates || []));
    const memberCoverage = (workflow.members || []).every((member) => stageOwners.has(member));
    const gateCoverage = (workflow.quality_gates || []).every((gate) => stageGates.has(gate));
    return memberCoverage && gateCoverage;
  });
  return consistent.length / workflows.length;
}

function buildDimension(id, name, maxScore, score, evidence, improvements) {
  return {
    id,
    name,
    maxScore,
    score: Math.min(maxScore, score),
    evidence,
    improvements
  };
}

function scoreSpec(spec) {
  const members = spec.members || [];
  const workflows = spec.workflows || [];
  const commands = (spec.commands && spec.commands.items) || [];
  const docs = spec.docs || {};
  const templates = spec.templates || [];
  const externalSkills = spec.externalSkills || { skills: [], roleMap: [] };
  const riskControls = spec.riskControls || {};
  const domainKnowledge = spec.domainKnowledge || {};
  const acceptanceScenarios = spec.acceptanceScenarios || [];
  const dataContracts = spec.dataContracts || [];
  const capabilityMatrix = spec.capabilityMatrix || [];
  const coordinator = findCoordinator(spec);
  const docItems = allDocs(docs);
  const docsHaveContent = hasContentForEverySection(docItems);
  const templatesHaveContent = hasContentForEverySection(templates);
  const domainKnowledgeComplete = ["concepts", "methods", "evidenceChecklist", "failureModes"]
    .every((field) => Array.isArray(domainKnowledge[field]) && domainKnowledge[field].length > 0);
  const declaredExternalSkills = Array.isArray(externalSkills.skills) && externalSkills.skills.length > 0;
  const adapters = externalSkills.adapters || [];
  const roleMapComplete = !declaredExternalSkills || (Array.isArray(externalSkills.roleMap) && externalSkills.roleMap.length > 0);
  const adaptersComplete = !declaredExternalSkills || (adapters.length > 0 && adapters.every((adapter) => {
    return adapter.id &&
      adapter.skill &&
      adapter.provider &&
      Array.isArray(adapter.inputSchema) && adapter.inputSchema.length > 0 &&
      Array.isArray(adapter.outputSchema) && adapter.outputSchema.length > 0 &&
      adapter.auth &&
      adapter.fallback &&
      adapter.verifyCommand;
  }));
  const scenarioQuality = acceptanceScenarios.length > 0 && acceptanceScenarios.every((scenario) => {
    return scenario.input &&
      Array.isArray(scenario.expectedOutputs) && scenario.expectedOutputs.length > 0 &&
      Array.isArray(scenario.mustPassGates) && scenario.mustPassGates.length > 0 &&
      Array.isArray(scenario.failureExamples) && scenario.failureExamples.length > 0;
  });

  const targetFitScore =
    points(spec.skill && spec.skill.domain, 2) +
    points(spec.skill && Array.isArray(spec.skill.targetUsers) && spec.skill.targetUsers.length > 0, 2) +
    points(spec.skill && spec.skill.primaryValue, 2) +
    points(commands.length >= 3, 2) +
    points(hasCommandNamed(spec, "intake") && (hasCommandNamed(spec, "deliver") || hasCommandNamed(spec, "delivery")), 2);

  const roleArchitectureScore =
    points(members.length >= 3, 3) +
    points(Boolean(coordinator), 3) +
    points(members.every((member) => Array.isArray(member.responsibilities) && member.responsibilities.length > 0), 3) +
    points(workflowMemberCoverage(spec) === 1, 3) +
    points(new Set(members.map((member) => member.role)).size >= Math.min(3, members.length), 3);

  const workflowScore =
    points(commandWorkflowCoverage(spec) === 1, 3) +
    points(workflowStageQuality(spec) === 1, 4) +
    points(workflowConsistency(spec) === 1, 4) +
    points(workflows.every((workflow) => Array.isArray(workflow.outputs) && workflow.outputs.length > 0), 2) +
    points(workflows.some((workflow) => workflow.execution_mode === "hybrid") || workflows.length <= 2, 1) +
    points(commands.length >= workflows.length, 1);

  const assetScore =
    points(Array.isArray(docs.methodologies) && docs.methodologies.length > 0, 2) +
    points(Array.isArray(docs.standards) && docs.standards.length > 0, 2) +
    points(Array.isArray(docs.integrations) && docs.integrations.length > 0, 2) +
    points(templates.length >= Math.min(3, workflows.length), 3) +
    points(spec.scripts && spec.scripts.includeValidation === true, 2) +
      points(roleMapComplete, 1) +
    points(adaptersComplete, 1) +
    points(Array.isArray(docs.rubrics) && docs.rubrics.length > 0, 2);

  const contentDepthScore =
    points(domainKnowledgeComplete, 8) +
    points(docsHaveContent, 6) +
    points(templatesHaveContent, 4) +
    points((domainKnowledge.failureModes || []).length >= 2, 2);

  const scenarioScore =
    points(acceptanceScenarios.length >= 2, 5) +
    points(scenarioQuality, 4) +
    points(dataContracts.length > 0, 3) +
    points(capabilityMatrix.length >= 3, 3);

  const highRisk = riskControls.domainRiskLevel === "high";
  const riskScore =
    points(["low", "medium", "high"].includes(riskControls.domainRiskLevel), 2) +
    points(Array.isArray(riskControls.requiredDisclaimers) && riskControls.requiredDisclaimers.length > 0, 2) +
    points(Array.isArray(riskControls.blockedClaims) && riskControls.blockedClaims.length > 0, 2) +
    points(Array.isArray(riskControls.evidenceRules) && riskControls.evidenceRules.length > 0, 2) +
    points(Array.isArray(docs.qualityGates) && docs.qualityGates.length > 0, 2);

  const dimensions = [
    buildDimension(
      "target-fit",
      "目标契合度",
        10,
      targetFitScore,
      [
        `目标用户数量：${spec.skill && spec.skill.targetUsers ? spec.skill.targetUsers.length : 0}`,
        `命令数量：${commands.length}`,
        `是否包含 intake/deliver：${hasCommandNamed(spec, "intake") && (hasCommandNamed(spec, "deliver") || hasCommandNamed(spec, "delivery")) ? "是" : "否"}`
      ],
      [
        ...(!hasCommandNamed(spec, "intake") ? ["补充 intake 命令，承接模糊目标和输入缺口。"] : []),
        ...(!(hasCommandNamed(spec, "deliver") || hasCommandNamed(spec, "delivery")) ? ["补充 deliver 命令，沉淀最终交付摘要。"] : [])
      ]
    ),
    buildDimension(
      "role-architecture",
      "角色架构完整度",
        15,
      roleArchitectureScore,
      [
        `角色数量：${members.length}`,
        `角色域数量：${new Set(members.map((member) => member.role)).size}`,
        `协调/交付角色：${coordinator ? coordinator.id : "缺失"}`
      ],
      [
        ...(!coordinator ? ["补充 delivery-manager 或 coordinator 角色，负责状态、证据、风险和交付。"] : []),
        ...(members.length < 3 ? ["补充覆盖核心任务链路的专家角色，避免单角色承担全部判断。"] : [])
      ]
    ),
    buildDimension(
      "workflow-operability",
      "工作流可执行性",
        15,
      workflowScore,
      [
        `工作流数量：${workflows.length}`,
        `命令映射覆盖率：${Math.round(commandWorkflowCoverage(spec) * 100)}%`,
          `阶段完整率：${Math.round(workflowStageQuality(spec) * 100)}%`,
          `声明-阶段-门禁一致率：${Math.round(workflowConsistency(spec) * 100)}%`
      ],
      [
        ...(commandWorkflowCoverage(spec) < 1 ? ["修复命令到 workflow 的引用，确保每个命令都可执行。"] : []),
        ...(workflowStageQuality(spec) < 1 ? ["补齐 workflow 阶段的 owner、actions、outputs 和 gates。"] : []),
          ...(workflowConsistency(spec) < 1 ? ["修复 workflow 声明成员、阶段 owner 和质量门禁的一致性。"] : []),
        ...(commands.length < workflows.length ? ["为重要 workflow 补充 Slash 命令入口。"] : [])
      ]
    ),
      buildDimension(
        "content-depth",
        "领域内容深度",
        20,
        contentDepthScore,
        [
          `领域知识包：${domainKnowledgeComplete ? "完整" : "缺失或不完整"}`,
          `方法论/标准/集成内容：${docsHaveContent ? "完整" : "存在空章节"}`,
          `交付模板内容：${templatesHaveContent ? "完整" : "存在空章节"}`,
          `失败模式数量：${Array.isArray(domainKnowledge.failureModes) ? domainKnowledge.failureModes.length : 0}`
        ],
        [
          ...(!domainKnowledgeComplete ? ["补充 domainKnowledge，覆盖概念、方法、证据清单和失败模式。"] : []),
          ...(!docsHaveContent ? ["为 docs 中每个章节补充可执行规则，避免只生成标题。"] : []),
          ...(!templatesHaveContent ? ["为 templates 中每个章节补充填写规则和必填约束。"] : [])
        ]
      ),
    buildDimension(
      "assets-evidence",
      "资产与证据完备度",
        15,
      assetScore,
      [
        `方法论文档：${Array.isArray(docs.methodologies) ? docs.methodologies.length : 0}`,
        `标准文档：${Array.isArray(docs.standards) ? docs.standards.length : 0}`,
        `模板数量：${templates.length}`,
          `外部能力映射：${Array.isArray(externalSkills.roleMap) ? externalSkills.roleMap.length : 0}`,
          `能力 Adapter：${adapters.length}`
      ],
      [
        ...(templates.length < Math.min(3, workflows.length) ? ["补充关键产物模板，减少 Agent 执行时临场发挥。"] : []),
        ...(!spec.scripts || spec.scripts.includeValidation !== true ? ["开启 includeValidation，确保生成团队可自检。"] : []),
          ...(declaredExternalSkills && !roleMapComplete ? ["补充外部能力映射，说明哪些角色可使用哪些能力。"] : []),
          ...(declaredExternalSkills && !adaptersComplete ? ["补充 externalSkills.adapters，定义外部能力输入、输出、授权、降级和验证命令。"] : [])
      ]
    ),
    buildDimension(
        "scenario-acceptance",
        "验收场景完备度",
        15,
        scenarioScore,
        [
          `验收场景数量：${acceptanceScenarios.length}`,
          `场景字段完整：${scenarioQuality ? "是" : "否"}`,
          `数据契约数量：${dataContracts.length}`,
          `能力矩阵数量：${capabilityMatrix.length}`
        ],
        [
          ...(acceptanceScenarios.length < 2 ? ["至少补充 2 个 golden acceptance scenarios，覆盖核心任务和失败样例。"] : []),
          ...(!scenarioQuality ? ["验收场景必须包含输入、期望产出、必过门禁和失败样例。"] : []),
          ...(dataContracts.length === 0 ? ["补充 dataContracts，明确数据来源、时效、必需字段和缺失处理。"] : []),
          ...(capabilityMatrix.length < 3 ? ["补充 capabilityMatrix，明确能力、负责人、输入输出、门禁和成熟度。"] : [])
        ]
      ),
      buildDimension(
      "risk-quality",
      "风险与质量控制",
        10,
      riskScore,
      [
        `风险等级：${riskControls.domainRiskLevel || "缺失"}`,
        `免责声明数量：${Array.isArray(riskControls.requiredDisclaimers) ? riskControls.requiredDisclaimers.length : 0}`,
        `禁止性承诺数量：${Array.isArray(riskControls.blockedClaims) ? riskControls.blockedClaims.length : 0}`,
        `证据规则数量：${Array.isArray(riskControls.evidenceRules) ? riskControls.evidenceRules.length : 0}`
      ],
      [
        ...(highRisk && (!Array.isArray(riskControls.requiredDisclaimers) || riskControls.requiredDisclaimers.length === 0) ? ["高风险团队必须补充免责声明。"] : []),
        ...(highRisk && (!Array.isArray(riskControls.blockedClaims) || riskControls.blockedClaims.length === 0) ? ["高风险团队必须补充禁止性承诺。"] : []),
        ...(highRisk && (!Array.isArray(riskControls.evidenceRules) || riskControls.evidenceRules.length === 0) ? ["高风险团队必须补充证据规则。"] : [])
      ]
    )
  ];

  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const weakDimensions = dimensions.filter((dimension) => dimension.score < dimension.maxScore);
  const upgradeOpportunities = weakDimensions.flatMap((dimension) => {
    const fallback = `${dimension.name} 未满分，建议按证据补齐团队能力。`;
    return (dimension.improvements.length > 0 ? dimension.improvements : [fallback]).map((recommendation, index) => ({
      priority: dimension.score <= dimension.maxScore * 0.7 ? "high" : index === 0 ? "medium" : "low",
      area: dimension.name,
      currentScore: `${dimension.score}/${dimension.maxScore}`,
      recommendation
    }));
  });

  const capabilityRecommendations = unique([
    ...(!coordinator ? ["新增交付/协调角色：delivery-manager 或 workflow-coordinator"] : []),
    ...(templates.length < Math.min(3, workflows.length) ? ["新增核心模板：brief、analysis/report、risk-register、delivery-summary"] : []),
      ...(!domainKnowledgeComplete ? ["新增领域知识包：概念、方法、证据清单、失败模式"] : []),
      ...(acceptanceScenarios.length < 2 ? ["新增 golden 验收场景，用真实输入验证团队输出"] : []),
      ...(dataContracts.length === 0 ? ["新增数据契约，约束来源、时效、缺失处理和允许用途"] : []),
      ...(declaredExternalSkills && !adaptersComplete ? ["新增 Capability Adapter Registry，约束外部能力的输入输出、授权和降级路径"] : []),
    ...(declaredExternalSkills && !roleMapComplete ? ["登记外部 Skill 能力映射，覆盖专业分析、审查、测试或数据处理"] : []),
    ...(highRisk ? ["强化高风险能力：免责声明、证据索引、失效条件、人工复核门禁"] : [])
  ]);

  const genericDraft = [
    spec.skill && spec.skill.description,
    ...(Array.isArray(riskControls.requiredDisclaimers) ? riskControls.requiredDisclaimers : [])
  ].some((item) => /generic draft|通用草案|未命中内置 domain pack/.test(String(item || "")));

  const aGradeBlockers = [
    ...(genericDraft ? ["generic-draft 通用草案未命中内置 domain pack，不得评为 A 级团队。"] : []),
    ...(!domainKnowledgeComplete ? ["domainKnowledge 未完整覆盖概念、方法、证据清单和失败模式。"] : []),
    ...(!docsHaveContent ? ["docs 内容未覆盖每个章节的具体执行规则。"] : []),
    ...(!templatesHaveContent ? ["templates 内容未覆盖每个章节的填写规则。"] : []),
    ...(acceptanceScenarios.length < 2 || !scenarioQuality ? ["acceptanceScenarios 少于 2 个或字段不完整。"] : []),
    ...(dataContracts.length === 0 ? ["dataContracts 缺失。"] : []),
    ...(capabilityMatrix.length < 3 ? ["capabilityMatrix 少于 3 项。"] : []),
    ...(declaredExternalSkills && !adaptersComplete ? ["声明 external skills 但缺少完整 externalSkills.adapters。"] : [])
  ];
  const gradeScore = aGradeBlockers.length > 0 ? Math.min(totalScore, 89) : totalScore;

  return {
    totalScore,
    grade: gradeFor(gradeScore),
    gradeScore,
    gradeBlockers: aGradeBlockers,
    dimensions,
    strengths: dimensions
      .filter((dimension) => dimension.score >= dimension.maxScore * 0.9)
      .map((dimension) => `${dimension.name} 达到 ${dimension.score}/${dimension.maxScore}`),
    upgradeOpportunities,
    capabilityRecommendations,
    decisionAdvice: aGradeBlockers.length > 0
      ? `存在 ${aGradeBlockers.length} 个 A 级阻断项，不得按 A 级团队发布。`
      : totalScore >= 90
        ? "可作为高质量团队 Skill 交付，后续按业务实战反馈迭代。"
        : totalScore >= 80
        ? "可交付使用，建议优先处理 medium/high 升级项。"
        : totalScore >= 70
          ? "可试用但不建议正式推广，需补齐关键短板。"
          : "不建议交付，必须先修复结构、流程或风险控制短板。"
  };
}

function renderScoreMarkdown(spec, score) {
  const dimensionRows = score.dimensions.map((dimension) => {
    return `| ${dimension.name} | ${dimension.score}/${dimension.maxScore} | ${dimension.evidence.join("<br>")} | ${dimension.improvements.length > 0 ? dimension.improvements.join("<br>") : "无明确短板"} |`;
  }).join("\n");

  const upgradeRows = score.upgradeOpportunities.map((item) => {
    return `| ${item.priority} | ${item.area} | ${item.currentScore} | ${item.recommendation} |`;
  }).join("\n");

  return `# Team Evaluation Report

## 评分结论

- 团队：${spec.skill.name} (${spec.skill.id})
- 领域：${spec.skill.domain}
- 总分：${score.totalScore}/100
- 等级：${score.grade}
- 等级判定分：${score.gradeScore}/100
- 决策建议：${score.decisionAdvice}

## A 级阻断项

${score.gradeBlockers && score.gradeBlockers.length > 0 ? score.gradeBlockers.map((item) => `- ${item}`).join("\n") : "- 无"}

## 维度评分

| 维度 | 得分 | 证据 | 提升建议 |
| --- | --- | --- | --- |
${dimensionRows}

## 主要优势

${score.strengths.length > 0 ? score.strengths.map((item) => `- ${item}`).join("\n") : "- 暂无满分或接近满分维度。"}

## 可提升项

| 优先级 | 领域 | 当前分 | 建议 |
| --- | --- | --- | --- |
${upgradeRows || "| - | - | - | 暂无 |"}

## 能力升级建议

${score.capabilityRecommendations.length > 0 ? score.capabilityRecommendations.map((item) => `- ${item}`).join("\n") : "- 暂无额外能力升级建议。"}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = args._[0] || args.spec;
  if (!specPath) {
    console.error("Usage: node scripts/score-team-spec.js <spec-path> [--format json|markdown]");
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

  const score = scoreSpec(spec);
  if (args.format === "json") {
    console.log(JSON.stringify(score, null, 2));
  } else {
    console.log(renderScoreMarkdown(spec, score));
  }
}

if (require.main === module) main();

module.exports = {
  renderScoreMarkdown,
  scoreSpec
};
