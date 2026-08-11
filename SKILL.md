---
name: "ai-team-build"
description: "AI Team Skill generator and evolution auditor. Use when users invoke /team-build or ask to create, build, customize, review, validate, package, batch-audit, or upgrade an agent team Skill from a team goal, team-spec JSON, or existing Skill path."
metadata:
  version: "0.5.0"
---

# AI Team Build

## Agent 一句话目标

把任何可描述的问题转成标准团队 Skill：先建立问题、价值和治理契约，再由 Agent 语义组队并生成完整目录，用结构校验、评分和验收场景证明蓝图可执行。

## 文件职责

- `README.md`：默认中文用户文档，说明工具用途、使用方式和维护入口。
- `README_EN.md`：与中文主文档对应的英文用户文档。
- `SKILL.md`：Agent 执行入口，定义触发、路由、生成、安全和输出契约。
- `skill-runtime.json`：面向安装器和通用 Agent 的机器可读运行时声明。

## 触发边界

满足以下任一情况时使用本 Skill：

- 用户输入 `/team-build` 指令。
- 用户要求创建、构建、搭建、定制、注册或发布某个 AI Team Skill。
- 用户要求把某个领域方法论沉淀成可安装、可验证、可被 Agent 使用的团队 Skill。
- 用户给出 `team-spec.json`，要求评审、生成、补齐、打分或校验。
- 用户要求从自然语言目标推导角色、命令、工作流、文档、模板或质量门禁。
- 用户要求检查、批量审计、升华或优化已有团队 Skill 的执行逻辑、验证能力或可维护性。

不适用场景：

- 用户只想使用已经存在的团队 Skill 执行业务任务。
- 用户只要求写一个普通 Prompt、单文件 Markdown 或非团队型脚本。
- 用户要求直接安装外部 Skills。本 Skill 只能为生成物声明外部能力；安装必须另行获得用户授权。

## 优先执行路径

根据用户输入选择一条主路径：

| 用户意图 | 主路径 | 必跑验证 |
| --- | --- | --- |
| `/team-build create <目标>` 或“创建某团队 Skill” | `intake -> spec -> review -> generate -> validate -> score -> acceptance -> deliver` | `npm test` 或生成物三段验证 |
| `/team-build spec <目标>` 或“先生成规格” | `intake -> synthesize spec -> validate spec -> score spec` | `npm run validate:spec -- <spec>` |
| `/team-build from-spec <spec>` | `validate spec -> dry-run plan -> generate -> validate -> score -> acceptance` | `validate:generated` + acceptance |
| `/team-build review <spec>` | `validate spec -> score spec -> report blockers` | `npm run validate:spec -- <spec>` + `npm run score -- <spec>` |
| `/team-build validate <skill-path>` | `validate structure -> validate contracts -> acceptance` | 目标 Skill 自带 `npm test` 或等价脚本 |
| `/team-build elevate <skill-path...>` | `static audit -> prioritize -> targeted upgrade -> target verification -> re-audit` | `audit:skills`；目标 Skill 验证命令需用户/执行环境确认 |
| 安装后验证 | `structure -> domain packs -> fixture spec -> generation dry-run` | `npm run verify:install`，不得写入 Skill 目录 |
| 发布前审查 | `npm test -> npm pack --dry-run --json -> sensitive scan -> git status` | 必须输出命令证据 |

## 最小加载矩阵

| 输入或意图 | 必读文件 | 按需文件 |
| --- | --- | --- |
| `/team-build` 或自然语言路由 | `commands/team-build.md`、`schemas/team-spec.schema.json` | `docs/spec-authoring-guide.md`、`domain-packs/README.md` |
| 生成或补齐团队规格 | `schemas/team-spec.schema.json`、`docs/generation-methodology.md`、`docs/risk-control-standard.md` | `domain-packs/*/domain-pack.json`、`examples/*.team-spec.json`、`fixtures/stock-trading-team.team-spec.json` |
| 从规格生成 Skill | `scripts/generate-team-skill.js`、`scripts/validate-team-spec.js`、`docs/reference-standard.md` | `scripts/generation-plan.js`、`scripts/template-engine.js` |
| 校验生成物 | `scripts/validate-generated-skill.js`、`docs/generated-skill-quality-gates.md` | 目标 Skill 的 `generation-report.json` |
| 验收生成物 | `scripts/run-acceptance-scenarios.js` | 目标 Skill 的 `generation-report.json`、`docs/acceptance-scenarios.md` |
| 评分与升级建议 | `scripts/score-team-spec.js`、`docs/team-scoring-rubric.md` | 目标 Skill 的 `evaluation-report.md`、`generation-report.json` |
| 审计或升华已有 Skill | `scripts/audit-skills.js`、`docs/skill-evolution-methodology.md` | 目标 Skill 的 `SKILL.md`、`package.json`、验证脚本和既有审计报告 |
| 创业或经营团队样例 | `examples/venture-building-team.team-spec.json`、`domain-packs/venture-building/domain-pack.json` | `docs/risk-control-standard.md` |
| A 股团队样例 | `fixtures/stock-trading-team.team-spec.json`、`docs/risk-control-standard.md` | `examples/product-rd-team.team-spec.json` |

