---
id: {{member.id}}
name: {{member.name}}
role: {{member.role}}
---

# {{member.name}}

## 职责边界

{{member.responsibilities}}

## 场景判断

- active：{{member.activation.activeWhen}}
- consulted：{{member.activation.consultedWhen}}
- not_applicable：{{member.activation.notApplicableWhen}}
- 重新评估：{{member.activation.reassessWhen}}
