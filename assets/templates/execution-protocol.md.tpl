# Execution Protocol

1. Intake
2. Route
3. Profile
4. Activate Roles
5. Load
6. Govern
7. Workspace
8. Execute
9. Verify by scope
10. Assess
11. Record feedback
12. Score
13. Deliver

## Execution Profiles

- lightweight：S 级、可逆、有界任务。
- standard：多角色或有限跨模块任务。
- assurance：L/XL、高风险、敏感数据、权限或不可逆操作。

## Stop Conditions

- 必需门禁失败。
- 证据不足以支撑目标验证等级。
- 高风险任务缺少人工责任或批准。
- 并行写入或角色责任冲突尚未裁决。
- 终态 claim 与 `scripts/assess-governance.js` 派生的 readiness 不一致。
- 人工批准没有 `reviewerType=human`、复核人、时间或证据。
