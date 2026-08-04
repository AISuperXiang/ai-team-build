---
id: {{workflow.id}}
title: {{workflow.title}}
execution_mode: {{workflow.execution_mode}}
---

# {{workflow.title}}

## 角色激活

`members` 是候选角色池。执行前必须形成 rolePlan；not_applicable 角色不生成产物或评分。

## 阶段表

{{workflow.stages}}

## 失败与停止

- 必需门禁失败时停止进入下一阶段。
- 验证失败、范围扩大或高风险信号出现时升级档位并重评角色。
