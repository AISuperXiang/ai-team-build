# AGENTS.md

本文件定义修改 `ai-team-build` 时必须遵守的项目级规则。它服务于代码维护 Agent，不属于生成团队的运行时契约。

<!-- ai-work-team:buildContext:start -->
## 项目定位

`ai-team-build` 是团队 Skill 工厂。Agent 负责语义设计，Node.js 脚本负责确定性规格校验、生成、评分、验收和静态审计。

## 架构边界

- `team-spec.json` 是生成输入的中间表示；不得绕过规格直接批量手写生成物。
- `scripts/generate-team-skill.js` 是当前生成真源；`assets/templates/*.tpl` 是公开参考模板，关键契约必须通过校验保持一致。
- command 只负责触发和 workflow 路由，必需 frontmatter 为 `id`、`title`、`triggers`、`execution_mode`。
- command 不拥有角色池。workflow `members` 是候选角色池，任务实际参与者由 `rolePlan` 表达。
- `0.6.0` 起 command Schema 和校验器拒绝 command-level `members`；迁移时删除该字段，角色池只保留在 workflow。
- 不新增 command `executor`，除非已有运行时消费者、授权模型和版本化迁移方案。
- 新生成物必须包含 `team-spec.snapshot.json` 和 `generation-manifest.json`；已有生成团队使用 `--upgrade`，不得删除 Git、workspace 或未受管文件。

## 安装与验证分层

- `npm run verify:install` 是只读安装校验：结构、Schema/领域包、fixture 规格和 `--dry-run` 生成计划。
- `verify:install` 不得使用 `--overwrite`，不得创建、删除或修改 Skill 目录内容。
- `npm test` 是完整工程验证，覆盖真实生成、生成物校验、验收场景和发布回归。
- 需要物化生成物的测试必须使用 `os.tmpdir()` 下由 `fs.mkdtempSync()` 创建的独占目录，并在 `finally` 中只清理该目录。
- 工厂安装契约变化不自动扩展到生成团队；生成团队 runtime 的 `postInstall` 只有在其测试出现副作用或契约版本升级时才调整。

## 变更同步矩阵

- 修改安装方式：同步 `package.json`、`skill-runtime.json`、`scripts/validate-structure.js`、`SKILL.md`、`README.md`、`README_EN.md`。
- 修改 command 契约：同步 `scripts/command-contract.js`、`commands/team-build.md`、`assets/templates/command.md.tpl`、生成器、内外校验器、质量门禁和发布回归。
- 修改生成结构：同步 `docs/reference-standard.md`、`scripts/generation-plan.js`、生成器、模板和 `scripts/validate-generated-skill.js`。
- 修改升级或 manifest：同步 `docs/generated-skill-evolution.md`、`scripts/generated-artifacts.js`、生成器、校验器和发布回归。
- 修改规格字段：同步 Schema、规格指南、校验器、评分器和 fixture。
- 不得回退或覆盖工作区中与当前任务无关的未提交变更。

## 必跑命令

```bash
npm run verify:install
npm test
npm pack --dry-run --json
git status --short
```

安装零写入必须通过文件哈希或只读目录额外验证。结构检查不能替代完整回归；工厂 V2 也不能表述为生成团队业务能力已验证。

## 安全规则

- 生成、dry-run 和审计核心链路保持离线，不依赖凭据。
- 输出路径必须继续拒绝根目录、用户主目录、仓库根目录、绝对路径绕过和 `..` 穿越。
- 外部 Skill 只进入声明和 Adapter；没有用户明确授权不得安装。
- 高风险领域必须保留人工责任、批准阻断、免责声明和证据规则。
<!-- ai-work-team:buildContext:end -->
