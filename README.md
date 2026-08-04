# AI Team Build Skill

`ai-team-build` 是一个 **通用 AI 团队 Skill 工厂**：输入一个可描述的问题或一份 `team-spec.json`，输出一个完整、可治理、可校验、可被 Agent 直接使用的新团队 Skill。

一句话理解：

```text
问题与价值目标 -> teamDesign + 治理模型 + 按需角色 + 工作流 + 验收证据 -> 可安装团队 Skill
```

它不依赖固定岗位表。Agent 从问题价值链推导团队，领域包补充专业知识，确定性脚本负责生成和验证。因此既能创建产品研发、A 股研究、客服质检团队，也能为从零创业者创建覆盖客户发现、方案验证、GTM、现金流与运营的团队。

## 你能用它做什么

- 从自然语言目标生成 `team-spec.json`。
- 建立问题陈述、使命、结果、利益相关方、约束、假设和价值指标。
- 为候选角色声明 `active`、`consulted`、`not_applicable` 激活条件和重评信号。
- 按 `S/M/L/XL` 复杂度、三档执行策略和 `V0-V4` 证据等级治理执行。
- 从 `team-spec.json` 生成完整团队 Skill 目录。
- 自动生成角色、Slash 指令、工作流、方法论文档、交付模板和质量门禁。
- 为生成物写入 `evaluation-report.md`、`generation-report.json` 和验收场景。
- 检查团队 Skill 是否存在结构完整但内容空心、风险声明缺失、外部能力契约不完整等问题。
- 对已有 Skill 进行静态批量审计，识别路由、执行、角色激活、验证、安全和演进短板，并生成分级改进建议。
- 通过 `domain-packs/` 快速复用垂直领域模板，目前内置 `stock-trading`、`product-rd` 和 `venture-building`。

## 快速开始

运行要求：

- Node.js `>=18`
- `npm`

验证当前生成器：

```bash
npm test
```

从自然语言目标合成规格：

```bash
npm run spec -- --goal "创建一个A股趋势研究团队" --output .tmp/stock-spec.json
```

创业团队示例：

```bash
npm run spec -- --goal "我是从零开始的企业家，需要搭建团队验证客户、方案、GTM和现金流" --output .tmp/venture-spec.json
npm run generate -- --spec examples/venture-building-team.team-spec.json --output .tmp/venture-building-team
```

从规格生成团队 Skill：

```bash
npm run generate -- --spec examples/product-rd-team.team-spec.json
```

只查看生成计划，不写文件：

```bash
npm run generate -- --spec fixtures/stock-trading-team.team-spec.json --dry-run
```

校验一个已生成的团队 Skill：

```bash
npm run validate:generated -- <skills-root>/product-rd-team
```

审计一个已有 Skill：

```bash
npm run audit:skills -- <skill-path>
npm run audit:skills -- --root <skills-root> --output-dir .tmp/skill-audits
```

审计默认不执行目标 Skill 的测试、网络调用或其他脚本。报告会列出建议验证命令，需在目标仓库和权限边界确认后执行。

## Slash 指令

Agent / IDE 中使用 `/team-build`：

```text
/team-build intake <团队目标>
/team-build spec <团队目标>
/team-build review <team-spec.json>
/team-build create <团队目标>
/team-build from-spec <spec-path>
/team-build validate <skill-path>
/team-build elevate <skill-path...>
/team-build list-templates
```

常见例子：

```text
/team-build create 通用产品研发团队
/team-build create A股炒股团队 --output <skills-root>/stock-trading-team
/team-build from-spec examples/product-rd-team.team-spec.json
/team-build validate <skills-root>/stock-trading-team
/team-build elevate <skills-root>/ai-work-team <skills-root>/stock-trading-team
```

完整命令说明见 [`commands/team-build.md`](commands/team-build.md)。

## 生成物包含什么

默认输出目录：

```text
<skills-root>/<new-skill-id>
```

核心结构：

```text
<new-skill-id>/
├── SKILL.md
├── README.md
├── package.json
├── skill-runtime.json
├── evaluation-report.md
├── generation-report.json
├── members/
├── workflows/
├── commands/
├── docs/
├── schemas/
├── assets/templates/
├── external-skills/
├── external-cli/
├── workspace/
└── scripts/
```

关键文件职责：

- `README.md`：给人看，说明生成出的团队 Skill 是什么、怎么用、怎么维护。
- `SKILL.md`：给 Agent 看，定义触发、路由、加载顺序、执行协议和输出契约。
- `members/`：团队角色定义。
- `workflows/`：标准工作流和路由表。
- `docs/role-activation-methodology.md`：区分候选角色与本次实际参与角色，定义 `rolePlan` 与 N/A 规则。
- `docs/team-operating-model.md`：记录问题价值蓝图、治理规则和人工责任边界。
- `docs/execution-methodology.md`：定义复杂度与 `lightweight`、`standard`、`assurance` 执行档位。
- `docs/verification-methodology.md`：定义 `V0-V4` 证据等级和结论上限。
- `commands/`：Slash 指令入口。
- `docs/capability-matrix.md`：团队能力矩阵。
- `docs/acceptance-scenarios.md`：golden 验收场景。
- `docs/integrations/data-contracts.md`：数据来源、时效、缺失处理和允许用途。
- `assets/templates/`：团队交付物模板。
- `assets/templates/decision-log.md`、`risk-register.md`、`role-handoff.md`、`evidence-index.md`、`delivery-summary.md`：所有团队都有的治理资产。
- `external-skills/adapters.json`：外部能力的输入、输出、授权、降级和验证命令。
- `scripts/`：生成物自带的结构校验、契约校验、验收脚本和辅助脚本。
- `evaluation-report.md`：团队评分、短板、升级建议和能力补齐方向。
- `generation-report.json`：生成计划、文件清单、计数、风险控制和验收场景索引。

