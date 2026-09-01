from __future__ import annotations

from ..domain_tools import (
    DemoWeatherService,
    InMemoryNoteStore,
    SimulatedMediaService,
)
from ..intents import Intent, IntentKind
from ..models import ExecutionResult, ExecutionStatus
from ..read_models import DemoReadModel


class DailyLifeSkill:
    name = "daily_life"

    def __init__(
        self,
        *,
        read_model: DemoReadModel,
        notes: InMemoryNoteStore,
        weather: DemoWeatherService,
        media: SimulatedMediaService,
    ) -> None:
        self._read_model = read_model
        self._notes = notes
        self._weather = weather
        self._media = media

    def supports(self, intent: Intent) -> bool:
        return intent.kind in {
            IntentKind.TODAY_AGENDA,
            IntentKind.WEATHER,
            IntentKind.NOTE,
            IntentKind.COMPANION,
            IntentKind.MEDIA,
            IntentKind.INFORMATION,
        }

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        if intent.kind is IntentKind.TODAY_AGENDA:
            return self._today_agenda(actor_id)
        if intent.kind is IntentKind.WEATHER:
            return self._weather_report()
        if intent.kind is IntentKind.NOTE:
            return self._create_note(intent, actor_id)
        if intent.kind is IntentKind.COMPANION:
            return self._companion_reply(intent)
        if intent.kind is IntentKind.MEDIA:
            return self._play_media(intent)
        return self._time_information()

    def _today_agenda(self, actor_id: str) -> ExecutionResult:
        agenda = self._read_model.today_agenda(actor_id)
        count = len(agenda["reminders"]) + len(agenda["todos"]) + len(agenda["anniversaries"])
        message = "今天暂时没有待办事项。" if count == 0 else f"今天共有{count}项需要关注。"
        return self._completed(
            "today_agenda_listed",
            message,
            {"agenda": agenda},
        )

    def _weather_report(self) -> ExecutionResult:
        weather = self._weather.current()
        message = (
            f"{weather['city']}今天{weather['condition']}，"
            f"当前{weather['temperature_c']}摄氏度。"
        )
        return self._completed("weather_reported", message, {"weather": weather})

    def _create_note(self, intent: Intent, actor_id: str) -> ExecutionResult:
        content = str(intent.parameters.get("content", "")).strip()
        if not content:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="missing_note_content",
                message="请告诉我要记下什么。",
                data={"skill": self.name},
            )
        note = self._notes.create(content=content, created_by=actor_id)
        return self._completed("note_created", "好的，已经帮您记下了。", {"note": note})

    def _companion_reply(self, intent: Intent) -> ExecutionResult:
        message = str(intent.parameters.get("reply", "")).strip()
        return self._completed(
            "companion_replied",
            message,
            {
                "boundary": "non_medical",
                "model_used": True,
                "model": str(intent.parameters.get("model", "unknown")),
            },
        )

    def _play_media(self, intent: Intent) -> ExecutionResult:
        query = str(intent.parameters.get("query", "轻音乐")).strip() or "轻音乐"
        playback = self._media.play(query)
        return self._completed(
            "media_playing",
            f"正在播放{query}。",
            {"playback": playback},
        )

    def _time_information(self) -> ExecutionResult:
        today = str(self._read_model.today_agenda("bed-user")["date"])
        return self._completed(
            "date_time_reported",
            f"今天是{today}。",
            {"date": today},
        )

    def _completed(self, code: str, message: str, data: dict[str, object]) -> ExecutionResult:
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code=code,
            message=message,
            data={**data, "skill": self.name},
        )
