# AI Team Build

**语言：简体中文 | [English](./README_EN.md)**

> 通用 AI 团队 Skill 工厂：把一个可描述的问题或一份 `team-spec.json`，转换为完整、可治理、可校验、可被 Agent 直接使用的团队 Skill。

## 项目简介

`ai-team-build` 不依赖固定岗位表。Agent 先从问题价值链推导团队设计，领域包补充专业知识，确定性脚本负责生成、校验、评分和验收。

```text
问题与价值目标
  -> teamDesign
  -> 治理模型
  -> 按需角色
  -> 工作流与能力
  -> 验收证据
  -> 可安装团队 Skill
```

它既能创建产品研发、A 股研究、客服质检等专业团队，也能为从零创业者创建覆盖客户发现、方案验证、GTM、现金流和运营决策的团队。

## 目录

- [适用场景](#适用场景)
- [核心能力](#核心能力)
- [快速开始](#快速开始)
- [Slash 指令](#slash-指令)
- [工作机制](#工作机制)
- [规格与治理模型](#规格与治理模型)
- [生成物](#生成物)
- [质量门禁](#质量门禁)
- [领域包](#领域包)
- [安全边界](#安全边界)
- [项目结构](#项目结构)
- [维护与验证](#维护与验证)

## 适用场景

以下任务适合使用 `ai-team-build`：

- 从自然语言目标创建新的 AI 团队 Skill。
- 从 `team-spec.json` 生成、评审、补齐、评分或校验团队 Skill。
- 将领域方法论沉淀为可安装、可验证、可被 Agent 调用的团队能力。
- 为团队设计角色、命令、工作流、治理文档、交付模板和质量门禁。
- 审计已有 Skill 的路由、执行、角色激活、验证、安全和可维护性。
- 批量评估团队 Skills，并按 P0/P1/P2/P3 输出升级建议。

以下场景通常不适用：

- 只想使用一个已经存在的团队 Skill 执行业务任务。
- 只需要普通 Prompt、单文件 Markdown 或非团队型脚本。
- 希望工具直接安装外部 Skills。生成物可以声明外部能力，但安装必须另行获得用户授权。

## 核心能力

| 能力 | 解决的问题 | 主要产出 |
| --- | --- | --- |
| 自然语言规格合成 | 只有团队目标，没有结构化设计 | `team-spec.json` |
| 问题价值建模 | 团队缺少使命、结果、约束和价值指标 | `teamDesign`、`governance` |
| 按需角色设计 | 固定岗位表导致角色冗余或职责缺失 | 候选角色池、激活条件、`rolePlan` |
| 团队 Skill 生成 | 手工创建目录容易漏文件和契约 | 完整 Skill 目录、命令、工作流和模板 |
| 领域能力增强 | 通用团队缺少专业内容 | `domain-packs/` 领域知识与约束 |
| 质量评分与验收 | 目录完整但内容空心、无法执行 | 评分报告、验收场景、验证证据 |
| 现有 Skill 审计 | 路由、验证、安全或演进能力存在短板 | 分级发现、审计报告、升级建议 |
| 外部能力治理 | 外部 Skill 缺少授权、降级和验证约束 | Capability Adapter、数据契约 |

## 快速开始

### 运行要求

- Node.js `>=18`
- `npm`
- 核心生成流程无需网络或凭证

### 获取并验证

```bash
git clone https://github.com/AISuperXiang/ai-team-build.git
cd ai-team-build
npm run verify:install
```

该命令只执行结构、领域包、fixture 规格和生成计划 dry-run，不向 Skill 目录写入文件。开发、CI 和发布前仍运行完整验证：

```bash
npm test
```

### 从目标生成规格

```bash
npm run spec -- \
  --goal "创建一个 A 股趋势研究团队" \
  --output .tmp/stock-spec.json
```

### 从规格生成团队 Skill

```bash
npm run generate -- \
  --spec examples/product-rd-team.team-spec.json \
  --output .tmp/product-rd-team
```

创业团队示例：

```bash
npm run spec -- \
  --goal "我是从零开始的企业家，需要搭建团队验证客户、方案、GTM 和现金流" \
  --output .tmp/venture-spec.json

npm run generate -- \
  --spec examples/venture-building-team.team-spec.json \
  --output .tmp/venture-building-team
```

### 预览生成计划

```bash
npm run generate -- \
  --spec fixtures/stock-trading-team.team-spec.json \
  --dry-run
```

### 校验生成物

```bash
npm run validate:generated -- <skills-root>/product-rd-team
node <skills-root>/product-rd-team/scripts/run-acceptance-scenarios.js \
  <skills-root>/product-rd-team --mode contracts
```

`contracts` 只校验静态生成契约。真实场景执行后，使用生成物中的
`assets/templates/acceptance-results.json` 建立结果文件，再执行：

```bash
node <skills-root>/product-rd-team/scripts/run-acceptance-scenarios.js \
  <skills-root>/product-rd-team \
  --mode execution \
  --results workspace/acceptance-results.json
```

### 审计已有 Skill

```bash
npm run audit:skills -- <skill-path>
npm run audit:skills -- --root <skills-root> --output-dir .tmp/skill-audits
```

审计默认只执行静态分析，不运行目标 Skill 的测试、网络调用或其他脚本。报告中的建议验证命令需要在目标仓库、权限和副作用边界确认后执行。

## Slash 指令

在 Agent / IDE 中使用 `/team-build`：

| 指令 | 用途 |
| --- | --- |
| `/team-build intake <团队目标>` | 收口问题、价值、约束、风险和信息缺口 |
| `/team-build spec <团队目标>` | 从自然语言目标生成团队规格 |
| `/team-build review <team-spec.json>` | 评审规格完整性、治理和质量门禁 |
| `/team-build create <团队目标>` | 从目标创建并验证完整团队 Skill |
| `/team-build from-spec <spec-path>` | 从已有规格生成团队 Skill |
| `/team-build validate <skill-path>` | 校验一个已生成的团队 Skill |
| `/team-build elevate <skill-path...>` | 审计并定向升级已有 Skill |
| `/team-build list-templates` | 查看可用模板和领域包 |

常见示例：

```text
/team-build create 通用产品研发团队
/team-build create A 股研究团队 --output <skills-root>/stock-trading-team
/team-build from-spec examples/product-rd-team.team-spec.json
/team-build validate <skills-root>/stock-trading-team
/team-build elevate <skills-root>/ai-work-team <skills-root>/stock-trading-team
```

完整命令说明见 [`commands/team-build.md`](./commands/team-build.md)。

## 工作机制

### 创建团队 Skill

```text
Intake
  -> Spec
  -> Review
  -> Generate
  -> Validate
  -> Score
  -> Acceptance
  -> Deliver
```

1. **Intake**：明确问题、价值目标、利益相关方、约束、非目标、假设和风险边界。
2. **Spec**：Agent 语义推导 `teamDesign`、候选角色池和 `governance`，领域包负责增强已知领域。
3. **Review**：检查角色激活、执行档位、验证等级、人工责任、能力矩阵、数据契约和风险控制。
4. **Generate**：调用 `scripts/generate-team-skill.js` 生成完整目录。
5. **Validate**：校验入口、结构、内容深度、Schema 和 Capability Adapter 契约。
6. **Score**：生成 `evaluation-report.md`，输出得分、等级、短板和升级建议。
7. **Acceptance**：运行生成物自带的 golden 验收场景。
8. **Deliver**：交付生成路径、文件清单、验证结果、风险和注册方式。

### 升级已有 Skill

```text
Audit
  -> Prioritize
  -> Upgrade
  -> Verify
  -> Re-audit
```

1. **Audit**：静态检查发现、上下文、执行、验证、安全和演进质量。
2. **Prioritize**：按 P0/P1/P2/P3 排序，只处理有证据的短板。
3. **Upgrade**：实施与目标 Skill 职责边界一致的最小改动。
4. **Verify**：确认副作用边界后运行目标 Skill 的验证命令。
5. **Re-audit**：复跑审计，记录分数变化、剩余风险和未覆盖范围。

### 架构与验证分层

- `team-spec.json` 是自然语言语义设计和确定性生成之间的中间表示。
- command 只负责触发和 workflow 路由；workflow `members` 是角色候选池，运行期 `rolePlan` 决定实际参与角色。
- 新生成 command 不再声明 `members`；旧字段仅作为兼容输入，存在时必须引用有效成员。
- `npm run verify:install` 是只读安装校验，`npm test` 是完整生成、验收和发布回归。
- 物化生成物的测试在系统临时目录运行，并在成功或失败后清理。
- 更完整的工程规则见 [`AGENTS.md`](./AGENTS.md) 和 [`docs/reference-standard.md`](./docs/reference-standard.md)。

## 规格与治理模型

所有生成任务必须先形成 `team-spec.json`。推荐使用兼容式 v2 规格，至少包含：

- `schemaVersion`：规格版本。
- `readme.english`：可选英文 README 元数据；正式双语发布时建议完整提供。
- `teamDesign`：问题陈述、使命、目标结果、利益相关方、约束、假设和价值指标。
- `governance`：复杂度、执行档位、证据规则、人工责任和风险边界。
- `members[].activation`：角色激活条件、不适用条件和重评信号。
- `domainKnowledge`：真实领域方法、术语和判断规则。
- `capabilityMatrix`：能力、责任角色、输入、输出和验证方式。
- `acceptanceScenarios`：可执行的 golden 验收场景。
- `dataContracts`：数据来源、时效、缺失处理和允许用途。
- `externalSkills.adapters`：外部能力的输入、输出、授权、降级和验证命令。

### 角色激活

工作流成员是候选角色池，不是固定出席名单：

| 模式 | 含义 |
| --- | --- |
| `active` | 对阶段产出、决策、实现或验证直接负责 |
| `consulted` | 只在有界问题上提供结论或证据 |
| `not_applicable` | 当前任务不适用，必须记录场景依据 |

范围或风险变化时必须重新评估 `rolePlan`。

### 执行档位

| 档位 | 适用范围 |
| --- | --- |
| `lightweight` | 低风险、边界清晰的局部任务 |
| `standard` | 多模块或存在一定不确定性的任务 |
| `assurance` | 高风险、`L/XL`、权限、数据或高回滚成本任务 |

### 验证等级

| 等级 | 证据范围 | 结论边界 |
| --- | --- | --- |
| `V0` | 未验证或仅推理 | 只能描述设计、假设或待验证结论 |
| `V1` | 静态检查、lint、typecheck | 只能声明静态约束通过 |
| `V2` | 可重复脚本、单元或集成测试 | 可以声明受测契约或行为通过 |
| `V3` | 运行时、浏览器或端到端关键路径 | 可以声明核心路径已验证 |
| `V4` | 真实验收、灰度或上线观测 | 可以声明交付或收益已验证 |

工厂自身的最高验证等级为 `V2`。新生成团队的真实业务能力仍从 `V0` 开始，A 级蓝图不等于业务结果已经验证。

## 生成物

默认输出目录：

```text
<skills-root>/<new-skill-id>
```

核心结构：

```text
<new-skill-id>/
├── SKILL.md
├── README.md
├── README_EN.md
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

| 文件或目录 | 职责 |
| --- | --- |
| `README.md` | 默认中文用户文档，并链接英文版 |
| `README_EN.md` | 对应英文用户文档，并链接回中文版 |
| `SKILL.md` | 面向 Agent，定义触发、路由、加载顺序、执行协议和输出契约 |
| `members/` | 候选角色、职责、激活条件和质量门禁 |
| `workflows/` | 标准工作流、阶段、产物、门禁和路由表 |
| `commands/` | Slash 指令入口 |
| `docs/team-operating-model.md` | 问题价值蓝图、治理规则和人工责任边界 |
| `docs/role-activation-methodology.md` | `rolePlan`、参与模式和 N/A 规则 |
| `docs/execution-methodology.md` | 复杂度和三档执行策略 |
| `docs/verification-methodology.md` | `V0-V4` 证据等级和结论上限 |
| `docs/capability-matrix.md` | 团队能力矩阵 |
| `docs/acceptance-scenarios.md` | golden 验收场景 |
| `docs/integrations/data-contracts.md` | 数据来源、时效、缺失处理和允许用途 |
| `assets/templates/` | 决策、风险、交接、证据、执行验收结果和交付模板 |
| `external-skills/adapters.json` | 外部能力授权、输入输出、降级和验证方式 |
| `evaluation-report.md` | 团队评分、短板和能力升级方向 |
| `generation-report.json` | 生成器名称与版本、生成计划、文件清单、风险控制和验收索引 |
| `scripts/` | 结构、契约、治理 readiness、真实 workspace、执行验收和辅助脚本 |

## 质量门禁

`ai-team-build` 不只生成目录，还会阻断低质量团队 Skill：

- `team-spec` 必须包含领域知识、能力矩阵、验收场景和数据契约。
- A 级团队必须有真实领域内容，不能只有标题、空列表或“后续补齐”占位。
- 声明 external skills 时，必须提供 Capability Adapter 的输入、输出、授权、降级和验证命令。
- `generic-draft` 只能作为待复核草案，不能评为 A 级。
- 高风险领域必须包含免责声明、禁止性承诺、证据规则、置信度和失效条件。
- 高风险领域必须指定人工责任人，并在无批准时阻断交付或不可逆操作；Agent 自审不能冒充真人批准。
- 生成物必须通过结构校验、契约校验、治理状态校验和静态 acceptance contracts。
- 场景执行验收必须绑定输入摘要、完整 rolePlan、workspace 产物哈希、门禁、反例断言和 assertion/runner/wrapper；零执行或未知结果不得通过。
- 终态 claim 必须由确认契约、获授权 invocation、required checks 和适用人工审批共同支持。
- `verificationLevel` 仅代表流程验证；数据、事实、流程、策略结果和个性化能力分别评级。
- 生成物必须同时包含互相链接的 `README.md` 与 `README_EN.md`；生成器保持离线，不调用在线翻译。
- 每个候选成员都必须进入 `rolePlan`，仅加载实际参与角色，并为 N/A 保留依据。
- A 级代表蓝图和契约质量，不代表真实业务能力或结果已经验证。

## 领域包

`domain-packs/` 用于复用垂直领域的关键词、推荐规格、参数、能力、门禁和产物。

| 领域包 | 用途 |
| --- | --- |
| `stock-trading` | A 股投资研究与交易计划辅助团队 |
| `product-rd` | 产品研发和交付团队 |
| `venture-building` | 客户发现、Offer、GTM、runway 和运营决策团队 |

`scripts/synthesize-team-spec.js` 会根据自然语言目标选择最匹配的领域包；未命中时使用受控的通用价值链草案，并要求 Agent 复核语义质量。

投资研究类示例只用于研究和教育辅助，不构成投资建议，不承诺收益，也不替代持牌投顾建议。

## 安全边界

- 不在源码、README、SKILL 或生成物中写入本地绝对路径；示例统一使用 `<skills-root>`、`<ai-team-build-root>` 或相对路径。
- 不写入私有凭证、Token、Cookie、机器名或环境特定路径。
- 不默认安装 external skills，只允许生成能力目录和 Adapter 契约。
- 使用 `--overwrite` 前必须确认目标目录由本工具生成，并存在有效的 `generation-report.json`。
- 高风险团队不得输出确定性承诺，必须配置证据规则和人工复核。
- 生成器保持离线、确定性且无外部副作用。

## 项目结构

```text
ai-team-build/
├── AGENTS.md
├── SKILL.md
├── README.md
├── README_EN.md
├── package.json
├── skill-runtime.json
├── commands/
├── docs/
├── domain-packs/
├── examples/
├── fixtures/
├── schemas/
├── assets/
│   └── templates/
└── scripts/
```

## 维护与验证

常见维护入口：

- 修改规格字段：同步更新 `schemas/team-spec.schema.json`、`docs/spec-authoring-guide.md`、`scripts/validate-team-spec.js`、`scripts/score-team-spec.js` 和 fixture。
- 修改生成结构：同步更新 `docs/reference-standard.md`、`assets/templates/`、`scripts/generate-team-skill.js`、`scripts/generation-plan.js`、`scripts/template-engine.js` 和 `scripts/validate-generated-skill.js`。
- 修改领域包：同步更新 `domain-packs/`、`schemas/domain-pack.schema.json`、`scripts/validate-domain-packs.js` 和相关示例规格。
- 修改命令：同步更新 [`commands/team-build.md`](./commands/team-build.md)。
- 修改 command 契约：同步更新 `scripts/command-contract.js`、命令模板、生成器、内外校验器和发布回归。
- 修改审计规则：同步更新 `docs/skill-evolution-methodology.md`、`scripts/audit-skills.js` 和 `scripts/run-release-regression-tests.js`。
- 修改运行环境、入口、安装方式或用户功能：同步更新 `skill-runtime.json`、`package.json` 和双语 README。

安装后运行只读验证：

```bash
npm run verify:install
```

结构、契约或发布逻辑变化后运行完整验证：

```bash
npm test
```

发布前额外运行：

```bash
npm pack --dry-run --json
git status --short
```

## 文档职责

- [`README.md`](./README.md)：默认中文用户文档。
- [`README_EN.md`](./README_EN.md)：英文用户文档。
- [`SKILL.md`](./SKILL.md)：Agent 执行入口。
- [`skill-runtime.json`](./skill-runtime.json)：面向安装器和通用 Agent 的机器可读运行时声明。
- [`AGENTS.md`](./AGENTS.md)：面向代码维护 Agent 的架构边界、同步矩阵和验证规则。

## 代码仓库

公开仓库：<https://github.com/AISuperXiang/ai-team-build>

许可证：[`MIT`](./LICENSE)
