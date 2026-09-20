# Generation Methodology

本方法论用于把一个团队目标转成可生成的 `team-spec.json`。

## 1. 建立问题与价值蓝图

先明确：

- 要解决的问题、利益相关方和期望结果。
- 可衡量价值、当前基线、目标、证据来源和复盘周期。
- 约束、非目标、关键假设和失效条件。
- 是否涉及高风险领域。
- 是否需要外部数据、工具或授权。

这些信息写入 `teamDesign`。不要先列岗位再寻找工作；角色必须从问题价值链推导。

## 2. 选择领域增强或通用价值链

然后匹配 `domain-packs/`：

- 若目标命中领域包关键词，优先复用对应 pack 的推荐规格。
- 若无匹配领域包，使用 intake、领域判断、方案构造、采纳、质量、交付六段通用价值链生成受控草案。
- 可使用 `scripts/synthesize-team-spec.js --goal <目标>` 生成可校验规格。
- 高风险未知领域只能生成 `assurance` 草案，必须指定人工责任人和无批准阻断条件。

领域包是增强层，不是可创建团队的边界。Agent 负责语义组队；Node 脚本必须保持离线、确定性且无外部副作用。

## 3. 推导候选角色与激活条件

角色来自任务链路，而不是岗位名堆叠。每个角色必须回答：

- 它负责哪一类判断。
- 它需要哪些输入。
- 它产出哪些可验证材料。
- 它的不可做事项是什么。
- 它何时需要升级给用户或交付经理。
- 它何时为 `active`、何时只需 `consulted`、何时为 `not_applicable`。
- 哪些范围、风险或验证变化会触发重新评估。

通常至少需要一个协调角色，负责状态、风险、证据和最终交付。

工作流中的 `members` 是候选池。只有阶段 owner 必须拥有静态阶段；咨询或不适用角色不得为了形式完整伪造阶段、评审或评分。

## 4. 推导治理模型

`governance` 必须声明：

- 默认复杂度 `S/M/L/XL`。
- 默认执行档位 `lightweight/standard/assurance`。
- 目标验证等级 `V0-V4`。
- 必需质量门禁和 rolePlan 重评信号。
- 人工复核责任人、触发条件和无批准阻断规则。

紧急程度不能降低执行档位。结论不得超过当前证据支持的验证等级。

## 5. 推导命令

命令应覆盖用户最常用入口：

- intake：梳理输入和目标。
- analyze / design / strategy：核心专业判断。
- risk / review：风险和质量评审。
- deliver：交付摘要。

命令必须映射到明确 workflow。

## 6. 推导工作流

工作流按“输入 -> 阶段 -> 产出 -> 门禁”设计。

每个 workflow 至少包含：

- 触发条件。
- 参与角色。
- 阶段表。
- 产出。
- 质量门禁。
- 失败处理。
- 完成定义。

执行前必须从候选成员形成 `rolePlan`。范围扩大、验证失败、出现 P0/P1 风险、敏感数据、权限或外部副作用时重新评估。

## 7. 推导 docs 与 templates

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

生成器会为所有团队保底生成 `decision-log.md`、`risk-register.md`、`role-handoff.md`、`evidence-index.md`、`delivery-summary.md` 和 `workflow-status.json`。规格声明同路径模板时使用领域版本。

### 双语 README

- 每个生成团队必须同时包含默认中文 `README.md` 和英文 `README_EN.md`，并提供双向语言链接。
- 正式双语发布时，在规格中提供完整 `readme.english`，覆盖英文名称、简介、领域、核心价值、目标用户和风险边界。
- 生成器不得调用在线翻译；未提供 `readme.english` 时复用源规格值，保持离线、确定性和旧规格兼容。
- `skill-runtime.json.install.requiredFiles`、生成计划、结构校验和验收场景必须把 `README_EN.md` 视为必需文件。

## 8. 推导领域知识包与验收场景

高质量团队必须补齐以下工厂字段：

