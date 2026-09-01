from __future__ import annotations

from ..domain_tools import (
    InMemoryCareRecordStore,
    InMemoryCareTodoStore,
    SimulatedCallService,
)
from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus
from ..tools import InMemoryNotificationSink, InMemoryReminderStore


class CareCoordinationSkill:
    name = "care_coordination"

    def __init__(
        self,
        *,
        reminders: InMemoryReminderStore,
        records: InMemoryCareRecordStore,
        todos: InMemoryCareTodoStore,
        calls: SimulatedCallService,
        notifications: InMemoryNotificationSink,
    ) -> None:
        self._reminders = reminders
        self._records = records
        self._todos = todos
        self._calls = calls
        self._notifications = notifications

    def supports(self, intent: Intent) -> bool:
        return intent.kind in {
            IntentKind.REMINDER,
            IntentKind.CARE_RECORD,
            IntentKind.CARE_TODO,
            IntentKind.EMERGENCY_CALL,
        }

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if intent.kind is IntentKind.REMINDER:
            return self._create_reminder(intent, actor_id)
        if intent.kind is IntentKind.CARE_RECORD:
            return self._create_record(intent, actor_id)
        if intent.kind is IntentKind.CARE_TODO:
            return self._create_todo(intent, actor_id)
        return self._start_emergency_call(intent, actor_id)

    def _create_reminder(self, intent: Intent, actor_id: str) -> ExecutionResult:
        scheduled_for = str(intent.parameters.get("scheduled_for", "未指定"))
        message = str(intent.parameters.get("message", "")).strip()
        if scheduled_for == "未指定" or not message:
            return self._clarify("请告诉我提醒的时间和事项。")
        reminder = self._reminders.create(
            recipient=actor_id,
            scheduled_for=scheduled_for,
            message=message,
            created_by=actor_id,
        )
        return self._completed(
            "reminder_created",
            f"好的，我会在{scheduled_for}提醒您{message}。",
            {"reminder": reminder},
        )

    def _create_record(self, intent: Intent, actor_id: str) -> ExecutionResult:
        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return self._clarify("请告诉我要记录的护理事项。")
        record = self._records.create(content=content, created_by=actor_id)
        return self._completed(
            "care_record_created",
            "护理记录已保存。",
            {"record": record},
        )

    def _create_todo(self, intent: Intent, actor_id: str) -> ExecutionResult:
        title = str(intent.parameters.get("title", "")).strip()
        due = str(intent.parameters.get("due", "未指定"))
        if not title:
            return self._clarify("请告诉我要添加什么护理待办。")
        todo = self._todos.create(title=title, due=due, created_by=actor_id)
        return self._completed(
            "care_todo_created",
            f"已添加护理待办：{title}。",
            {"todo": todo},
        )

    def _start_emergency_call(self, intent: Intent, actor_id: str) -> ExecutionResult:
        contact = intent.target or "护理员"
        call = self._calls.start(
            contact=contact,
            priority="emergency",
            initiated_by=actor_id,
        )
        notification = self._notifications.emit(
            f"{actor_id}发起了应急呼叫。",
            contact,
            channel="urgent",
        )
        return self._completed(
            "emergency_call_started",
            f"正在紧急联系{contact}。",
            {"call": call, "notification": notification, "priority": "high"},
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
            code="missing_care_details",
            message=message,
            data={"skill": self.name},
        )

