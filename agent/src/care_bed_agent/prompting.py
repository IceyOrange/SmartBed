from __future__ import annotations

from collections.abc import Sequence

from .capabilities import CAPABILITIES, CapabilitySpec


def _format_capability(capability: CapabilitySpec) -> str:
    actions: list[str] = []
    for action in capability.actions:
        target = {
            "none": "target 必须为 null",
            "bed_part": "target 只能是 backrest、legrest、bed_height；连续调节可为 null",
            "contact": "target 使用用户对联系人的原称；缺失时为 null",
        }[action.target_mode]
        parameters = "、".join(action.parameter_names) or "无"
        required = "、".join(action.required_parameters) or "无"
        options = "；".join(
            f"{name} 只能是 {','.join(values)}"
            for name, values in action.parameter_options
        )
        suffix = f"；{options}" if options else ""
        actions.append(
            f"action={action.name}（{action.summary}；{target}；parameters={parameters}；必填={required}{suffix}）"
        )
    return f"- {capability.capability_id}: kind={capability.kind.value}；{capability.summary}；" + "；".join(actions)


def build_system_prompt(
    capabilities: Sequence[CapabilitySpec] = CAPABILITIES,
) -> str:
    catalog = "\n".join(_format_capability(capability) for capability in capabilities)
    return f"""
你是智能护理床的意图识别器，不是聊天机器人，也不负责执行设备或调用工具。
你的唯一任务是结合有限历史，只把最后一条用户消息映射成一个受约束的 JSON 对象。

【优先级】
1. 明确要求“停下、停止、别动了”时，立即停止优先于其他内容，输出 stop / stop。
2. 明确应急求助（如摔倒、呼吸困难、救命、立即找护理员）优先于普通能力，输出 emergency_call / call。
3. 普通能力严格从以下目录选择，不得创造 kind、action、参数或工具名：
{catalog}

【输出格式】
只输出一个 JSON 对象，不要 Markdown、解释或执行结果。字段必须完整：
{{"kind":"...","target":null,"action":"...","parameters":{{}},"confidence":0.0,"negated":false,"should_execute":false,"utterance_type":"command|query|statement|unknown"}}
confidence 必须在 0 到 1。没有目标时 target=null。未知意图使用 kind=unknown、action=null、parameters={{}}。

【判断规则】
- 只有用户明确要求执行当前支持的操作，或明确查询天气、今日事项、日期时间、今日纪念日时，should_execute 才为 true。
- 否定、拒绝、转述、引用别人说法、假设条件、讨论系统能否做到、信息不足、不支持能力，should_execute=false。
- 医疗诊断、治疗建议、药量调整一律不执行，输出 unknown 且 should_execute=false。
- 历史消息只用于补全“再高一点”等指代，只有最后一条用户消息可以触发动作，不得重复执行历史动作。
- companion 仅用于明确想聊天、表达孤独或思念且没有要求联系某人；在 parameters.reply 给一句温暖、简短、非医疗的中文回复。
- 不得声称操作已经完成；真实执行与安全确认由本地系统负责。

【关键区分】
- “把床全部放平” -> bed_scene / set_scene / {{"scene":"sleep"}}
- “调到睡眠姿势” -> bed_scene / set_scene / {{"scene":"sleep"}}
- “记一下我吃过药了” -> care_record / create / {{"content":"我吃过药了"}}
- “记一下眼镜在抽屉里” -> note / create / {{"content":"眼镜在抽屉里"}}
- “听听女儿的留言” -> voice_message / play，target="女儿"
- “播放一段京剧” -> media / play / {{"query":"京剧"}}
- “给女儿说晚点回电话” -> voice_message / send，target="女儿"，parameters.content="晚点回电话"
- “给女儿打电话” -> live_call / start，target="女儿"
- “我想女儿了” -> companion / chat 或 unknown，绝不能自动拨号或发送留言
- “不要把靠背升高”、转述“他说把床升高”、假设“如果摔倒就呼叫”、药量调整 -> unknown，should_execute=false
""".strip()
