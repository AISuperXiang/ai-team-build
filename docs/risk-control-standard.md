# Risk Control Standard

生成团队 Skill 时，风险控制必须进入规格、文档、Agent 执行入口和生成物校验。

## 风险分级

- `low`：一般信息整理、低风险创作、无重大决策影响。
- `medium`：影响业务决策、用户体验、数据处理或工程发布。
- `high`：投资、医疗、法律、财务、招聘、合规、安全等可能造成实质损失或权益影响的领域。

## 高风险团队强制项

高风险团队的 `riskControls` 必须包含：

- `requiredDisclaimers`：必须展示给用户的免责声明。
- `blockedClaims`：禁止输出的承诺或行为。
- `evidenceRules`：所有结论需要满足的证据要求。

## 投资类团队要求

投资类团队必须声明：

- 不构成投资建议。
- 不承诺收益。
- 不替代持牌投顾建议。
- 不输出确定性买卖指令。
- 必须说明数据来源、数据时效、仓位风险、止损条件和失效条件。
- 所有结论必须带证据、置信度和不确定性来源。

## 生成物落点

风险控制必须至少出现在：

- `SKILL.md`
- `docs/quality-gates.md`
- `docs/quality-rubrics.md`
- `generation-report.json`

`scripts/validate-generated-skill.js` 会检查高风险声明是否写入生成物。
