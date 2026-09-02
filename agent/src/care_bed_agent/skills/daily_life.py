from __future__ import annotations

from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus
from ..ports import AgendaPort, MediaPort, NotePort, WeatherPort
from .base import KindCapabilityHandler


def _completed(code: str, message: str, data: dict[str, object]) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.COMPLETED,
        code=code,
        message=message,
        data={**data, "skill": "daily_life"},
    )


class TodayAgendaHandler(KindCapabilityHandler):
    capability_id = "daily.agenda"
    intent_kind = IntentKind.TODAY_AGENDA
    actions = frozenset({"list"})
    name = "daily_life"

    def __init__(self, read_model: AgendaPort) -> None:
        self._read_model = read_model

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del intent
        agenda = self._read_model.today_agenda(actor_id)
        reminders = agenda.get("reminders", [])
        todos = agenda.get("todos", [])
        anniversaries = agenda.get("anniversaries", [])
        count = len(reminders) + len(todos) + len(anniversaries)
        message = "今天暂时没有待办事项。" if count == 0 else f"今天共有{count}项需要关注。"
        return _completed("today_agenda_listed", message, {"agenda": agenda})


class WeatherHandler(KindCapabilityHandler):
    capability_id = "daily.weather"
    intent_kind = IntentKind.WEATHER
    actions = frozenset({"query"})
    name = "daily_life"

    def __init__(self, weather: WeatherPort) -> None:
        self._weather = weather

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del intent, actor_id
        weather = self._weather.current()
        message = f"{weather['city']}今天{weather['condition']}，当前{weather['temperature_c']}摄氏度。"
        return _completed("weather_reported", message, {"weather": weather})


class NoteHandler(KindCapabilityHandler):
    capability_id = "daily.note"
    intent_kind = IntentKind.NOTE
    actions = frozenset({"create"})
    name = "daily_life"

    def __init__(self, notes: NotePort) -> None:
        self._notes = notes

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="missing_note_content",
                message="请告诉我要记下什么。",
                data={"skill": self.name},
            )
        note = self._notes.create(content=content, created_by=actor_id)
        return _completed("note_created", "好的，已经帮您记下了。", {"note": note})


class CompanionHandler(KindCapabilityHandler):
    capability_id = "daily.companion"
    intent_kind = IntentKind.COMPANION
    actions = frozenset({"chat"})
    name = "daily_life"

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        message = str(intent.parameters.get("reply", "")).strip()
        if not message:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="missing_companion_reply",
                message="我在这里，您可以再说具体一点。",
                data={"skill": self.name},
            )
        return _completed(
            "companion_replied",
            message,
            {
                "boundary": "non_medical",
                "model_used": True,
                "model": str(intent.parameters.get("model", "unknown")),
            },
        )


class MediaHandler(KindCapabilityHandler):
    capability_id = "daily.media"
    intent_kind = IntentKind.MEDIA
    actions = frozenset({"play"})
    name = "daily_life"

    def __init__(self, media: MediaPort) -> None:
        self._media = media

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        query = str(intent.parameters.get("query", "")).strip()
        if not query:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="missing_media_query",
                message="请告诉我想播放什么。",
                data={"skill": self.name},
            )
        playback = self._media.play(query)
        return _completed("media_playing", f"正在播放{query}。", {"playback": playback})


class DateTimeHandler(KindCapabilityHandler):
    capability_id = "daily.information"
    intent_kind = IntentKind.INFORMATION
    actions = frozenset({"query"})
    name = "daily_life"

    def __init__(self, read_model: AgendaPort) -> None:
        self._read_model = read_model

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del intent
        today = str(self._read_model.today_agenda(actor_id)["date"])
        return _completed("date_time_reported", f"今天是{today}。", {"date": today})
