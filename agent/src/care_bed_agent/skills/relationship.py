from __future__ import annotations

from ..domain_tools import (
    InMemoryAnniversaryStore,
    InMemoryVoiceMessageStore,
    SimulatedCallService,
)
from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus


class RelationshipSkill:
    name = "relationship"

    def __init__(
        self,
        *,
        calls: SimulatedCallService,
        voice_messages: InMemoryVoiceMessageStore,
        anniversaries: InMemoryAnniversaryStore,
    ) -> None:
        self._calls = calls
        self._voice_messages = voice_messages
        self._anniversaries = anniversaries

    def supports(self, intent: Intent) -> bool:
        return intent.kind in {
            IntentKind.LIVE_CALL,
            IntentKind.VOICE_MESSAGE,
            IntentKind.ANNIVERSARY,
        }

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if intent.kind is IntentKind.LIVE_CALL:
            return self._start_call(intent, actor_id)
        if intent.kind is IntentKind.VOICE_MESSAGE:
            return self._handle_message(intent, actor_id)
        return self._handle_anniversary(intent, actor_id)

    def _start_call(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if not intent.target:
            return self._clarify("请告诉我需要联系谁。")
        call = self._calls.start(
            contact=intent.target,
            priority="normal",
            initiated_by=actor_id,
        )
        return self._completed(
            "call_started",
            f"正在联系{intent.target}。",
            {"call": call},
        )

    def _handle_message(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if not intent.target:
            return self._clarify("请告诉我需要收听或留言给谁。")
        if intent.action == "play":
            message = self._voice_messages.play_latest(sender=intent.target, recipient=actor_id)
            if message is None:
                return self._completed(
                    "voice_message_not_found",
                    f"暂时没有来自{intent.target}的留言。",
                    {"voice_message": None},
                )
            return self._completed(
                "voice_message_playing",
                str(message["content"]),
                {"voice_message": message},
            )

        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return self._clarify("请告诉我要留言的内容。")
        message = self._voice_messages.send(
            sender=actor_id,
            recipient=intent.target,
            content=content,
        )
        return self._completed(
            "voice_message_sent",
            f"已给{intent.target}留言。",
            {"voice_message": message},
        )

    def _handle_anniversary(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if intent.action == "send_greeting":
            if not intent.target:
                return self._clarify("请告诉我要祝福谁。")
            content = f"祝{intent.target}生日快乐，平安顺心！"
            message = self._voice_messages.send(
                sender=actor_id,
                recipient=intent.target,
                content=content,
            )
            return self._completed(
                "anniversary_greeting_sent",
                f"生日祝福已经送给{intent.target}。",
                {"voice_message": message},
            )

        items = self._anniversaries.today()
        if not items:
            message = "今天没有已记录的生日或纪念日。"
        else:
            names = "、".join(str(item["person"]) for item in items)
            message = f"今天是{names}的生日。"
        return self._completed(
            "anniversaries_listed",
            message,
            {"anniversaries": items},
        )

    def _completed(self, code: str, message: str, data: dict[str, object]) -> ExecutionResult:
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code=code,
            message=message,
            data={**data, "skill": self.name},
        )

    def _clarify(self, message: str) -> ExecutionResult:
        return ExecutionResult(
            status=ExecutionStatus.NEEDS_CLARIFICATION,
            code="missing_relationship_details",
            message=message,
            data={"skill": self.name},
        )

