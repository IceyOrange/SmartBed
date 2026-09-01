# 护理床 Agent

该模块是独立运行的智能护理床任务中枢和 HTTP 后端。家属端与床侧页面通过公开接口访问它；Agent 不嵌入前端，也不接管所有控制事件。

## 核心原则

1. 实体手柄、急停和机械保护不经过 Agent。
2. 固定条件触发的提醒、同步和通知优先走规则路径。
3. 所有自然语言、模糊请求、上下文表达和复合任务统一由 AI 识别。
4. 直控、规则和 Agent 三条路径共享状态，但执行权彼此独立。
5. Agent 不直接驱动电机；床体命令必须经过确定性安全校验和床控接口。
6. APP 与 Agent 分开运行，只通过 `contracts/openapi.json` 对接。

## 已接入能力

| 功能域 | 演示能力 |
|---|---|
| 身体自主 | 床体控制、情景姿态、连续微调、停止与限位 |
| 照护协同 | 护理提醒、护理记录、护理 Todo、模拟应急呼叫 |
| 关系链接 | 模拟实时通话、非实时留言、生日查询与祝福 |
| 日常生活 | 今日事项、演示天气、帮助记事、轻量陪聊、模拟点播 |

## 目录边界

```text
agent/
├── contracts/             # 面向 APP 的稳定 HTTP 契约
├── docs/                  # Agent 架构说明
├── src/care_bed_agent/    # 分流、Agent、技能、工具和 API
└── tests/                 # 行为与接口测试
```

`app/` 不属于本模块，本模块也不会导入或修改 APP 内部代码。

## 运行方式

推荐在项目根目录运行 `npm run dev`，启动器会先启动并检查 Agent，再启动前端。

需要单独排查 Agent 时：

```powershell
cd agent
$env:PYTHONPATH = "src"
python -m care_bed_agent
```

默认监听 `http://127.0.0.1:8765`。可用接口包括：

- `/api/v1/health`：版本化健康检查；
- `/api/v1/speech/status`：检查 Windows 本机中文识别器并取得本次启动的语音请求令牌；
- `/api/v1/speech/recognize`：使用默认麦克风进行一次最长 8 秒的本机中文听写；
- `/api/v1/state`：设备与床体状态；
- `/api/v1/capabilities`：功能域目录；
- `/api/v1/agenda/today`：今日事项聚合；
- `/api/v1/demo/overview`：演示状态总览；
- `/api/v1/reminders`：护理提醒查询与创建，资源路径支持更新和删除；
- `/api/v1/voice-messages`：写入家属语音留言；
- `/api/v1/calls`：开始通话，资源路径支持结束通话；
- `/api/v1/agent/messages`：家属端自然语言请求，固定使用 APP 来源；
- `/api/v1/bedside/messages`：床侧自然语言请求，固定使用 VOICE 来源。

## GLM-5.3-Flash 配置

Agent 已接入智谱 Chat Completion API，默认模型为 `glm-5.3-flash`。无需安装额外 SDK。

推荐复制配置模板，并只在本地填写密钥：

```powershell
cd agent
Copy-Item .env.example .env
# 编辑 .env，将 GLM_API_KEY= 后面填写为你的 API Key
python -m care_bed_agent
```

也可以直接通过当前终端设置：

```powershell
$env:GLM_API_KEY = "你的 API Key"
python -m care_bed_agent
```

启动时会自动读取 `agent/.env`，但已经存在的系统环境变量优先。`.env` 已加入忽略列表，不应提交或分享。

通用模型参数保留官方推荐值；自然语言意图识别使用独立的低延迟配置：

| 参数 | 默认值 |
|---|---|
| `model` | `glm-5.3-flash` |
| `temperature` | `1` |
| `top_p` | `0.95` |
| `reasoning_effort` | `max` |
| `thinking.type` | `enabled` |
| `thinking.clear_thinking` | `false` |
| `stream` | `true` |
| `tool_stream` | `true` |

| 意图识别参数 | 默认值 |
|---|---|
| `GLM_INTENT_TEMPERATURE` | `0.2` |
| `GLM_INTENT_TOP_P` | `0.8` |
| `GLM_INTENT_REASONING_EFFORT` | `low` |
| `GLM_INTENT_CLEAR_THINKING` | `false` |
| `GLM_INTENT_TIMEOUT_SECONDS` | `15` |

生产代码不再使用自然语言关键词模板。每条普通自然语言请求都会调用一次 GLM，并要求模型同时返回结构化意图、否定状态、执行意愿和置信度；轻量陪聊的短回复也包含在同一次 JSON 响应中，避免二次模型调用。模型不可直接调用电机，所有动作仍经过结构校验、来源权限、技能和确定性控制器。

未设置 `GLM_API_KEY`、模型超时或请求失败时，自然语言请求不会回退到关键词猜测，也不会执行动作。实体手柄、固定急停、定时器、APP 结构化操作和设备状态同步仍可独立工作。

底层客户端可以透传文档规定的 `image_url` 内容块；当前公开的 `/api/v1/agent/messages` 仍保持纯文本输入，避免在本阶段扩大 APP 接口范围。

## 演示语句

```text
提醒我晚上八点吃药
记录一下今天已经测过血压
新增一个明天翻身的待办
帮我呼叫护理员
给女儿打电话
播放儿子的留言
今天是不是有家人过生日
给女儿送生日祝福
今天有什么事
今天天气怎么样
记一下明天买药
陪我聊聊天
播放一段京剧
```

## 测试

```powershell
cd agent
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONPATH = "src"
python -B -m unittest discover -s tests -v
```

## 演示限制

- 本机语音识别依赖 Windows `System.Speech` 的 `zh-CN` 识别器和系统默认输入设备；音频只在本机处理，不会上传。
- 语音接口限制为本地演示页来源，并使用 Agent 每次启动时生成的随机令牌；本机识别不可用时前端才回退到浏览器识别。
- 未配置 `GLM_API_KEY` 时，自然语言请求返回 `ai_not_configured`，不会猜测或执行；非自然语言路径不受影响。
- 服务启动时会写入家属端演示种子数据；提醒、记录、待办、留言和通话保存在内存中，重启后会重置。
- 通话、媒体、天气、床控硬件和外部护理系统为演示实现，不会驱动真实设备或生产系统。
- 手机 APP 禁止远程床控，即使从 Agent 对话入口提出也会被安全策略拒绝。
- 床侧大幅动作和复位必须二次确认；取消或停止会清除该用户的待确认动作。
