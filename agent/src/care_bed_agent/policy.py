from __future__ import annotations

from .intents import Intent, IntentKind
from .models import EventSource, ExecutionResult, ExecutionStatus


class AgentAccessPolicy:
    _BED_INTENTS = {IntentKind.BED_ADJUST, IntentKind.BED_SCENE, IntentKind.STOP}

    def evaluate(self, intent: Intent, source: EventSource) -> ExecutionResult | None:
        if source is EventSource.APP and intent.kind in self._BED_INTENTS:
            return ExecutionResult(
                status=ExecutionStatus.REJECTED,
                code="remote_bed_control_forbidden",
                message="手机端不提供远程床体控制，请使用床端语音或实体手柄。",
                data={"intent": intent.kind.value},
            )
        return None

