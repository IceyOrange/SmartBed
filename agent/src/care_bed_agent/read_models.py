from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from .domain_tools import (
    DemoClock,
    DemoWeatherService,
    InMemoryAnniversaryStore,
    InMemoryCareRecordStore,
    InMemoryCareTodoStore,
    InMemoryNoteStore,
    InMemoryVoiceMessageStore,
    SimulatedCallService,
    SimulatedMediaService,
)
from .tools import InMemoryNotificationSink, InMemoryReminderStore


class DemoReadModel:
    _CAPABILITIES = (
        {
            "id": "body_autonomy",
            "name": "身体自主",
            "features": ["床体控制"],
        },
        {
            "id": "care_coordination",
            "name": "照护协同",
            "features": ["护理提醒", "护理记录", "应急呼叫", "护理Todo"],
        },
        {
            "id": "relationship",
            "name": "关系链接",
            "features": ["实时通话", "非实时留言", "纪念日祝福"],
        },
        {
            "id": "daily_life",
            "name": "日常生活",
            "features": ["今日事项", "天气", "帮助记事", "轻量陪聊", "点播"],
        },
    )

    def __init__(
        self,
        *,
        clock: DemoClock,
        reminders: InMemoryReminderStore,
        care_records: InMemoryCareRecordStore,
        care_todos: InMemoryCareTodoStore,
        calls: SimulatedCallService,
        voice_messages: InMemoryVoiceMessageStore,
        anniversaries: InMemoryAnniversaryStore,
        notes: InMemoryNoteStore,
        notifications: InMemoryNotificationSink,
        weather: DemoWeatherService,
        media: SimulatedMediaService,
    ) -> None:
        self._clock = clock
        self._reminders = reminders
        self._care_records = care_records
        self._care_todos = care_todos
        self._calls = calls
        self._voice_messages = voice_messages
        self._anniversaries = anniversaries
        self._notes = notes
        self._notifications = notifications
        self._weather = weather
        self._media = media

    def capabilities(self) -> dict[str, object]:
        return {"domains": [dict(item) for item in self._CAPABILITIES]}

    def today_agenda(self, actor_id: str) -> dict[str, object]:
        reminders = [
            asdict(item)
            for item in self._reminders.items
            if item.recipient == actor_id and item.enabled and self._is_today(item.scheduled_for)
        ]
        todos = [
            asdict(item)
            for item in self._care_todos.items
            if item.created_by == actor_id and item.due in {"今天", self._clock.today_iso()}
        ]
        return {
            "date": self._clock.today_iso(),
            "reminders": reminders,
            "todos": todos,
            "anniversaries": self._anniversaries.today(),
        }

    def overview(self) -> dict[str, object]:
        return {
            "care_coordination": {
                "reminders": [asdict(item) for item in self._reminders.items],
                "records": [asdict(item) for item in self._care_records.items],
                "todos": [asdict(item) for item in self._care_todos.items],
                "notifications": list(self._notifications.items),
            },
            "relationship": {
                "calls": [asdict(item) for item in self._calls.items],
                "voice_messages": [asdict(item) for item in self._voice_messages.items],
                "anniversaries": [asdict(item) for item in self._anniversaries.items],
            },
            "daily_life": {
                "notes": [asdict(item) for item in self._notes.items],
                "weather": self._weather.current(),
                "media": dict(self._media.current),
            },
        }

    def _is_today(self, scheduled_for: str) -> bool:
        if any(day in scheduled_for for day in ("明天", "后天")):
            return False
        if "今天" in scheduled_for:
            return True
        try:
            return datetime.fromisoformat(scheduled_for).date().isoformat() == self._clock.today_iso()
        except ValueError:
            return True
