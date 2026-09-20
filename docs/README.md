# Docs

本目录维护 `ai-team-build` 的通用问题组队方法、运行治理、标品参考、规格编写指南、风险控制、评分边界和生成物质量门禁。

## 架构约束

- `team-spec.json` 是语义设计与确定性生成之间的中间表示。
- command 是纯路由契约，不声明实际执行角色；workflow `members` 与运行期 `rolePlan` 负责角色调度。
- `npm run verify:install` 是只读安装验证，`npm test` 是完整生成、验收和发布回归。
- 生成型测试必须在系统临时目录运行并清理，不得向 Skill 根目录写入测试产物。
- `scripts/generate-team-skill.js` 是当前生成真源；公开 `.tpl` 的关键契约必须由结构校验防止漂移。
- 生成团队的静态 acceptance contracts 与场景 execution acceptance 必须分开报告；
  终态 readiness 只能由治理评估器从契约、授权、检查、运行结果和审批派生。
- 项目级维护规则见 [`../AGENTS.md`](../AGENTS.md)。

推荐读取顺序：

1. `reference-standard.md`
2. `generation-methodology.md`
3. `spec-authoring-guide.md`
4. `risk-control-standard.md`
5. `team-scoring-rubric.md`
6. `generated-skill-quality-gates.md`
7. `generated-skill-evolution.md`
8. `skill-evolution-methodology.md`
