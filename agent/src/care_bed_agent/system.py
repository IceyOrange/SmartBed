from __future__ import annotations

from typing import Mapping, Sequence, cast

from .direct_control import DirectControlHandler
from .domain_tools import (
    InMemoryAnniversaryStore,
    InMemoryCareRecordStore,
    InMemoryCareTodoStore,
    InMemoryNoteStore,
    InMemoryVoiceMessageStore,
    DemoWeatherService,
    SimulatedMediaService,
    SimulatedCallService,
)
from .models import (
    ExecutionResult,
    ExecutionStatus,
    HandledEvent,
    IncomingEvent,
    ProcessingPath,
)
from .orchestrator import AgentOrchestrator
from .read_models import DemoReadModel
from .routing import EventRouter
from .rules import RuleEngine
from .state import SharedStateStore, StateSnapshot
from .tools import InMemoryNotificationSink, InMemoryReminderStore


class CareBedSystem:
    def __init__(
        self,
        *,
        state: SharedStateStore,
        router: EventRouter,
        direct: DirectControlHandler,
        rules: RuleEngine,
        agent: AgentOrchestrator,
        notifications: InMemoryNotificationSink,
        reminders: InMemoryReminderStore,
        care_records: InMemoryCareRecordStore,
        care_todos: InMemoryCareTodoStore,
        calls: SimulatedCallService,
        voice_messages: InMemoryVoiceMessageStore,
        anniversaries: InMemoryAnniversaryStore,
        notes: InMemoryNoteStore,
        weather: DemoWeatherService,
        media: SimulatedMediaService,
        read_model: DemoReadModel,
    ) -> None:
        self.state = state
        self.notifications = notifications
        self.reminders = reminders
        self.care_records = care_records
        self.care_todos = care_todos
        self.calls = calls
        self.voice_messages = voice_messages
        self.anniversaries = anniversaries
        self.notes = notes
        self.weather = weather
        self.media = media
        self.read_model = read_model
        self._router = router
        self._direct = direct
        self._rules = rules
        self._agent = agent

    def snapshot(self) -> StateSnapshot:
        return self.state.snapshot()

    def handle_event(self, event: IncomingEvent) -> HandledEvent:
        decision = self._router.route(event)
        if decision.path is ProcessingPath.DIRECT:
            result = self._direct.handle(event)
        elif decision.path is ProcessingPath.RULE:
            result = self._rules.handle(event)
        elif decision.path is ProcessingPath.AGENT:
            result = self._handle_agent(event)
        else:
            snapshot = self.state.apply_device_report(dict(event.payload))
            result = ExecutionResult(
                status=ExecutionStatus.COMPLETED,
                code="state_observed",
                message="设备状态已同步。",
                data=snapshot.to_dict(),
            )

        return HandledEvent(
            event_id=event.event_id,
            path=decision.path,
            status=result.status,
            code=result.code,
            message=result.message,
            data=result.data,
        )

    def _handle_agent(self, event: IncomingEvent) -> ExecutionResult:
        text = str(event.payload.get("text", "")).strip()
        if not text:
            return ExecutionResult(
                status=ExecutionStatus.REJECTED,
                code="missing_text",
                message="自然语言请求不能为空。",
            )
        history = cast(
            Sequence[Mapping[str, str]],
            event.payload.get("history", ()),
        )
        return self._agent.handle_text(
            text,
            actor_id=event.actor_id or "bed-user",
            source=event.source,
            history=history,
        )
