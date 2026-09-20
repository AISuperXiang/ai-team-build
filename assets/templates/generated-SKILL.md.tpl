---
name: "{{skill.id}}"
description: "{{skill.description}} Use when users invoke {{commands.prefix}} or need this expert team."
---

# {{skill.name}}

## Agent 目标

{{skill.primaryValue}}

## 最小加载矩阵

| 当前任务 | 必读 | 按需读取 |
| --- | --- | --- |
| 路由与输入澄清 | 主命令、工作流路由表 | 候选工作流 |
| 执行工作流 | 目标工作流、执行协议 | active / consulted 角色 |
| 质量与风险复核 | 质量门禁、验证方法论 | 方法论、数据契约和模板 |
| 外部能力调用 | Adapter、安装策略 | 角色映射与 CLI 说明 |

只按需读取当前工作流和阶段所需文件，不一次性加载全部成员、文档或模板。

## 执行循环

1. Intake：形成问题、价值、约束和成功标准。
2. Route：选择主工作流。
3. Profile：选择 S/M/L/XL 和 lightweight/standard/assurance。
4. Activate Roles：形成 rolePlan，只加载 active/consulted 角色。
5. Govern：登记有效契约、授权 invocation、required checks 和人工审批策略。
6. Workspace：记录决策、风险、交接和证据。
7. Execute：按阶段推进并检查门禁。
8. Verify：使用结构化结果区分 assertion、runner 和 wrapper，并分别评定数据、事实、流程、策略结果和个性化能力。
9. Assess：用 `scripts/assess-governance.js` 派生 readiness，禁止手填终态通过。
10. Feedback：用 `iteration-feedback.json` 记录返工、角色、证据和能力缺口。
11. Deliver：交付价值、证据、风险、验证等级和复盘计划。
