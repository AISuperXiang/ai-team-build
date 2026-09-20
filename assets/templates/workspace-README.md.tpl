# Workspace

本目录保存过程产物、证据、决策、风险和交付摘要。

每个任务使用独立目录，并至少维护：

- `workflow-status.json`
- `decision-log.md`
- `risk-register.md`
- `role-handoff.md`
- `delivery-summary.md`
- `iteration-feedback.json`
- `evidence/README.md`

状态必须包含复杂度、执行档位、分维度 V0-V4、rolePlan、阻塞、未覆盖风险和
`governanceControl`。终态前运行 `scripts/validate-workspace.js --require-ready --min-score 90`；
执行验收结果按 `assets/templates/acceptance-results.json` 建立，不得用模板存在性冒充场景执行。
任务完成或明确中止后按 `assets/templates/iteration-feedback.json` 记录反馈并聚合演进信号。
人工批准必须由真人完成并记录复核人、时间和证据；Agent 角色复核只能作为自动复核。