- `domainKnowledge`：概念、方法、证据清单和失败模式。
- `capabilityMatrix`：核心能力、负责人、输入输出、门禁和成熟度。
- `acceptanceScenarios`：至少覆盖核心任务和失败样例。
- `dataContracts`：约束数据来源、时效、必需字段、缺失处理和允许用途。

这些字段决定团队能否从“结构完整”升级为“可处理垂直领域问题”。

A级蓝图的验收场景还必须声明预期 workflow、执行档位、最低验证等级，以及 active、consulted、not applicable 角色。

## 9. 推导 scripts

默认生成结构校验和契约校验脚本。只有当团队确实需要项目扫描、外部能力推荐或本地 CLI 登记时，才生成对应辅助脚本。

生成物必须包含：

- `scripts/validate-structure.js`
- `scripts/validate-contracts.js`
- `scripts/governance-core.js`
- `scripts/assess-governance.js`
- `scripts/validate-workspace.js`
- `scripts/run-acceptance-scenarios.js`

## 10. 推导外部能力 Adapter

如果团队声明 external skills，必须在 `externalSkills.adapters` 中记录：

- `provider`：能力来源。
- `inputSchema`：调用前必须具备的输入。
- `outputSchema`：调用后可用于交付的输出。
- `auth`：是否需要用户授权或凭证。
- `fallback`：未授权、失败或不可用时如何降级。
- `verifyCommand`：如何验证该能力映射存在。

生成物会输出 `external-skills/adapters.json`。

## 11. 风险控制

投资、医疗、法律、财务、招聘、合规等领域必须声明：

- 风险等级。
- 免责声明。
- 禁止性承诺。
- 证据规则。
- 置信度和失效条件。
- 人工责任角色、复核触发条件和无批准阻断。

## 12. 验收执行

生成后先运行静态 acceptance contract：

```bash
node <generated>/scripts/run-acceptance-scenarios.js <generated> --mode contracts
```

它只检查：

- `acceptanceScenarios[].expectedOutputs` 是否存在。
- `mustPassGates` 是否在生成物中出现。
- `failureExamples` 是否被落盘。
- 结构化 workflow、profile、验证等级和 rolePlan 是否有效。
- 风险声明、禁止性承诺和证据规则是否可追踪。

真实场景执行后，将结果按 `assets/templates/acceptance-results.json` 写入 workspace，再运行：

```bash
node <generated>/scripts/run-acceptance-scenarios.js <generated> \
  --mode execution \
  --results workspace/acceptance-results.json
```

执行验收会绑定场景输入摘要，并核对场景全集、角色分区、产物哈希、必过门禁、
失败样例断言、验证等级和 assertion/runner/wrapper。零执行、未知结果或模板回退均失败。
静态契约通过不能表述为场景执行通过。

每个任务的 `workflow-status.json` 还必须通过治理评估：

```bash
node <generated>/scripts/validate-workspace.js \
  --status workspace/<task>/workflow-status.json \
  --require-ready \
  --min-score 90
```

终态 readiness 由确认契约、授权 invocation、required checks、可信运行结果和适用审批派生。
workspace 校验还会核对角色分区、阶段负责人、产物存在性和 evidence ID。
人工批准必须记录真人身份、时间和证据；Agent 角色复核不能满足人工门禁。

## 13. 评分与验证边界

生成完成后必须按 `docs/team-scoring-rubric.md` 打分。

评分报告必须回答：

- 当前团队是否可作为正式 Skill 使用。
- 哪些维度得分不足。
- 应优先新增哪些角色、workflow、template、external skill 或 CLI 能力。
- 是否缺少领域内容深度、验收场景、数据契约或能力矩阵。
- 哪些升级项需要用户后续自行决策。

字母评分衡量团队蓝图与契约质量，不代表团队已处理过真实业务。工厂生成、结构和验收契约的验证等级固定为 V2；新生成团队的真实业务能力从 V0 开始，只能依靠领域任务证据提升。

评分报告落点：

- 生成物根目录：`evaluation-report.md`
- 生成摘要：`generation-report.json.evaluation`
