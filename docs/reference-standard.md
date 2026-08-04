# Reference Standard

`ai-team-build` 以 `ai-work-team` 的标品组织方式作为生成标准。生成物不是单个提示词，而是一个完整团队 Skill 仓库。

## 根文件

- `README.md`：面向人类用户，说明团队价值、使用方式、安装方式、目录结构和维护方式。
- `SKILL.md`：面向 Agent，定义触发边界、路由规则、最小加载矩阵、执行循环、风险约束和最终输出契约。
- `skill-runtime.json`：面向安装器和通用 Agent，声明入口、运行环境、requiredFiles、安装方式和 agentHints。
- `package.json`：声明 Node 版本、验证脚本和生成物自身的 `npm test`。
- `evaluation-report.md`：记录当前团队评分、等级、维度证据、可提升项和能力升级建议。
- `generation-report.json`：记录生成来源、文件计划、计数、评分摘要、验收场景和风险约束。
- `skill-evolution-audit.md`：已有 Skill 的静态审计基线、发现、证据、验证建议和复审结论；按需生成，不要求写入目标 Skill。

## 标准目录

- `members/`：团队角色，每个角色有 frontmatter、职责边界、输入、输出、工作逻辑、检查清单、升级条件和不可做事项。
- `workflows/`：团队工作流，每个工作流有 frontmatter、阶段表、门禁、产出和完成定义。
- `commands/`：Slash 指令和自然语言触发规则。
- `docs/`：团队运行模型、执行档位、角色激活、验证等级、质量门禁、评分规则、交接契约、能力矩阵、验收场景和集成契约。
- `assets/templates/`：交付物模板，每个章节必须有填写规则或证据要求。
- `schemas/`：机器可读结构契约，必须包含 `required` 和 `properties`。
- `scripts/`：结构校验、契约校验、验收场景、外部 Skill 辅助脚本。
- `external-skills/`：可推荐外部 Skill 清单、Adapter Registry、安装策略和角色映射。
- `external-cli/`：本地 CLI 能力登记。
- `workspace/`：过程产物、证据、决策、风险和交付摘要。

## 角色标准

成员文件必须包含：

- YAML frontmatter：`id`、`name`、`role`、`when_to_load`、`primary_outputs`、`quality_gates`。
- 正文：职责边界、输入、输出、工作逻辑、激活/咨询/不适用条件、重评信号、可调用外部能力、检查清单、升级条件、不可做事项。
- 成员是候选角色池；执行前必须在 `workflow-status.json.rolePlan` 中记录每个候选角色的 `active`、`consulted` 或 `not_applicable` 模式、场景依据和参与阶段。

## 工作流标准

工作流文件必须包含：

- YAML frontmatter：`id`、`title`、`triggers`、`commands`、`members`、`execution_mode`、`quality_gates`、`outputs`。
- 正文：适用场景、阶段表、不可跳过项、失败处理、完成定义。
- `members` 是候选角色池；每个阶段 owner 必须属于候选池，但 `consulted` 或 `not_applicable` 角色不要求拥有静态阶段。
- 每个声明质量门禁必须出现在阶段表 gates 中。

## 运行治理标准

- `docs/team-operating-model.md` 必须记录问题价值蓝图、默认复杂度、执行档位、目标验证等级、必需门禁和人工责任边界。
- `docs/execution-methodology.md` 必须定义 `lightweight`、`standard`、`assurance` 与升级条件。
- `docs/role-activation-methodology.md` 必须定义 `active`、`consulted`、`not_applicable`、N/A 评分和 rolePlan 重评。
- `docs/verification-methodology.md` 必须定义 `V0-V4`、结论上限，以及工厂验证与真实业务验证的边界。
- `workflow-status.json` 必须记录复杂度、执行档位、当前/目标验证等级、blockers、uncoveredRisks 和 rolePlan。

## 内容深度标准

高质量团队必须包含：

- `docs/capability-matrix.md`：能力、负责人、输入输出、门禁和成熟度。
- `docs/acceptance-scenarios.md`：golden 验收场景、期望产出、必过门禁和失败样例。
- `docs/integrations/data-contracts.md`：数据来源、时效、必需字段、缺失处理和允许用途。
- `external-skills/adapters.json`：外部能力的输入输出、授权、降级和验证命令。
- `docs/methodologies/`、`docs/engineering-standards/`、`docs/integrations/` 下文档不得只有标题或占位内容。
- `assets/templates/` 下模板不得为空 bullet。
- 所有生成团队必须具备决策、风险、交接、证据索引、交付摘要和工作流状态模板；领域规格可覆盖同路径保底模板。

## 工厂模块标准

`ai-team-build` 自身应保持以下模块边界：

- `scripts/generation-plan.js`：生成计划、文件清单、dry-run 计数。
- `scripts/template-engine.js`：docs、templates、能力矩阵、验收场景、数据契约渲染。
- `scripts/synthesize-team-spec.js`：自然语言目标到 domain pack/spec 的合成入口。
- `scripts/run-acceptance-scenarios.js`：生成物 golden 场景验收。
- `scripts/audit-skills.js`：对一个或多个已有 Skill 做无副作用的静态执行质量审计。
- `domain-packs/`：可复用垂直领域包市场。

## 已有 Skill 升华标准

已有 Skill 的审计与改进必须检查：

- `SKILL.md` 的发现质量、负向边界和按需加载结构。
- 工作流的输入、阶段、失败处理、停止条件、风险/复杂度分级和协作写入边界。
- 团队成员是否按任务实际激活，未参与角色是否有不适用依据，N/A 评分是否避免伪造结论，以及范围变化时是否会重评角色计划。
- 验证脚本、验收场景、证据索引、验证等级和未覆盖范围。
- 绝对路径、疑似凭据、未授权外部执行和环境绑定。
- 失败样例、回归检查、维护规则和可排序的升级建议。

审计器只做静态分析。目标 Skill 的测试或外部副作用必须由调用方确认后再执行，静态评分不得替代运行时验证。

## 生成物校验标准

生成物必须通过：

- 根文件存在。
- requiredFiles 存在。
- workflow 引用的 member 存在。
- workflow 候选成员、阶段 owner 和质量门禁引用一致。
- command 引用的 workflow 存在。
- route-table 覆盖所有 workflow。
- docs/templates 通过非空内容检查。
- schemas 具备 required/properties 深度。
- external-skills/adapters.json 具备 provider、inputSchema、outputSchema、auth、fallback、verifyCommand。
- acceptance scenarios 可以通过 `scripts/run-acceptance-scenarios.js`。
- A 级验收场景包含预期 workflow、执行档位、最低验证等级和 rolePlan。
- 高风险领域包含免责声明、禁止性承诺和证据规则。
- 高风险领域包含人工责任人、触发条件和无批准阻断。
- `evaluation-report.md` 存在，且 `generation-report.json` 包含评分摘要。
- `generation-report.json` 明确工厂 V2、生成团队 V0 和目标验证等级，禁止把蓝图评分解释为业务认证。
- 不存在未替换模板占位符。
