from __future__ import annotations

from .intents import (
    ConversationContextStore,
    IntentInterpretationError,
    IntentInterpreter,
    IntentKind,
)
from .models import EventSource, ExecutionResult, ExecutionStatus
from .policy import AgentAccessPolicy
from .skills.base import SkillRegistry


class AgentOrchestrator:
    _CONFIRMATIONS = {"确认", "可以", "好的", "继续执行", "执行吧"}
    _CANCELLATIONS = {"取消", "不用了", "算了", "不要了"}

    def __init__(
        self,
        interpreter: IntentInterpreter,
        contexts: ConversationContextStore,
        skills: SkillRegistry,
        access_policy: AgentAccessPolicy,
    ) -> None:
        self._interpreter = interpreter
        self._contexts = contexts
        self._skills = skills
        self._access_policy = access_policy

    def handle_text(
        self,
        text: str,
        actor_id: str,
        source: EventSource = EventSource.VOICE,
    ) -> ExecutionResult:
        normalized = text.strip()
        if normalized in self._CONFIRMATIONS:
            return self._confirm_pending(actor_id, source)
        if normalized in self._CANCELLATIONS:
            pending = self._contexts.take_pending(actor_id)
            return ExecutionResult(
                status=(
                    ExecutionStatus.COMPLETED
                    if pending is not None
                    else ExecutionStatus.NEEDS_CLARIFICATION
                ),
                code="action_cancelled" if pending is not None else "no_pending_confirmation",
                message=(
                    "好的，已取消刚才的操作。"
                    if pending is not None
                    else "当前没有等待确认的操作。"
                ),
                data=self._interpretation_data(pending) if pending is not None else {},
            )

        try:
            interpreted = self._interpreter.interpret(text)
        except IntentInterpretationError as error:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                code=error.code,
                message=error.message,
                data={},
            )
        intent = self._contexts.resolve(actor_id, interpreted)
        if intent.kind is IntentKind.UNKNOWN:
            if intent.negated:
                return ExecutionResult(
                    status=ExecutionStatus.COMPLETED,
                    code="action_not_executed",
                    message="好的，不会执行这个操作。",
                    data={},
                )
            result = ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="unknown_intent",
                message="我还不能确定您想做什么，请换一种说法。",
                data={},
            )
            return self._with_interpretation(result, intent)

        rejected = self._access_policy.evaluate(intent, source)
        if rejected is not None:
            return self._with_interpretation(rejected, intent)

        if intent.kind is IntentKind.STOP:
            self._contexts.clear_pending(actor_id)
        elif source is EventSource.VOICE and self._requires_confirmation(intent):
            self._contexts.defer(actor_id, intent)
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CONFIRMATION,
                code="confirmation_required",
                message="这是幅度较大的床体动作，请确认是否执行。",
                data=self._interpretation_data(intent),
            )

        return self._execute(intent, actor_id)

    def _confirm_pending(self, actor_id: str, source: EventSource) -> ExecutionResult:
        intent = self._contexts.take_pending(actor_id)
        if intent is None:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="no_pending_confirmation",
                message="当前没有等待确认的操作。",
                data={},
            )
        rejected = self._access_policy.evaluate(intent, source)
        if rejected is not None:
            return self._with_interpretation(rejected, intent)
        return self._execute(intent, actor_id)

    def _execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        skill = self._skills.find(intent)
        if skill is None:
            result = ExecutionResult(
                status=ExecutionStatus.FAILED,
                code="skill_not_configured",
                message="我理解了您的需求，但对应能力尚未接入。",
                data={"intent": intent.kind.value},
            )
            return self._with_interpretation(result, intent)

        result = skill.execute(intent, actor_id)
        if result.status is ExecutionStatus.COMPLETED:
            self._contexts.remember(actor_id, intent)
        return self._with_interpretation(result, intent)

    @staticmethod
    def _requires_confirmation(intent: Intent) -> bool:
        if intent.kind is IntentKind.BED_SCENE:
            return True
        if intent.kind is not IntentKind.BED_ADJUST:
            return False
        try:
            return int(intent.parameters.get("amount", 5)) >= 10
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _interpretation_data(intent: Intent) -> dict[str, object]:
        return {
            "interpretation": {
                "kind": intent.kind.value,
                "target": intent.target,
                "action": intent.action,
                "parameters": dict(intent.parameters),
                "confidence": intent.confidence,
                "utterance_type": intent.utterance_type,
            }
        }

    @classmethod
    def _with_interpretation(
        cls,
        result: ExecutionResult,
        intent: Intent,
    ) -> ExecutionResult:
        return ExecutionResult(
            status=result.status,
            code=result.code,
            message=result.message,
            data={**result.data, **cls._interpretation_data(intent)},
        )
