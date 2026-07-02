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
- workflow 声明的每个 member 至少拥有一个阶段。
- workflow 声明的每个 quality gate 必须出现在阶段表 gates 中。
- 阶段 owner 必须是已声明 member。

## template-gate

- `assets/templates/` 中至少有一个交付物模板。
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
- 风险声明、禁止性承诺和证据规则可追踪。

## risk-gate

高风险团队必须包含：

- 免责声明。
- 禁止性承诺。
- 证据规则。
- 置信度或失效条件要求。

## score-gate

生成物必须包含：

- `evaluation-report.md`。
- `generation-report.json.evaluation.totalScore`。
- `generation-report.json.evaluation.grade`。
- 维度评分、可提升项和能力升级建议。

低于 80 分时，必须在交付摘要中说明高优先级升级项；低于 70 分时，不建议作为正式团队 Skill 使用。A 级团队必须包含验收场景、数据契约、能力矩阵；如果声明 external skills，还必须包含 adapter 契约。

## verification-gate

生成完成后必须运行：

```bash
node scripts/validate-generated-skill.js <generated-skill-path>
node <generated-skill-path>/scripts/run-acceptance-scenarios.js <generated-skill-path>
```
