# Generated Skill Quality Gates

生成出来的新团队 Skill 必须通过以下门禁。

## structure-gate

- 根文件存在：`SKILL.md`、`README.md`、`README_EN.md`、`package.json`、`skill-runtime.json`、`team-spec.snapshot.json`、`generation-manifest.json`。
- `README.md` 与 `README_EN.md` 必须提供双向语言链接，并分别声明默认中文和英文文档职责。
- 标准目录存在：`members/`、`workflows/`、`commands/`、`docs/`、`schemas/`、`assets/templates/`、`scripts/`、`test/`、`external-skills/`、`external-cli/`、`workspace/`。
- `skill-runtime.json.install.requiredFiles` 中的路径均存在。

## agent-entry-gate

- `SKILL.md` 有 frontmatter。
- frontmatter 的 `name` 与 `skill-runtime.json.skill.id` 一致。
- 生成目录 basename 与 `skill.id` 一致；重命名目录必须先迁移规范身份。
- `description` 包含明确触发条件。

## command-workflow-gate

- 主命令文件存在。
- command frontmatter 必须包含 `id`、`title`、`triggers`、`execution_mode`。
- 新生成 command 不声明 `members`；角色候选池由 workflow `members` 和运行期 `rolePlan` 唯一表达。
- `0.6.0` 起 command Schema 拒绝 command-level `members`。
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
- 每个工作流阶段声明的 Markdown 产物都必须存在对应模板；规格未声明时由工厂生成通用 fallback。

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

生成物必须提供两个明确分层的入口：

```bash
node scripts/run-acceptance-scenarios.js . --mode contracts
node scripts/run-acceptance-scenarios.js . --mode execution --results workspace/acceptance-results.json
```

`contracts` 只检查生成契约：

- `expectedOutputs` 对应产物存在。
- `mustPassGates` 在生成物中可追踪。
- `failureExamples` 被写入生成物。
- A 级场景的 `expectedWorkflow`、`expectedProfile`、`minimumVerificationLevel` 和 `expectedRolePlan` 有效。
- 风险声明、禁止性承诺和证据规则可追踪。

`execution` 必须检查：

- 每个声明场景恰好有一个运行结果，且输入摘要匹配。
- workflow、execution profile、verification level 和完整 rolePlan 与场景契约一致。
- 所有期望产物来自 `workspace/`，是非空普通文件且 SHA-256 匹配。
- 必过门禁、失败样例断言和证据引用完整。
- assertion 为 pass、`executed > 0`、runner 成功，wrapper 成功或明确不适用。
- 高风险输出包含必需免责声明且不包含禁止性承诺。

静态契约通过不得表述为场景执行或业务结果通过。

## governance-readiness-gate

- `workflow-status.json.governanceControl` 是任务治理权威记录。
- 终态 claim 必须绑定 confirmed contract、当前 invocation、任务授权范围、required checks 和结构化 verification runs。
- 汇总 `verificationLevel` 不得高于可信运行结果支持的等级。
- 高风险或显式人工复核任务在缺少当前契约审批时不得 ready。
- readiness 由 `scripts/assess-governance.js` 只读派生；初始模板应为 `review`，不是 `ready`。
- 人工审批必须记录 `reviewerType=human`、复核人、时间和证据，Agent 自审不能替代。
- `verificationLevel` 只代表 workflow，并必须与 `verificationScopes.workflow` 一致。
- 使用 `scripts/validate-workspace.js --require-ready --min-score 90` 检查真实任务的角色、产物和证据引用。

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
node <generated-skill-path>/scripts/run-acceptance-scenarios.js <generated-skill-path> --mode contracts
```

生成工厂的结构与契约验证等级为 V2。新生成团队的真实业务验证等级必须保持 V0，直到真实任务证据支持升级；不得把 A 级蓝图写成业务效果已验证。

## reproducibility-and-upgrade-gate

- 生成物包含完整 `team-spec.snapshot.json`。
- `generation-report.json.specDigest` 与规范快照 SHA-256 一致。
- `generation-manifest.json` 覆盖所有工厂受管文件并记录 SHA-256 和大小。
- `--upgrade --dry-run` 不修改目标目录。
- 升级保留 `.git`、workspace 任务和未受管文件。
- 受管文件被人工修改、删除或被同名本地文件占用时，升级必须在写入前阻断。
- `--overwrite` 不得删除 Git 仓库、漂移文件或额外文件。

## governance-regression-gate

- 生成物包含 `test/governance-core.test.js`。
- `npm test` 必须执行治理单测。
- 单测至少证明初始模板保持 review、可信证据可 ready、零执行不可通过、缺真人审批会阻断。

## feedback-loop-gate

- 生成物包含 `assets/templates/iteration-feedback.json`、`schemas/feedback.schema.json`、`docs/feedback-loop.md` 和 `scripts/summarize-feedback.js`。
- 聚合器拒绝未完成模板、未知 workflow、未知角色、越界路径、符号链接和超限输入。
- 重复证据缺口、能力缺口、角色问题和返工必须形成可排序的 P1/P2/P3 信号。
- 反馈只用于演进优先级，不得冒充业务结果验证。

## evolution-audit-gate

审计或升华已有 Skill 时必须：

- 先运行 `node scripts/audit-skills.js <skill-path>`，记录静态评分、证据和 P0/P1/P2/P3 发现。
- 不自动执行目标 Skill 的测试、网络调用或其他有副作用脚本；报告中只列出建议验证命令。
- 先关闭 P0/P1，再选择一个可验证的 P2 改进切片，避免无证据的大规模改写。
- 修改后运行已确认安全的目标验证命令，并复跑审计，说明分数变化、未覆盖范围和剩余风险。
