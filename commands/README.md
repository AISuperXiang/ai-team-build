# Commands

本目录维护 `ai-team-build` 的 Slash 指令。

command 只负责触发和 workflow 路由，不声明角色候选池。角色候选池由 workflow `members` 定义，实际参与角色由运行期 `rolePlan` 决定。

主入口：`/team-build`

详细说明见 [`team-build.md`](team-build.md)。
