# Generated Skill Quality Gates

生成出来的新团队 Skill 必须通过以下门禁。

## structure-gate

- 根文件存在：`SKILL.md`、`README.md`、`package.json`、`skill-runtime.json`。
- 标准目录存在：`members/`、`workflows/`、`commands/`、`docs/`、`schemas/`、`assets/templates/`、`scripts/`、`external-skills/`、`external-cli/`、`workspace/`。
- `skill-runtime.json.install.requiredFiles` 中的路径均存在。

## agent-entry-gate

- `SKILL.md` 有 frontmatter。
- frontmatter 的 `name` 与 `skill-runtime.json.skill.id` 一致。
- `description` 包含明确触发条件。

## command-workflow-gate

- 主命令文件存在。
- 命令引用的 workflow 存在。
- `workflows/route-table.md` 覆盖所有 workflow。

## member-workflow-gate

- 每个成员文件有必要 frontmatter。
- 每个 workflow 引用的 member 都存在。
- workflow 的阶段 owner 必须来自候选 member；`consulted` 或 `not_applicable` 候选角色不要求拥有静态阶段。
- workflow 声明的每个 quality gate 必须出现在阶段表 gates 中。
- 阶段 owner 必须是已声明 member。

## role-activation-gate

- workflow frontmatter 的 `members` 是候选角色池，不等于本次任务的实际参与名单。
- `docs/role-activation-methodology.md` 必须定义 `rolePlan`、`active`、`consulted`、`not_applicable`、重评条件和 N/A 评分规则。
- `assets/templates/workflow-status.json` 和 `schemas/status.schema.json` 必须包含 `rolePlan`。
- 未激活角色必须有场景依据，且不得生成虚假评审、交接或评分；范围扩大、验证失败和跨领域依赖出现时必须重评。

## template-gate

- `assets/templates/` 中至少有一个交付物模板。
- 必须包含 `decision-log.md`、`risk-register.md`、`role-handoff.md`、`evidence-index.md`、`delivery-summary.md` 和 `workflow-status.json`。
- 生成物不得残留未替换模板占位符。
- 模板章节不得为空 bullet。
- 模板不得只保留“待执行时补齐”等占位文案。

## content-depth-gate

生成物必须包含并通过内容深度检查：

- `docs/capability-matrix.md`。
- `docs/acceptance-scenarios.md`。
- `docs/integrations/data-contracts.md`。
- `docs/methodologies/`、`docs/engineering-standards/`、`docs/integrations/` 下的文档必须有具体执行规则。
- `schemas/*.schema.json` 必须包含 `required` 和 `properties`，不得只是 `{ "type": "object" }`。

## adapter-gate

如果生成物声明 external skills，则必须包含：

- `external-skills/catalog.json`。
- `external-skills/adapters.json`。
- adapter 必须引用 catalog 中存在的 skill。
- adapter 必须声明 `provider`、`inputSchema`、`outputSchema`、`auth`、`fallback` 和 `verifyCommand`。

## acceptance-gate

生成物必须可执行：

```bash
node scripts/run-acceptance-scenarios.js .
```

验收场景必须检查：

- `expectedOutputs` 对应产物存在。
- `mustPassGates` 在生成物中可追踪。
- `failureExamples` 被写入生成物。
- A 级场景的 `expectedWorkflow`、`expectedProfile`、`minimumVerificationLevel` 和 `expectedRolePlan` 有效。
- 风险声明、禁止性承诺和证据规则可追踪。

## risk-gate

高风险团队必须包含：

- 免责声明。
- 禁止性承诺。
- 证据规则。
- 置信度或失效条件要求。
- 人工责任人、复核触发条件和无批准阻断。

## score-gate

生成物必须包含：

- `evaluation-report.md`。
- `generation-report.json.evaluation.totalScore`。
- `generation-report.json.evaluation.grade`。
- 维度评分、可提升项和能力升级建议。

低于 80 分时，必须在交付摘要中说明高优先级升级项；低于 70 分时，不建议作为正式团队 Skill 使用。A 级团队必须包含问题价值蓝图、治理模型、角色激活条件、结构化验收场景、数据契约和能力矩阵；如果声明 external skills，还必须包含 adapter 契约。字母等级只证明蓝图与契约质量。

## verification-gate

生成完成后必须运行：

```bash
node scripts/validate-generated-skill.js <generated-skill-path>
node <generated-skill-path>/scripts/run-acceptance-scenarios.js <generated-skill-path>
```

生成工厂的结构与契约验证等级为 V2。新生成团队的真实业务验证等级必须保持 V0，直到真实任务证据支持升级；不得把 A 级蓝图写成业务效果已验证。

## evolution-audit-gate

审计或升华已有 Skill 时必须：

- 先运行 `node scripts/audit-skills.js <skill-path>`，记录静态评分、证据和 P0/P1/P2/P3 发现。
- 不自动执行目标 Skill 的测试、网络调用或其他有副作用脚本；报告中只列出建议验证命令。
- 先关闭 P0/P1，再选择一个可验证的 P2 改进切片，避免无证据的大规模改写。
- 修改后运行已确认安全的目标验证命令，并复跑审计，说明分数变化、未覆盖范围和剩余风险。
