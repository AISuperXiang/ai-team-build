# Team Scoring Rubric

`ai-team-build` 在 Generate 和 Validate 之后必须进入 Score 阶段，对当前创作的团队蓝图与契约做确定性评分，并输出评估分析报告。评分不代表真实业务效果认证。

## 评分总览

总分 100 分，分为 7 个维度：

| 维度 | 分值 | 目标 |
| --- | --- | --- |
| 目标契合度 | 10 | 团队目标、用户、价值和 intake/deliver 闭环是否清晰 |
| 角色架构完整度 | 15 | 角色是否覆盖任务链路，是否有协调与交付责任 |
| 工作流可执行性 | 15 | 命令、workflow、阶段、成员、产出和门禁是否闭环 |
| 领域内容深度 | 20 | domainKnowledge、docs 和 templates 是否有可执行内容 |
| 资产与证据完备度 | 15 | docs、templates、scripts、external skills 和证据资产是否可复用 |
| 验收场景完备度 | 15 | acceptanceScenarios、dataContracts 和 capabilityMatrix 是否足以证明可用 |
| 风险与质量控制 | 10 | 风险边界、禁止性承诺、质量门禁和评分规则是否足够 |

## 等级

| 等级 | 分数 | 结论 |
| --- | --- | --- |
| A | 90-100 | 可作为高质量团队 Skill 交付 |
| B | 80-89 | 可交付，建议按报告补强 |
| C | 70-79 | 可试用，但需要补齐关键能力 |
| D | 0-69 | 不建议交付，必须先修复结构或风险短板 |

## 输出要求

评分报告必须包含：

- 总分与等级。
- 每个维度的得分、证据和扣分原因。
- 当前团队的主要优势。
- 可提升项，按优先级排序。
- 能力升级建议，包括需要新增的角色、workflow、template、external skill 或 CLI 能力。
- 用户后续决策建议。

## A 级硬要求

A 级团队不能只靠目录、数量和引用完整性获得高分，必须同时具备：

- `teamDesign` 完整覆盖问题、使命、目标结果、利益相关方、约束、假设和价值指标。
- `governance` 完整覆盖复杂度、执行档位、目标验证等级、重评信号、必需门禁和人工责任。
- 每个成员有 `active`、`consulted`、`not_applicable` 和重评条件。
- `domainKnowledge` 完整覆盖概念、方法、证据清单和失败模式。
- docs 与 templates 的每个章节都有具体执行规则，不得只有标题或空 bullet。
- 至少 2 个 `acceptanceScenarios`，每个场景包含输入、期望产出、必过门禁和失败样例。
- 至少 1 个 `dataContracts`，说明数据来源、时效、必需字段、缺失处理和允许用途。
- `capabilityMatrix` 明确核心能力、负责人、输入输出、门禁和成熟度。
- 每个验收场景声明预期 workflow、执行档位、最低验证等级和 rolePlan。
- 如果声明 external skills，必须有 `externalSkills.adapters` 说明输入输出、授权、降级和验证命令。

满足 A 级只会得到 `contract-validated` 蓝图认证。工厂验证为 V2，新生成团队真实业务验证上限仍为 V0，必须通过真实任务证据逐级提升。

## 阻断规则

以下情况即使总分较高，也必须标记为高优先级升级项：

- 高风险团队缺少免责声明、禁止性承诺或证据规则。
- 没有协调/交付角色。
- 命令没有映射到 workflow。
- workflow 没有任何有效阶段 owner，阶段 owner 不在候选成员中，或声明的质量门禁没有出现在阶段 gates 中。
- 方法论或模板仍包含“待执行时补齐”、空 bullet、未声明等空壳内容。
- A 级团队缺少验收场景、数据契约或能力矩阵。
- 声明 external skills 但缺少 Capability Adapter。
- acceptance runner 未通过。
- 高风险团队缺少人工责任人、复核触发条件或无批准阻断。
- 没有生成 `evaluation-report.md`。
