# Generation Methodology

本方法论用于把一个团队目标转成可生成的 `team-spec.json`。

## 1. 识别团队目标与领域包

先明确：

- 这个团队为谁服务。
- 核心任务是什么。
- 输出要被谁使用。
- 是否涉及高风险领域。
- 是否需要外部数据、工具或授权。

然后匹配 `domain-packs/`：

- 若目标命中领域包关键词，优先复用对应 pack 的推荐规格。
- 若无匹配领域包，先生成草案并在交付中说明“未命中内置 domain pack”。
- 可使用 `scripts/synthesize-team-spec.js --goal <目标>` 生成可校验规格。

## 2. 推导角色

角色来自任务链路，而不是岗位名堆叠。每个角色必须回答：

- 它负责哪一类判断。
- 它需要哪些输入。
- 它产出哪些可验证材料。
- 它的不可做事项是什么。
- 它何时需要升级给用户或交付经理。

通常至少需要一个协调角色，负责状态、风险、证据和最终交付。

## 3. 推导命令

命令应覆盖用户最常用入口：

- intake：梳理输入和目标。
- analyze / design / strategy：核心专业判断。
- risk / review：风险和质量评审。
- deliver：交付摘要。

命令必须映射到明确 workflow。

## 4. 推导工作流

工作流按“输入 -> 阶段 -> 产出 -> 门禁”设计。

每个 workflow 至少包含：

- 触发条件。
- 参与角色。
- 阶段表。
- 产出。
- 质量门禁。
- 失败处理。
- 完成定义。

## 5. 推导 docs 与 templates

文档用于固化方法论和质量标准；模板用于让执行结果落盘。

docs 和 templates 不能只生成章节标题，必须为每个关键章节补充：

- 可执行规则。
- 必填证据。
- 失败处理。
- 风险边界。

常见模板：

- intake brief
- analysis report
- decision log
- risk register
- handoff
- delivery summary
- workflow status

## 6. 推导领域知识包与验收场景

高质量团队必须补齐以下工厂字段：

- `domainKnowledge`：概念、方法、证据清单和失败模式。
- `capabilityMatrix`：核心能力、负责人、输入输出、门禁和成熟度。
- `acceptanceScenarios`：至少覆盖核心任务和失败样例。
- `dataContracts`：约束数据来源、时效、必需字段、缺失处理和允许用途。

这些字段决定团队能否从“结构完整”升级为“可处理垂直领域问题”。

## 7. 推导 scripts

默认生成结构校验和契约校验脚本。只有当团队确实需要项目扫描、外部能力推荐或本地 CLI 登记时，才生成对应辅助脚本。

生成物必须包含：

- `scripts/validate-structure.js`
- `scripts/validate-contracts.js`
- `scripts/run-acceptance-scenarios.js`

## 8. 推导外部能力 Adapter

如果团队声明 external skills，必须在 `externalSkills.adapters` 中记录：

- `provider`：能力来源。
- `inputSchema`：调用前必须具备的输入。
- `outputSchema`：调用后可用于交付的输出。
- `auth`：是否需要用户授权或凭证。
- `fallback`：未授权、失败或不可用时如何降级。
- `verifyCommand`：如何验证该能力映射存在。

生成物会输出 `external-skills/adapters.json`。

## 9. 风险控制

投资、医疗、法律、财务、招聘、合规等领域必须声明：

- 风险等级。
- 免责声明。
- 禁止性承诺。
- 证据规则。
- 置信度和失效条件。

## 10. 验收执行

生成后必须运行 acceptance runner：

```bash
node <generated>/scripts/run-acceptance-scenarios.js <generated>
```

验收场景会检查：

- `acceptanceScenarios[].expectedOutputs` 是否存在。
- `mustPassGates` 是否在生成物中出现。
- `failureExamples` 是否被落盘。
- 风险声明、禁止性承诺和证据规则是否可追踪。

## 11. 评分与升级建议

生成完成后必须按 `docs/team-scoring-rubric.md` 打分。

评分报告必须回答：

- 当前团队是否可作为正式 Skill 使用。
- 哪些维度得分不足。
- 应优先新增哪些角色、workflow、template、external skill 或 CLI 能力。
- 是否缺少领域内容深度、验收场景、数据契约或能力矩阵。
- 哪些升级项需要用户后续自行决策。

评分报告落点：

- 生成物根目录：`evaluation-report.md`
- 生成摘要：`generation-report.json.evaluation`
