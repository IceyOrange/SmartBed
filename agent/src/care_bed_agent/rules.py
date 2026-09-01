from __future__ import annotations

from .bed_control import DeterministicBedController
from .models import BedAction, BedCommand, EventKind, ExecutionResult, ExecutionStatus, IncomingEvent
from .tools import InMemoryNotificationSink, InMemoryReminderStore


class RuleEngine:
    _VOICE_ACTIONS = {
        "stop": BedAction.STOP,
        "backrest_up": BedAction.BACKREST_UP,
        "backrest_down": BedAction.BACKREST_DOWN,
        "legrest_up": BedAction.LEGREST_UP,
        "legrest_down": BedAction.LEGREST_DOWN,
        "bed_up": BedAction.BED_UP,
        "bed_down": BedAction.BED_DOWN,
    }

    def __init__(
        self,
        controller: DeterministicBedController,
        notifications: InMemoryNotificationSink,
        reminders: InMemoryReminderStore,
    ) -> None:
        self._controller = controller
        self._notifications = notifications
        self._reminders = reminders

    def handle(self, event: IncomingEvent) -> ExecutionResult:
        if event.kind is EventKind.FIXED_VOICE_COMMAND:
            return self._handle_fixed_voice(event)
        if event.kind is EventKind.SCHEDULE_DUE:
            return self._emit_due_reminder(event)
        if event.kind is EventKind.MESSAGE_RECEIVED:
            return self._emit_message_notice(event)
        if event.kind is EventKind.APP_ACTION:
            return self._handle_app_action(event)
        if event.kind is EventKind.SYNC_REQUIRED:
            return ExecutionResult(
                status=ExecutionStatus.COMPLETED,
                code="sync_queued",
                message="同步任务已进入队列。",
            )
        return self._rejected("unsupported_rule_event", "规则引擎无法处理该事件。")

    def _handle_fixed_voice(self, event: IncomingEvent) -> ExecutionResult:
        action_name = str(event.payload.get("action", ""))
        action = self._VOICE_ACTIONS.get(action_name)
        if action is None:
            return self._rejected("invalid_fixed_voice_action", "固定语音指令无法识别。")
        return self._controller.execute(
            BedCommand(action=action, amount=int(event.payload.get("amount", 5)))
        )

    def _emit_due_reminder(self, event: IncomingEvent) -> ExecutionResult:
        message = str(event.payload.get("message", "")).strip()
        recipient = str(event.payload.get("recipient", "bed-user"))
        if not message:
            return self._rejected("missing_message", "提醒内容不能为空。")
        notification = self._notifications.emit(message, recipient)
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code="notification_emitted",
            message=message,
            data={"notification": notification},
        )

    def _emit_message_notice(self, event: IncomingEvent) -> ExecutionResult:
        sender = str(event.payload.get("sender", "家人"))
        recipient = str(event.payload.get("recipient", "bed-user"))
        message = f"有一条来自{sender}的语音留言。"
        notification = self._notifications.emit(message, recipient)
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code="message_notice_emitted",
            message=message,
            data={"notification": notification},
        )

    def _handle_app_action(self, event: IncomingEvent) -> ExecutionResult:
        action = event.payload.get("action")
        if action != "create_reminder":
            return self._rejected("unsupported_app_action", "该结构化 APP 操作尚不支持。")

        required = ("recipient", "scheduled_for", "message")
        missing = [name for name in required if not event.payload.get(name)]
        if missing:
            return self._rejected(
                "invalid_reminder",
                f"缺少提醒字段：{', '.join(missing)}。",
            )

        reminder = self._reminders.create(
            recipient=str(event.payload["recipient"]),
            scheduled_for=str(event.payload["scheduled_for"]),
            message=str(event.payload["message"]),
            created_by=event.actor_id,
            note=str(event.payload.get("note", "到点后由护理床主动语音提醒")),
            status=str(event.payload.get("status", "upcoming")),
            enabled=bool(event.payload.get("enabled", True)),
        )
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code="reminder_created",
            message="护理提醒已创建。",
            data={"reminder": reminder},
        )

    @staticmethod
    def _rejected(code: str, message: str) -> ExecutionResult:
        return ExecutionResult(status=ExecutionStatus.REJECTED, code=code, message=message)