不要一次性加载全仓库。先按上表读取最小文件，缺上下文时再追加。

## 执行循环

每次执行按以下顺序推进：

1. **Intake**：确认问题、利益相关方、目标结果、价值指标、约束、非目标、假设和高风险领域。
2. **Benchmark**：读取 `docs/reference-standard.md`，按团队 Skill 标准结构确定必须生成的目录、入口和校验项。
3. **Spec**：Agent 根据问题价值链完成语义组队，形成 `teamDesign`、候选角色池、角色激活条件和 `governance`；`domain-packs/` 只作为领域增强层，脚本负责确定性合成、生成和校验。
4. **Review**：检查角色、命令、工作流、执行档位、验证等级、人工责任、双语 README、docs、assets、domainKnowledge、capabilityMatrix、acceptanceScenarios、dataContracts、Capability Adapter、scripts、external skills 和风险控制是否覆盖目标。
5. **Generate**：调用 `node scripts/generate-team-skill.js --spec <path> --output <dir>` 物化目录。
6. **Validate**：调用 `node scripts/validate-generated-skill.js <dir>` 校验生成结果。
7. **Acceptance**：调用 `node <generated>/scripts/run-acceptance-scenarios.js <generated>` 校验 golden 场景。
8. **Score**：调用 `node scripts/score-team-spec.js <spec-path>` 或读取生成物 `evaluation-report.md`，输出总分、等级、维度得分、短板和升级建议。
9. **Elevate**：审计已有 Skill 时，先运行 `scripts/audit-skills.js`，只处理有证据的 P0/P1/P2；修改后运行目标 Skill 已声明的验证命令并复跑静态审计。
10. **Deliver**：输出生成路径或审计报告、核心文件、验证命令、验收结果、评分结论、升级建议、风险和后续注册说明。

如果信息不足但可从规格、示例或仓库探索获得，先探索；只有目标定位、合规边界、输出路径和覆盖策略无法推断时才询问用户。

## 脚本速查

在 Skill 根目录运行：

```bash
npm run spec -- --goal "<团队目标>" --output .tmp/team-spec.json
npm run validate:spec -- .tmp/team-spec.json
npm run score -- .tmp/team-spec.json
npm run generate -- --spec .tmp/team-spec.json --output <skills-root>/<skill-id>
npm run validate:generated -- <skills-root>/<skill-id>
node <skills-root>/<skill-id>/scripts/run-acceptance-scenarios.js <skills-root>/<skill-id>
npm run audit:skills -- <skill-path>
npm run audit:skills -- --root <skills-root> --output-dir .tmp/skill-audits
npm run verify:install
npm test
npm pack --dry-run --json
```

优先使用 `--dry-run` 查看生成计划。只有用户明确要求覆盖，且目标目录确认为本工具生成目录时，才允许使用 `--overwrite`。

`verify:install` 是只读安装验证，不得调用 `--overwrite` 或在 Skill 目录物化生成物。`npm test` 是开发、CI 和发布前的完整验证；需要生成目录的测试必须使用系统临时目录并在成功或失败后清理。

`audit:skills` 默认只做静态分析，不执行目标 Skill 的测试、网络调用或其他脚本。报告中的验证命令需要由 Agent 在目标仓库、权限和副作用边界确认后运行。

## 规格约束

- 所有生成都必须先形成 `team-spec.json`。
- 新规格应使用兼容式 v2：包含 `schemaVersion`、`teamDesign`、`governance` 和成员 `activation`；旧规格可生成，但不能获得最高蓝图成熟度。
- `skill.id`、成员 id、工作流 id 必须使用 kebab-case。
- 工作流引用的成员必须存在。
- 工作流成员是候选角色池；生成物必须有 `rolePlan`、角色参与模式、不适用依据和重评规则。
- 阶段 owner 必须来自当前工作流候选角色池；`consulted` 或 `not_applicable` 候选角色不需要伪造静态阶段。
- 工作流声明的每个质量门禁必须出现在阶段 gates 中。
- command 只负责触发和 workflow 路由，必需字段为 `id`、`title`、`triggers`、`execution_mode`。
- 新 command 不声明 `members`；旧 command 的 `members` 仅作为可选兼容字段，存在时必须引用已声明成员。
- 命令引用的工作流必须存在。
- 每个工作流至少有阶段、产物和门禁。
- A 级团队必须包含 `domainKnowledge`、`capabilityMatrix`、`acceptanceScenarios` 和 `dataContracts`。
- A 级 v2 蓝图还必须包含完整问题价值契约、治理模型、角色激活条件和结构化验收执行期望。
- 如果声明 external skills，A 级团队必须包含 `externalSkills.adapters`，记录输入、输出、授权、降级和验证命令。
- `docs.*[].content` 和 `templates[].content` 应覆盖每个章节，不得保留空 bullet 或“待执行时补齐”占位。
- 生成物必须包含 `README.md`、`README_EN.md`、`SKILL.md`、`package.json`、`skill-runtime.json`、`commands/`、`docs/`、`schemas/`、`assets/templates/`、`scripts/`、`members/`、`workflows/`、`workspace/`、`external-skills/`、`external-cli/`。
- `README.md` 为默认中文用户文档，`README_EN.md` 为对应英文用户文档且两者互链；SKILL 面向 Agent 执行，不得混用职责。

