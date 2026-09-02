from __future__ import annotations

from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus
from ..ports import CallPort, CareRecordPort, CareTodoPort, NotificationPort, ReminderPort
from .base import KindCapabilityHandler


def _completed(code: str, message: str, data: dict[str, object]) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.COMPLETED,
        code=code,
        message=message,
        data={**data, "skill": "care_coordination"},
    )


def _clarify(message: str) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.NEEDS_CLARIFICATION,
        code="missing_care_details",
        message=message,
        data={"skill": "care_coordination"},
    )


class ReminderHandler(KindCapabilityHandler):
    capability_id = "care.reminder"
    intent_kind = IntentKind.REMINDER
    actions = frozenset({"create"})
    name = "care_coordination"

    def __init__(self, reminders: ReminderPort) -> None:
        self._reminders = reminders

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        scheduled_for = str(intent.parameters.get("scheduled_for", "")).strip()
        message = str(intent.parameters.get("message", "")).strip()
        if not scheduled_for or not message:
            return _clarify("请告诉我提醒的时间和事项。")
        reminder = self._reminders.create(
            recipient=actor_id,
            scheduled_for=scheduled_for,
            message=message,
            created_by=actor_id,
        )
        return _completed(
            "reminder_created",
            f"好的，我会在{scheduled_for}提醒您{message}。",
            {"reminder": reminder},
        )


class CareRecordHandler(KindCapabilityHandler):
    capability_id = "care.record"
    intent_kind = IntentKind.CARE_RECORD
    actions = frozenset({"create"})
    name = "care_coordination"

    def __init__(self, records: CareRecordPort) -> None:
        self._records = records

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return _clarify("请告诉我要记录的护理事项。")
        record = self._records.create(content=content, created_by=actor_id)
        return _completed("care_record_created", "护理记录已保存。", {"record": record})


class CareTodoHandler(KindCapabilityHandler):
    capability_id = "care.todo"
    intent_kind = IntentKind.CARE_TODO
    actions = frozenset({"create"})
    name = "care_coordination"

    def __init__(self, todos: CareTodoPort) -> None:
        self._todos = todos

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        title = str(intent.parameters.get("title", "")).strip()
        due = str(intent.parameters.get("due", "未指定")).strip() or "未指定"
        if not title:
            return _clarify("请告诉我要添加什么护理待办。")
        todo = self._todos.create(title=title, due=due, created_by=actor_id)
        return _completed("care_todo_created", f"已添加护理待办：{title}。", {"todo": todo})


class EmergencyCallHandler(KindCapabilityHandler):
    capability_id = "care.emergency"
    intent_kind = IntentKind.EMERGENCY_CALL
    actions = frozenset({"call"})
    name = "care_coordination"

    def __init__(self, calls: CallPort, notifications: NotificationPort) -> None:
        self._calls = calls
        self._notifications = notifications

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        contact = intent.target or "护理员"
        call = self._calls.start(contact=contact, priority="emergency", initiated_by=actor_id)
        notification = self._notifications.emit(
            f"{actor_id}发起了应急呼叫。",
            contact,
            channel="urgent",
        )
        return _completed(
            "emergency_call_started",
            f"正在紧急联系{contact}。",
            {"call": call, "notification": notification, "priority": "high"},
        )
