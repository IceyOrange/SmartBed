from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .intents import IntentKind


TargetMode = Literal["none", "bed_part", "contact"]


@dataclass(frozen=True, slots=True)
class CapabilityAction:
    name: str
    summary: str
    target_mode: TargetMode = "none"
    parameter_names: tuple[str, ...] = ()
    required_parameters: tuple[str, ...] = ()
    parameter_options: tuple[tuple[str, tuple[str, ...]], ...] = ()
    examples: tuple[str, ...] = ()

    def options_for(self, parameter: str) -> tuple[str, ...]:
        return next(
            (values for name, values in self.parameter_options if name == parameter),
            (),
        )


@dataclass(frozen=True, slots=True)
class CapabilitySpec:
    capability_id: str
    kind: IntentKind
    summary: str
    actions: tuple[CapabilityAction, ...]

    def action_for(self, action: str) -> CapabilityAction | None:
        return next((item for item in self.actions if item.name == action), None)


CAPABILITIES: tuple[CapabilitySpec, ...] = (
    CapabilitySpec(
        "bed.adjust",
        IntentKind.BED_ADJUST,
        "小幅升降靠背、腿托或整床高度",
        (
            CapabilityAction("up", "升高", "bed_part", ("amount",), examples=("把靠背升高一点", "再高一点")),
            CapabilityAction("down", "降低", "bed_part", ("amount",), examples=("把腿托降低一点",)),
        ),
    ),
    CapabilitySpec(
        "bed.scene",
        IntentKind.BED_SCENE,
        "切换吃饭、看电视或睡眠姿势",
        (
            CapabilityAction(
                "set_scene",
                "切换预设姿势",
                parameter_names=("scene",),
                required_parameters=("scene",),
                parameter_options=(("scene", ("meal", "television", "sleep")),),
                examples=("把床全部放平", "调到睡眠姿势", "调到吃饭姿势"),
            ),
        ),
    ),
    CapabilitySpec("bed.stop", IntentKind.STOP, "立即停止床体动作", (CapabilityAction("stop", "立即停止", examples=("马上停下",)),)),
    CapabilitySpec(
        "care.reminder",
        IntentKind.REMINDER,
        "创建护理或生活提醒",
        (CapabilityAction("create", "创建提醒", parameter_names=("scheduled_for", "message"), required_parameters=("scheduled_for", "message"), examples=("提醒我晚上八点吃药",)),),
    ),
    CapabilitySpec(
        "care.record",
        IntentKind.CARE_RECORD,
        "记录已经发生的护理事实",
        (CapabilityAction("create", "保存护理记录", parameter_names=("content",), required_parameters=("content",), examples=("记一下我吃过药了", "记录一下今天已经测过血压")),),
    ),
    CapabilitySpec(
        "care.todo",
        IntentKind.CARE_TODO,
        "创建护理人员待办",
        (CapabilityAction("create", "创建护理待办", parameter_names=("title", "due"), required_parameters=("title",), examples=("新增一个明天翻身的待办",)),),
    ),
    CapabilitySpec(
        "care.emergency",
        IntentKind.EMERGENCY_CALL,
        "立即联系护理人员并发出高优先级通知",
        (CapabilityAction("call", "发起应急呼叫", "contact", examples=("救命，快叫护理员", "帮我呼叫护理员")),),
    ),
    CapabilitySpec(
        "relationship.live_call",
        IntentKind.LIVE_CALL,
        "与家人实时通话",
        (CapabilityAction("start", "发起实时通话", "contact", examples=("给女儿打电话",)),),
    ),
    CapabilitySpec(
        "relationship.voice_message",
        IntentKind.VOICE_MESSAGE,
        "收听或发送非实时留言",
        (
            CapabilityAction("play", "播放留言", "contact", examples=("听听女儿的留言",)),
            CapabilityAction("send", "发送留言", "contact", ("content",), ("content",), examples=("给女儿说晚点回电话",)),
        ),
    ),
    CapabilitySpec(
        "relationship.anniversary",
        IntentKind.ANNIVERSARY,
        "查询今日纪念日或发送生日祝福",
        (
            CapabilityAction("list_today", "查询今日生日或纪念日", examples=("今天是不是有家人过生日",)),
            CapabilityAction("send_greeting", "发送生日祝福", "contact", examples=("给女儿送生日祝福",)),
        ),
    ),
    CapabilitySpec("daily.agenda", IntentKind.TODAY_AGENDA, "查询今日事项", (CapabilityAction("list", "列出今日事项", examples=("今天有什么事",)),)),
    CapabilitySpec("daily.weather", IntentKind.WEATHER, "查询今日天气", (CapabilityAction("query", "查询天气", examples=("今天天气怎么样",)),)),
    CapabilitySpec(
        "daily.note",
        IntentKind.NOTE,
        "记录非护理类生活信息",
        (CapabilityAction("create", "保存生活记事", parameter_names=("content",), required_parameters=("content",), examples=("记一下眼镜在抽屉里",)),),
    ),
    CapabilitySpec(
        "daily.media",
        IntentKind.MEDIA,
        "点播音乐、戏曲或其他音频",
        (CapabilityAction("play", "播放媒体", parameter_names=("query",), required_parameters=("query",), examples=("播放一段京剧",)),),
    ),
    CapabilitySpec("daily.information", IntentKind.INFORMATION, "查询日期或时间", (CapabilityAction("query", "查询日期时间", examples=("今天几号",)),)),
    CapabilitySpec(
        "daily.companion",
        IntentKind.COMPANION,
        "提供简短、非医疗的陪伴回应",
        (CapabilityAction("chat", "轻量陪聊", parameter_names=("reply",), required_parameters=("reply",), examples=("陪我聊聊天", "我想女儿了")),),
    ),
)


def capability_for(kind: IntentKind, action: str) -> CapabilitySpec | None:
    return next(
        (
            capability
            for capability in CAPABILITIES
            if capability.kind is kind and capability.action_for(action) is not None
        ),
        None,
    )


def supported_intent_kinds() -> set[IntentKind]:
    return {capability.kind for capability in CAPABILITIES}
