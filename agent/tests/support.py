from __future__ import annotations

import json
from typing import Mapping

from care_bed_agent.bootstrap import build_default_system


def _intent(
    kind: str,
    *,
    target: str | None = None,
    action: str | None = None,
    parameters: Mapping[str, object] | None = None,
    utterance_type: str = "command",
    should_execute: bool = True,
) -> dict[str, object]:
    return {
        "kind": kind,
        "target": target,
        "action": action,
        "parameters": dict(parameters or {}),
        "confidence": 0.96,
        "negated": False,
        "should_execute": should_execute,
        "utterance_type": utterance_type,
    }


DEFAULT_INTENTS = {
    "把靠背升高一点": _intent(
        "bed_adjust",
        target="backrest",
        action="up",
        parameters={"amount": 5},
    ),
    "再高一点": _intent(
        "bed_adjust",
        action="up",
        parameters={"amount": 5},
    ),
    "调到吃饭姿势": _intent(
        "bed_scene",
        action="set_scene",
        parameters={"scene": "meal"},
    ),
    "把靠背大幅升高": _intent(
        "bed_adjust",
        target="backrest",
        action="up",
        parameters={"amount": 10},
    ),
    "把床全部放平": _intent(
        "bed_scene",
        action="set_scene",
        parameters={"scene": "sleep"},
    ),
    "马上停下": _intent(
        "stop",
        action="stop",
    ),
    "我今天感觉有一点奇怪": _intent(
        "unknown",
        utterance_type="statement",
        should_execute=False,
    ),
    "提醒我晚上八点吃药": _intent(
        "reminder",
        action="create",
        parameters={"scheduled_for": "晚上八点", "message": "吃药"},
    ),
    "记录一下今天已经测过血压": _intent(
        "care_record",
        action="create",
        parameters={"content": "今天已经测过血压"},
    ),
    "新增一个明天翻身的待办": _intent(
        "care_todo",
        action="create",
        parameters={"title": "翻身", "due": "明天"},
    ),
    "新增一个今天翻身的待办": _intent(
        "care_todo",
        action="create",
        parameters={"title": "翻身", "due": "今天"},
    ),
    "帮我呼叫护理员": _intent(
        "emergency_call",
        target="护理员",
        action="call",
    ),
    "给女儿打电话": _intent(
        "live_call",
        target="女儿",
        action="start",
    ),
    "播放儿子的留言": _intent(
        "voice_message",
        target="儿子",
        action="play",
    ),
    "播放女儿的留言": _intent(
        "voice_message",
        target="女儿",
        action="play",
    ),
    "给女儿留言说我很好": _intent(
        "voice_message",
        target="女儿",
        action="send",
        parameters={"content": "我很好"},
    ),
    "今天是不是有家人过生日": _intent(
        "anniversary",
        action="list_today",
        utterance_type="query",
    ),
    "给女儿送生日祝福": _intent(
        "anniversary",
        target="女儿",
        action="send_greeting",
    ),
    "今天有什么事": _intent(
        "today_agenda",
        action="list",
        utterance_type="query",
    ),
    "今天天气怎么样": _intent(
        "weather",
        action="query",
        utterance_type="query",
    ),
    "记一下明天买药": _intent(
        "note",
        action="create",
        parameters={"content": "明天买药"},
    ),
    "陪我聊聊天": _intent(
        "companion",
        action="chat",
        parameters={"reply": "我在呢。我们聊聊今天让您开心的事吧。"},
        utterance_type="statement",
    ),
    "播放一段京剧": _intent(
        "media",
        action="play",
        parameters={"query": "京剧"},
    ),
}


class ScriptedIntentModel:
    model_name = "test-ai-intent-model"

    def __init__(self, responses: Mapping[str, Mapping[str, object]] | None = None) -> None:
        self._responses = dict(DEFAULT_INTENTS if responses is None else responses)
        self.calls: list[tuple[list[dict[str, object]], str | None]] = []

    def complete(
        self,
        messages: list[dict[str, object]],
        *,
        response_format: str | None = None,
    ) -> str:
        self.calls.append((messages, response_format))
        text = str(messages[-1]["content"])
        payload = self._responses.get(
            text,
            _intent(
                "unknown",
                utterance_type="unknown",
                should_execute=False,
            ),
        )
        return json.dumps(payload, ensure_ascii=False)


def build_test_system():
    return build_default_system(intent_model=ScriptedIntentModel())
