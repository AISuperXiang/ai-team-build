# Spec Authoring Guide

`team-spec.json` 是 `ai-team-build` 的唯一生成输入。Agent 可以先生成草案，再用 `scripts/validate-team-spec.js` 校验。

## 顶层字段

- `skill`：新团队 Skill 的身份、领域、目标用户和核心价值。
- `commands`：Slash 指令前缀和子命令。
- `members`：团队角色。
- `workflows`：标准工作流。
- `docs`：方法论、标准、集成契约、质量门禁和评分规则。
- `templates`：生成物中的交付物模板。
- `domainKnowledge`：领域概念、方法、证据清单和失败模式，用于防止生成空心团队。
- `capabilityMatrix`：团队核心能力、负责人、输入输出、门禁和成熟度。
- `acceptanceScenarios`：golden 验收场景，包含输入、期望产出、必过门禁和失败样例。
- `dataContracts`：数据来源、时效、必需字段、缺失处理和允许用途。
- `externalSkills`：可推荐外部 Skill、角色映射、Capability Adapter 和安装策略。
- `scripts`：是否生成上下文构建、外部 Skill 辅助和校验脚本。
- `riskControls`：风险等级、免责声明、禁止性承诺和证据规则。
- `output`：默认输出路径和覆盖策略。

## 评分输入

评分脚本不要求额外字段，但会读取以下信息：

- `skill`：判断目标、受众和核心价值。
- `commands`：判断入口覆盖和 intake/deliver 闭环。
- `members`：判断角色架构和协调责任。
- `workflows`：判断命令映射、阶段、产出和门禁。
- `docs`、`templates`、`domainKnowledge`：判断方法论和交付模板是否有可执行内容。
- `acceptanceScenarios`、`dataContracts`、`capabilityMatrix`：判断是否具备真实验收闭环。
- `externalSkills`、`externalSkills.adapters`、`scripts`：判断外部能力、授权降级和辅助脚本是否可复用。
- `riskControls`：判断风险边界、禁止性承诺和证据规则。

生成后会输出 `evaluation-report.md` 和 `generation-report.json.evaluation`。

## ID 规则

所有 ID 必须使用 kebab-case：

```text
stock-trading-team
risk-manager
strategy-review
```

命令前缀必须以 `/` 开头：

```text
/stock-team
```

## 引用规则

- `commands.items[].workflow` 必须引用已存在的 workflow id。
- `workflows[].members[]` 必须引用已存在的 member id。
- `workflows[].stages[].owner` 必须引用已存在的 member id，且必须出现在当前 workflow 的 `members` 中。
- `workflows[].quality_gates[]` 必须出现在至少一个 stage 的 `gates` 中。
- `externalSkills.skills[].roles[]` 必须引用已存在的 member id。
- `externalSkills.roleMap[].skills[]` 必须引用已存在的 external skill id。
- `externalSkills.adapters[].skill` 必须引用已存在的 external skill id。
- `capabilityMatrix[].owner` 必须引用已存在的 member id。
- `acceptanceScenarios[].mustPassGates[]` 必须引用 `docs.qualityGates` 中的门禁。

## Capability Adapter 字段

当团队声明 external skills 时，建议同步声明 `externalSkills.adapters`：

- `provider`：能力来源，例如 `external-skill`、`local-cli`、`manual-review`。
- `inputSchema`：调用前必须具备的输入字段。
- `outputSchema`：调用后可用于交付的输出字段。
- `auth`：`none`、`user-approval` 或 `credential-required`。
- `fallback`：未授权、失败或不可用时的降级策略。
- `verifyCommand`：验证该能力映射存在的命令。

## 内容深度字段

为了避免“结构完整但方法论空心”，高质量团队必须补充：

- `docs.*[].content`：每个 `sections` 条目都应有 1 条以上可执行规则。
- `templates[].content`：每个模板章节都应有填写规则、必填证据或风险约束。
- `domainKnowledge.concepts`：领域核心概念。
- `domainKnowledge.methods`：团队执行方法。
- `domainKnowledge.evidenceChecklist`：证据要求。
- `domainKnowledge.failureModes`：常见失败模式。

不建议使用“待补齐”“执行时再补”等占位内容；生成物校验会阻断空 bullet 和明显占位文案。

## 高风险字段

当 `riskControls.domainRiskLevel` 为 `high` 时，以下字段必须非空：

- `requiredDisclaimers`
- `blockedClaims`
- `evidenceRules`

投资类团队必须至少声明：

- 不构成投资建议。
- 不承诺收益。
- 不输出确定性买卖指令。
- 必须说明数据来源、时效性、仓位风险和失效条件。

## 校验命令

```bash
node scripts/validate-team-spec.js fixtures/stock-trading-team.team-spec.json
```
