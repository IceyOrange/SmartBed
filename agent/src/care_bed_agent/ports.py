from __future__ import annotations

from typing import Protocol, runtime_checkable

from .models import BedCommand, ExecutionResult


@runtime_checkable
class BedControlPort(Protocol):
    def execute(self, command: BedCommand) -> ExecutionResult: ...


@runtime_checkable
class ReminderPort(Protocol):
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
    ) -> dict[str, object]: ...


@runtime_checkable
class CareRecordPort(Protocol):
    def create(self, *, content: str, created_by: str) -> dict[str, object]: ...


@runtime_checkable
class CareTodoPort(Protocol):
    def create(self, *, title: str, due: str, created_by: str) -> dict[str, object]: ...


@runtime_checkable
class NotificationPort(Protocol):
    def emit(self, message: str, recipient: str, channel: str = "voice") -> dict[str, object]: ...


@runtime_checkable
class CallPort(Protocol):
    def start(self, *, contact: str, priority: str, initiated_by: str) -> dict[str, object]: ...

    def end(self, call_id: str) -> dict[str, object] | None: ...


@runtime_checkable
class VoiceMessagePort(Protocol):
    def send(
        self,
        *,
        sender: str,
        recipient: str,
        content: str,
        duration_seconds: int = 0,
        summary: str = "",
    ) -> dict[str, object]: ...

    def play_latest(self, *, sender: str, recipient: str) -> dict[str, object] | None: ...

    def mark_played(self, message_id: str) -> dict[str, object] | None: ...


@runtime_checkable
class AnniversaryPort(Protocol):
    def today(self) -> list[dict[str, str]]: ...


@runtime_checkable
class WeatherPort(Protocol):
    def current(self) -> dict[str, object]: ...


@runtime_checkable
class NotePort(Protocol):
    def create(self, *, content: str, created_by: str) -> dict[str, object]: ...


@runtime_checkable
class MediaPort(Protocol):
    def play(self, query: str) -> dict[str, object]: ...

    def pause(self) -> dict[str, object]: ...

    def stop(self) -> dict[str, object]: ...


@runtime_checkable
class AgendaPort(Protocol):
    def today_agenda(self, actor_id: str) -> dict[str, object]: ...
