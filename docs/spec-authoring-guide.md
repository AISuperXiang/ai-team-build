# Spec Authoring Guide

`team-spec.json` 是 `ai-team-build` 的唯一生成输入。Agent 可以先生成草案，再用 `scripts/validate-team-spec.js` 校验。

## 顶层字段

- `schemaVersion`：兼容式 v2 规格版本；新规格使用 `2.x.x`。
- `skill`：新团队 Skill 的身份、领域、目标用户和核心价值。
- `readme.english`：可选英文 README 元数据；正式双语发布时建议完整提供。
- `teamDesign`：问题、使命、目标结果、利益相关方、约束、非目标、假设和价值指标。
- `governance`：复杂度、执行档位、目标验证等级、角色模式、重评信号、必需门禁和人工复核。
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
- `teamDesign`、`governance` 和成员 `activation`：判断问题价值契约、按需组队和执行治理是否完整。
- `workflows`：判断命令映射、阶段、产出和门禁。
- `docs`、`templates`、`domainKnowledge`：判断方法论和交付模板是否有可执行内容。
- `acceptanceScenarios`、`dataContracts`、`capabilityMatrix`：判断是否具备真实验收闭环。
- `externalSkills`、`externalSkills.adapters`、`scripts`：判断外部能力、授权降级和辅助脚本是否可复用。
- `riskControls`：判断风险边界、禁止性承诺和证据规则。

生成后会输出 `evaluation-report.md` 和 `generation-report.json.evaluation`。

## 英文 README 字段

所有新生成物都会包含默认中文 `README.md` 和英文 `README_EN.md`，两者必须互相链接。

正式双语发布的规格建议提供完整的 `readme.english`：

- `name`：英文团队名称。
- `description`：英文简介。
- `domain`：英文领域名称。
- `primaryValue`：英文核心价值。
- `targetUsers`：英文目标用户列表。
- `riskDisclaimers`：英文风险声明，可为空数组。
- `blockedClaims`：英文禁止性承诺，可为空数组。

生成器保持离线和确定性，不调用在线翻译。旧规格未声明 `readme.english` 时仍可生成，英文 README 会复用源规格值；正式发布前应补齐英文元数据。

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
- `workflows[].members[]` 是候选角色池；咨询或不适用角色不要求拥有静态阶段。
- `workflows[].quality_gates[]` 必须出现在至少一个 stage 的 `gates` 中。
- `externalSkills.skills[].roles[]` 必须引用已存在的 member id。
- `externalSkills.roleMap[].skills[]` 必须引用已存在的 external skill id。
- `externalSkills.adapters[].skill` 必须引用已存在的 external skill id。
- `capabilityMatrix[].owner` 必须引用已存在的 member id。
- `acceptanceScenarios[].mustPassGates[]` 必须引用 `docs.qualityGates` 中的门禁。
- `acceptanceScenarios[].expectedWorkflow` 必须引用已存在 workflow；`expectedRolePlan` 中 active/consulted 角色必须属于该 workflow 候选池。
- `governance.requiredGates[]` 必须引用 `docs.qualityGates` 中的门禁。

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

## v2 团队治理字段

新规格应补齐：

- `teamDesign.valueMetrics[]`：`name`、`baseline`、`target`、`evidenceSource`、`reviewCadence`。
- `members[].activation`：`activeWhen`、`consultedWhen`、`notApplicableWhen`、`reassessWhen`。
- `governance.defaultComplexityLevel`：`S/M/L/XL`。
- `governance.defaultExecutionProfile`：`lightweight/standard/assurance`。
- `governance.targetVerificationLevel`：`V0-V4`。
- `acceptanceScenarios[]`：`expectedWorkflow`、`expectedProfile`、`minimumVerificationLevel`、`expectedRolePlan`。

旧规格仍可生成，但缺少上述治理契约时不能获得 A 级蓝图成熟度。生成器验证自身结构与契约时为工厂 V2；新团队真实业务验证等级始终从 V0 开始。

## 高风险字段

当 `riskControls.domainRiskLevel` 为 `high` 时，以下字段必须非空：

- `requiredDisclaimers`
- `blockedClaims`
- `evidenceRules`
- `humanReview.required` 为 `true`
- `humanReview.accountableRole`
- `humanReview.requiredWhen`
- `humanReview.blockedWithoutApproval` 为 `true`

投资类团队必须至少声明：

- 不构成投资建议。
- 不承诺收益。
- 不输出确定性买卖指令。
- 必须说明数据来源、时效性、仓位风险和失效条件。

## 校验命令

```bash
node scripts/validate-team-spec.js fixtures/stock-trading-team.team-spec.json
```