## 生成流程

`/team-build create` 或等价脚本流程会按以下阶段推进：

1. **Intake**：明确问题、价值目标、利益相关方、约束、非目标、假设和风险边界。
2. **Spec**：Agent 语义推导 `teamDesign`、候选角色池与 `governance`，再用领域包增强或通用价值链兜底。
3. **Review**：检查角色激活、执行档位、验证等级、人工责任、工作流、模板、领域知识、验收场景、数据契约、脚本和风险约束。
4. **Generate**：调用 `scripts/generate-team-skill.js` 生成 Skill 目录。
5. **Validate**：调用 `scripts/validate-generated-skill.js` 校验入口、结构、内容深度、schema 和 Adapter 契约。
6. **Score**：调用 `scripts/score-team-spec.js` 生成 `evaluation-report.md`。
7. **Acceptance**：运行生成物自带的 `scripts/run-acceptance-scenarios.js`。
8. **Deliver**：输出生成路径、文件清单、验证结果、评分结论、风险和后续注册方式。

已有 Skill 升华流程：

1. **Audit**：静态检查发现、上下文、执行、验证、安全和演进质量。
2. **Prioritize**：按 P0/P1/P2/P3 排序，只处理有证据的短板，优先处理缺失角色激活、验证或安全边界的团队 Skill。
3. **Upgrade**：实施与原职责边界一致的最小改动。
4. **Verify**：在确认副作用边界后运行目标 Skill 的验证命令。
5. **Re-audit**：复跑审计并交付分数变化、剩余风险和未覆盖范围。

## 质量门禁

`ai-team-build` 不只生成目录，还会阻断低质量团队 Skill：

- `team-spec` 必须包含 `domainKnowledge`、`capabilityMatrix`、`acceptanceScenarios` 和 `dataContracts`。
- A 级团队必须有真实领域内容，不能只有标题、空 bullet 或“后续补齐”占位。
- 声明 external skills 时，必须写入 `externalSkills.adapters`，说明输入输出、授权、降级和验证命令。
- `generic-draft` fallback 只能作为草案，不能评为 A 级。
- 高风险领域必须写入免责声明、禁止性承诺、证据规则、置信度和失效条件。
- 高风险领域必须指定人工责任人和无批准阻断条件。
- 生成物必须通过结构校验、契约校验、评分和验收场景。
- 生成物必须记录每个候选成员的 `rolePlan`，仅加载实际参与角色，并为不适用维度保留 N/A 依据。
- A 级代表蓝图与契约质量；工厂验证等级为 V2，新生成团队的真实业务验证等级仍从 V0 开始。

## 领域包

`domain-packs/` 是垂直领域团队包目录。当前内置：

- `stock-trading`：A 股投资研究与交易计划辅助团队。
- `product-rd`：产品研发交付团队。
- `venture-building`：从零创业、客户发现、Offer、GTM、runway 与运营决策团队。

每个领域包声明关键词、推荐规格、参数、能力、门禁和产物。`scripts/synthesize-team-spec.js` 会根据自然语言目标选择最匹配的 pack，并输出可验证的 `team-spec.json`。

投资研究类示例只用于研究和教育辅助，不构成投资建议，不承诺收益，不替代持牌投顾建议。

## 代码仓库

公开仓库：

```text
https://github.com/AISuperXiang/ai-team-build.git
```

本项目避免在源码、README 或生成物中写入本地绝对路径。示例统一使用 `<skills-root>`、`<ai-team-build-root>` 或相对路径。

## 维护入口

- 修改规格字段：同步更新 `schemas/team-spec.schema.json`、`docs/spec-authoring-guide.md`、`scripts/validate-team-spec.js`、`scripts/score-team-spec.js` 和 fixture。
- 修改生成结构：同步更新 `docs/reference-standard.md`、`assets/templates/`、`scripts/generate-team-skill.js`、`scripts/generation-plan.js`、`scripts/template-engine.js` 和 `scripts/validate-generated-skill.js`。
- 修改领域包：同步更新 `domain-packs/`、`schemas/domain-pack.schema.json`、`scripts/validate-domain-packs.js` 和相关示例规格。
- 修改命令：同步更新 `commands/team-build.md`。
- 修改已有 Skill 审计规则：同步更新 `docs/skill-evolution-methodology.md`、`scripts/audit-skills.js` 和 `scripts/run-release-regression-tests.js`。
- 修改运行环境或安装方式：同步更新 `skill-runtime.json`、`package.json` 和本文档。

结构或契约变化后运行：

```bash
npm test
```
