# APP 对接说明

本目录是 `agent/` 对 `app/` 提供的唯一稳定边界。APP 只依赖 HTTP 契约，不导入 Agent 内部代码。

## 当前接口

| 方法 | 地址 | 用途 | 处理路径 |
|---|---|---|---|
| `GET` | `/health` | 服务存活检查 | 普通查询 |
| `GET` | `/api/v1/state` | 查询共享床体状态 | 普通查询 |
| `GET` | `/api/v1/capabilities` | 查询四个功能域及能力列表 | 普通查询 |
| `GET` | `/api/v1/agenda/today?actor_id=elder-1` | 聚合今日提醒、护理待办和纪念日 | 普通查询 |
| `GET` | `/api/v1/demo/overview` | 读取演示所需的业务总览 | 普通查询 |
| `GET` | `/api/v1/reminders` | 查询护理提醒 | 普通查询 |
| `POST` | `/api/v1/reminders` | 创建结构化护理提醒 | 规则路径 |
| `POST` | `/api/v1/agent/messages` | 提交自然语言或复合请求 | Agent 路径 |

## UI 接入建议

1. 首页功能入口读取 `/api/v1/capabilities`，不要在 APP 中复制 Agent 的技能定义。
2. 今日页读取 `/api/v1/agenda/today`；演示看板读取 `/api/v1/demo/overview`。
3. 表单已经得到完整结构化字段时，直接调用业务接口，不绕行 Agent。
4. 只有用户输入自然语言或模糊请求时，才调用 `/api/v1/agent/messages`。
5. 根据 Agent 返回的 `status`、`code` 和 `data` 渲染结果，不解析自然语言文案来判断业务状态。

服务配置 `GLM_API_KEY` 后，消息接口的所有普通自然语言都会调用一次 `glm-5.3-flash`，生产路径不再使用关键词模板。这不会改变 APP 的请求或响应结构；模型不可用时接口返回明确错误且不执行动作。当前消息接口仍只接收文本，图片能力仅在底层模型适配器中预留。

## 安全边界

手机 APP 当前不提供远程床体控制。即使通过 Agent 消息接口提交床控语句，服务也会返回 `403` 和 `remote_bed_control_forbidden`。床体状态接口仅用于展示。

当前业务数据、天气、通话和媒体均为演示实现，服务重启后内存数据会清空。完整字段定义见 `openapi.json`。
