from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from threading import RLock
from uuid import uuid4


class InMemoryNotificationSink:
    def __init__(self) -> None:
        self._lock = RLock()
        self.items: list[dict[str, str]] = []

    def emit(self, message: str, recipient: str, channel: str = "voice") -> dict[str, str]:
        notification = {
            "notification_id": str(uuid4()),
            "recipient": recipient,
            "channel": channel,
            "message": message,
        }
        with self._lock:
            self.items.append(notification)
        return dict(notification)


@dataclass(frozen=True, slots=True)
class Reminder:
    reminder_id: str
    recipient: str
    scheduled_for: str
    message: str
    created_by: str | None
    note: str = "到点后由护理床主动语音提醒"
    status: str = "upcoming"
    enabled: bool = True


class InMemoryReminderStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self.items: list[Reminder] = []

    def create(
        self,
        *,
        recipient: str,
        scheduled_for: str,
        message: str,
        created_by: str | None,
        note: str = "到点后由护理床主动语音提醒",
        status: str = "upcoming",
        enabled: bool = True,
    ) -> dict[str, object]:
        reminder = Reminder(
            reminder_id=str(uuid4()),
            recipient=recipient,
            scheduled_for=scheduled_for,
            message=message,
            created_by=created_by,
            note=note,
            status=status,
            enabled=enabled,
        )
        with self._lock:
            self.items.append(reminder)
        return asdict(reminder)

    def update(self, reminder_id: str, **changes: object) -> dict[str, object] | None:
        with self._lock:
            for index, reminder in enumerate(self.items):
                if reminder.reminder_id != reminder_id:
                    continue
                updated = replace(reminder, **changes)
                self.items[index] = updated
                return asdict(updated)
        return None

    def delete(self, reminder_id: str) -> bool:
        with self._lock:
            for index, reminder in enumerate(self.items):
                if reminder.reminder_id == reminder_id:
                    del self.items[index]
                    return True
        return False