## 生成安全规则

- 不得在源码、README、SKILL 或生成物中写入本地绝对路径；统一使用 `<skills-root>`、`<ai-team-build-root>` 或相对路径。
- 不得把私有凭证、Token、Cookie、机器名或环境特定路径写入生成物。
- 不得默认安装 external skills；只允许生成 `external-skills/catalog.json` 和 `external-skills/adapters.json`。
- 使用 `--overwrite` 前必须确认目标目录是本工具生成目录，至少应存在 `generation-report.json` 且 `generator` 为 `ai-team-build`。
- 高风险领域不能输出确定性承诺，必须写入免责声明、禁止性承诺、证据规则和人工复核要求。
- 生成器脚本必须保持离线、确定性且无外部副作用；未命中领域包时使用通用价值链草案，语义质量由 Agent 复核。

## 风险约束

投资、医疗、法律、招聘、财务、合规等高风险团队必须在 `riskControls` 中声明：

- `domainRiskLevel` 为 `high`。
- `requiredDisclaimers` 至少一条。
- `blockedClaims` 至少一条。
- `evidenceRules` 至少一条。
- `humanReview` 必须指定人工责任角色、触发条件，并在无批准时阻断交付或不可逆操作。

生成高风险团队时，Agent 必须确保生成物包含免责声明、禁止性承诺、证据要求、置信度和失效条件。A 股团队不得承诺收益，不得输出确定性买卖指令，不得替代持牌投顾建议。

## 发布前检查

用户要求发布 GitHub、npm 或“确认可发布”时，必须执行并汇报证据：

```bash
npm test
npm pack --dry-run --json
git status --short
```

同时运行项目发布清单中的敏感信息和旧入口 denylist 扫描；扫描模式不应写入生成物或公开文档。

若发现 P0/P1 风险，不得给出“可发布”结论；先列出阻断项、复现证据和修复建议。

## 输出契约

最终回复必须包含：

- 使用的 `/team-build` 子命令或自然语言路径。
- `team-spec.json` 来源。
- 生成目录。
- 生成的角色、命令、工作流数量。
- 验证命令和结果。
- 当前团队评分、等级、蓝图认证状态和 `evaluation-report.md` 路径。
- 工厂验证等级、生成团队当前验证等级和目标验证等级；A 级蓝图不得表述为真实业务能力已验证。
- 内容深度是否通过，包括领域知识、验收场景、数据契约和能力矩阵。
- 验收场景是否通过，包括执行命令和结果摘要。
- Capability Adapter 是否写入，包括授权和降级策略。
- 关键提升项和能力升级建议。
- 风险约束是否写入生成物。
- 未解决风险或明确无风险。
- 后续如何让 Trae / Agent 识别该 Skill。

已有 Skill 升华任务还必须包含：

- 静态审计评分、维度证据和 P0/P1/P2/P3 发现。
- 本次实际修改的范围，或未修改的原因。
- 目标 Skill 的验证命令、结果和未执行原因。
- 复跑审计后的分数变化与剩余风险。

若没有生成文件，只做规格评审，必须说明“未执行 Generate 阶段”。

发布前审查类任务必须按严重度输出问题，优先列 P0/P1，再列 P2/P3；每个问题必须有文件位置、证据和建议。

## 维护规则

- 修改规格字段时，同步更新 `schemas/team-spec.schema.json`、`docs/spec-authoring-guide.md`、`scripts/validate-team-spec.js` 和 fixture。
- 修改生成结构时，同步更新 `docs/reference-standard.md`、`assets/templates/`、`scripts/generate-team-skill.js`、`scripts/generation-plan.js`、`scripts/template-engine.js` 和 `scripts/validate-generated-skill.js`。
- 修改领域包时，同步更新 `domain-packs/`、`schemas/domain-pack.schema.json`、`scripts/validate-domain-packs.js` 和相关 spec。
- 修改评分标准时，同步更新 `docs/team-scoring-rubric.md`、`scripts/score-team-spec.js`、`scripts/generate-team-skill.js` 和 fixture。
- 修改已有 Skill 审计规则时，同步更新 `docs/skill-evolution-methodology.md`、`scripts/audit-skills.js`、`scripts/run-release-regression-tests.js` 和 README。
- 修改运行环境、入口文件、必需打包文件或用户功能时，同步更新 `skill-runtime.json`、`package.json`、`README.md` 和 `README_EN.md`。
- 修改 command 契约时，同步更新 `scripts/command-contract.js`、`commands/team-build.md`、`assets/templates/command.md.tpl`、生成器、内外校验器和发布回归。
- 修改安装验证时，必须保持 `verify:install` 只读，并保持 `npm test` 的完整生成、验收和发布回归职责。
- 结构或契约变化后运行 `npm test`。

## 仓库来源

公开 Git 仓库：

```text
https://github.com/AISuperXiang/ai-team-build.git
```
