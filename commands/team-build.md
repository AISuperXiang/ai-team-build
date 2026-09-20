---
id: team-build
title: /team-build 快捷指令
triggers:
  - /team-build
execution_mode: sequential
---

# /team-build 快捷指令

## 命令表

| 指令 | 目标 | 必需输入 | 默认输出 |
| --- | --- | --- | --- |
| `/team-build intake <团队目标>` | 梳理目标、受众、核心任务、边界和风险 | 团队目标 | 目标契约、缺口、建议下一步 |
| `/team-build spec <团队目标>` | 生成 `team-spec.json` | 团队目标 | 团队规格草案 |
| `/team-build review <team-spec.json>` | 审查规格完整性并预评分 | 规格文件路径 | 角色、命令、工作流、领域内容、验收场景、风险和评分结论 |
| `/team-build create <团队目标>` | 从目标生成规格并物化 Skill | 团队目标，可选输出路径 | 新团队 Skill 目录、验证结果、`evaluation-report.md` |
| `/team-build from-spec <spec-path>` | 从已有规格生成 Skill | `team-spec.json` 路径 | 新团队 Skill 目录、验证结果、`evaluation-report.md` |
| `/team-build validate <skill-path>` | 校验生成出来的 Skill | 生成物目录 | 结构、契约和风险约束检查结果 |
| `/team-build score <team-spec.json>` | 对团队规格打分并给升级建议 | 规格文件路径 | 总分、等级、短板和能力升级建议 |
| `/team-build upgrade <skill-path> [spec]` | 基于规范和 manifest 安全升级生成团队 | 0.6+ 生成团队，可选更新后规格 | 漂移冲突、保留文件和升级结果 |
| `/team-build elevate <skill-path...>` | 审计并升华已有 Skill | 一个或多个 Skill 路径，或 skills 根目录 | 静态审计报告、优先级、改进计划和验证清单 |
| `/team-build list-templates` | 列出内置模板 | 无 | 可生成资产清单 |

## 自然语言触发

| 用户说法 | 等价指令 |
| --- | --- |
| “帮我搭建一个 A 股炒股团队 Skill” | `/team-build create A股炒股团队` |
| “创建一个客服质检团队 Skill” | `/team-build create 客服质检团队` |
| “根据这个规格生成团队 Skill” | `/team-build from-spec <spec-path>` |
| “校验这个生成出来的团队 Skill” | `/team-build validate <skill-path>` |
| “给这个团队 Skill 打分，看哪里能升级” | `/team-build score <team-spec.json>` |
| “根据使用反馈升级这个生成团队” | `/team-build upgrade <skill-path> [spec]` |
| “批量检查这些 Skill 可以怎样升华” | `/team-build elevate <skill-path...>` |
| “先帮我推导角色和 workflow” | `/team-build spec <团队目标>` |

## 执行要求

1. 解析指令后读取 `schemas/team-spec.schema.json`。
2. 生成或补齐规格前读取 `docs/generation-methodology.md`、`docs/risk-control-standard.md` 和 `domain-packs/README.md`。
3. 生成前必须形成 v2 `team-spec.json`，补齐 `teamDesign`、`governance`、角色激活、领域知识、能力矩阵、结构化验收场景和数据契约；不得直接手写大量产物。
4. Agent 负责从问题价值链完成语义组队；自然语言目标可调用 `scripts/synthesize-team-spec.js --goal <目标>` 选择 domain pack 或生成通用受控草案。
5. 从规格生成时调用 `scripts/generate-team-skill.js`。
6. `--dry-run` 只输出 GenerationPlan，不写入或删除目录。
7. 生成后调用 `scripts/validate-generated-skill.js`。
8. 生成后调用 `<generated>/scripts/run-acceptance-scenarios.js <generated> --mode contracts`；
   只有获得真实场景结果时才调用 `--mode execution --results <workspace-relative-json>`。
9. 生成后读取 `evaluation-report.md` 或调用 `scripts/score-team-spec.js`。
10. 对 `/team-build upgrade` 读取 `docs/generated-skill-evolution.md`，先聚合反馈并更新规范，再执行 `--upgrade --dry-run`；有 managed-file 冲突时不得写入。
11. 输出生成路径、角色数量、命令数量、工作流数量、内容深度、验收资产、Adapter、蓝图认证、工厂/团队验证等级、评分结论、升级建议和风险约束。
12. 对 `/team-build elevate` 读取 `docs/skill-evolution-methodology.md`，先运行 `scripts/audit-skills.js` 获取静态基线，再按 P0/P1/P2 优先级实施最小改动。
13. `audit-skills.js` 不执行目标 Skill 脚本；修改完成后，只有在环境和副作用边界已确认时才运行目标 Skill 的验证命令，并复跑审计。

## 失败处理

- 缺少团队目标：要求用户补充目标、受众、核心任务、风险边界。
- 无法推导角色：先产出候选角色并要求用户裁决。
- 输出目录已存在：默认阻断；维护仓库使用 `--upgrade`。`--overwrite` 仅适用于有有效 manifest、无 Git、无漂移和无额外文件的可丢弃目录。
- 升级发现受管文件已修改、删除或被同名本地文件占用：写入前阻断并输出冲突清单。
- 旧生成团队缺少 `generation-manifest.json`：生成到独立目录并人工合并一次，不猜测覆盖。
- 高风险领域缺少风险约束：阻断生成，要求补充免责声明、禁止性承诺和证据规则。
- 高风险领域缺少人工责任人、复核触发条件或无批准阻断：阻断生成。
- 缺少领域内容或验收场景：允许生成草案，但不得评为 A 级；需列为高优先级升级项。
- 声明 external skills 但缺少 adapters：不得评为 A 级，需补充输入输出、授权、降级和验证命令。
- 静态 acceptance contract 失败：阻断交付，先补齐缺失产物、门禁、失败样例或风险文案。
- execution acceptance 失败：保留 V0/待验边界；不得用静态契约通过替代场景执行。
- 治理评估不为 ready：终态 claim 保持 pending/candidate，补齐契约、授权、检查、运行证据或适用审批。
- 规格校验失败：返回失败项，不进入 Generate 阶段。
- 生成物校验失败：返回失败项、影响和修复建议。
- 评分低于 80 分：允许交付但必须列出优先升级项；低于 70 分时建议不要作为正式团队 Skill 使用。
- A 级评分只代表蓝图契约通过；不得将工厂 V2 表述为生成团队业务能力已验证，团队初始等级保持 V0。
- 审计目标没有 `SKILL.md`：列出无效路径，不对相邻目录做猜测性修改。
- 目标 Skill 验证命令未知或不可安全执行：交付静态审计与建议命令，明确“未运行”，不得给出运行时通过结论。
