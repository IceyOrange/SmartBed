from __future__ import annotations

from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus
from ..ports import AnniversaryPort, CallPort, VoiceMessagePort
from .base import KindCapabilityHandler


def _completed(code: str, message: str, data: dict[str, object]) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.COMPLETED,
        code=code,
        message=message,
        data={**data, "skill": "relationship"},
    )


def _clarify(message: str) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.NEEDS_CLARIFICATION,
        code="missing_relationship_details",
        message=message,
        data={"skill": "relationship"},
    )


class LiveCallHandler(KindCapabilityHandler):
    capability_id = "relationship.live_call"
    intent_kind = IntentKind.LIVE_CALL
    actions = frozenset({"start"})
    name = "relationship"

    def __init__(self, calls: CallPort) -> None:
        self._calls = calls

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if not intent.target:
            return _clarify("请告诉我需要联系谁。")
        call = self._calls.start(
            contact=intent.target,
            priority="normal",
            initiated_by=actor_id,
        )
        return _completed("call_started", f"正在联系{intent.target}。", {"call": call})


class VoiceMessageHandler(KindCapabilityHandler):
    capability_id = "relationship.voice_message"
    intent_kind = IntentKind.VOICE_MESSAGE
    actions = frozenset({"play", "send"})
    name = "relationship"

    def __init__(self, voice_messages: VoiceMessagePort) -> None:
        self._voice_messages = voice_messages

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if not intent.target:
            return _clarify("请告诉我需要收听或留言给谁。")
        if intent.action == "play":
            message = self._voice_messages.play_latest(sender=intent.target, recipient=actor_id)
            if message is None:
                return _completed(
                    "voice_message_not_found",
                    f"暂时没有来自{intent.target}的留言。",
                    {"voice_message": None},
                )
            return _completed(
                "voice_message_playing",
                str(message["content"]),
                {"voice_message": message},
            )

        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return _clarify("请告诉我要留言的内容。")
        message = self._voice_messages.send(
            sender=actor_id,
            recipient=intent.target,
            content=content,
        )
        return _completed(
            "voice_message_sent",
            f"已给{intent.target}留言。",
            {"voice_message": message},
        )


class AnniversaryHandler(KindCapabilityHandler):
    capability_id = "relationship.anniversary"
    intent_kind = IntentKind.ANNIVERSARY
    actions = frozenset({"list_today", "send_greeting"})
    name = "relationship"

    def __init__(
        self,
        anniversaries: AnniversaryPort,
        voice_messages: VoiceMessagePort,
    ) -> None:
        self._anniversaries = anniversaries
        self._voice_messages = voice_messages

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if intent.action == "send_greeting":
            if not intent.target:
                return _clarify("请告诉我要祝福谁。")
            content = f"祝{intent.target}生日快乐，平安顺心！"
            message = self._voice_messages.send(
                sender=actor_id,
                recipient=intent.target,
                content=content,
            )
            return _completed(
                "anniversary_greeting_sent",
                f"生日祝福已经送给{intent.target}。",
                {"voice_message": message},
            )

        items = self._anniversaries.today()
        message = "今天没有已记录的生日或纪念日。"
        if items:
            names = "、".join(str(item["person"]) for item in items)
            message = f"今天是{names}的生日。"
        return _completed("anniversaries_listed", message, {"anniversaries": items})
