# AI Team Build Skill

`ai-team-build` 是一个 **AI 团队 Skill 生成器**：输入一句团队目标或一份 `team-spec.json`，输出一个完整的、可校验的、可被 Agent 直接使用的新团队 Skill。

一句话理解：

```text
团队目标 / team-spec.json -> 角色 + 命令 + 工作流 + 文档 + 模板 + 校验脚本 + 验收场景 -> 可安装团队 Skill
```

它适合用来把“我要一个产品研发团队”“我要一个 A 股研究团队”“我要一个客服质检团队”这类想法，沉淀成标准化、可复用、可测试的 Agent 团队资产。

## 你能用它做什么

- 从自然语言目标生成 `team-spec.json`。
- 从 `team-spec.json` 生成完整团队 Skill 目录。
- 自动生成角色、Slash 指令、工作流、方法论文档、交付模板和质量门禁。
- 为生成物写入 `evaluation-report.md`、`generation-report.json` 和验收场景。
- 检查团队 Skill 是否存在结构完整但内容空心、风险声明缺失、外部能力契约不完整等问题。
- 通过 `domain-packs/` 快速复用垂直领域模板，目前内置 `stock-trading` 和 `product-rd`。

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

## Slash 指令

Agent / IDE 中使用 `/team-build`：

```text
/team-build intake <团队目标>
/team-build spec <团队目标>
/team-build review <team-spec.json>
/team-build create <团队目标>
/team-build from-spec <spec-path>
/team-build validate <skill-path>
/team-build list-templates
```

常见例子：

```text
/team-build create 通用产品研发团队
/team-build create A股炒股团队 --output <skills-root>/stock-trading-team
/team-build from-spec examples/product-rd-team.team-spec.json
/team-build validate <skills-root>/stock-trading-team
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
- `commands/`：Slash 指令入口。
- `docs/capability-matrix.md`：团队能力矩阵。
- `docs/acceptance-scenarios.md`：golden 验收场景。
- `docs/integrations/data-contracts.md`：数据来源、时效、缺失处理和允许用途。
- `assets/templates/`：团队交付物模板。
- `external-skills/adapters.json`：外部能力的输入、输出、授权、降级和验证命令。
- `scripts/`：生成物自带的结构校验、契约校验、验收脚本和辅助脚本。
- `evaluation-report.md`：团队评分、短板、升级建议和能力补齐方向。
- `generation-report.json`：生成计划、文件清单、计数、风险控制和验收场景索引。

## 生成流程

`/team-build create` 或等价脚本流程会按以下阶段推进：

1. **Intake**：明确团队目标、目标用户、核心任务、风险边界和交付形态。
2. **Spec**：从 `domain-packs/` 合成或补齐 `team-spec.json`。
3. **Review**：检查角色、命令、工作流、模板、领域知识、验收场景、数据契约、脚本和风险约束。
4. **Generate**：调用 `scripts/generate-team-skill.js` 生成 Skill 目录。
5. **Validate**：调用 `scripts/validate-generated-skill.js` 校验入口、结构、内容深度、schema 和 Adapter 契约。
6. **Score**：调用 `scripts/score-team-spec.js` 生成 `evaluation-report.md`。
7. **Acceptance**：运行生成物自带的 `scripts/run-acceptance-scenarios.js`。
8. **Deliver**：输出生成路径、文件清单、验证结果、评分结论、风险和后续注册方式。

## 质量门禁

`ai-team-build` 不只生成目录，还会阻断低质量团队 Skill：

- `team-spec` 必须包含 `domainKnowledge`、`capabilityMatrix`、`acceptanceScenarios` 和 `dataContracts`。
- A 级团队必须有真实领域内容，不能只有标题、空 bullet 或“后续补齐”占位。
- 声明 external skills 时，必须写入 `externalSkills.adapters`，说明输入输出、授权、降级和验证命令。
- `generic-draft` fallback 只能作为草案，不能评为 A 级。
- 高风险领域必须写入免责声明、禁止性承诺、证据规则、置信度和失效条件。
- 生成物必须通过结构校验、契约校验、评分和验收场景。

## 领域包

`domain-packs/` 是垂直领域团队包目录。当前内置：

- `stock-trading`：A 股投资研究与交易计划辅助团队。
- `product-rd`：产品研发交付团队。

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
- 修改运行环境或安装方式：同步更新 `skill-runtime.json`、`package.json` 和本文档。

结构或契约变化后运行：

```bash
npm test
```
