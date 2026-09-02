from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime
from threading import RLock
from uuid import uuid4


class DemoClock:
    def __init__(self, now: datetime | None = None) -> None:
        self._now = now or datetime.fromisoformat("2026-08-31T10:00:00+08:00")

    def now_iso(self) -> str:
        return self._now.isoformat()

    def today_iso(self) -> str:
        return self._now.date().isoformat()

    def month_day(self) -> str:
        return self._now.strftime("%m-%d")


@dataclass(frozen=True, slots=True)
class CareRecord:
    record_id: str
    content: str
    created_by: str
    recorded_at: str


class InMemoryCareRecordStore:
    def __init__(self, clock: DemoClock) -> None:
        self._clock = clock
        self._lock = RLock()
        self.items: list[CareRecord] = []

    def create(self, *, content: str, created_by: str) -> dict[str, str]:
        record = CareRecord(
            record_id=str(uuid4()),
            content=content,
            created_by=created_by,
            recorded_at=self._clock.now_iso(),
        )
        with self._lock:
            self.items.append(record)
        return asdict(record)


@dataclass(frozen=True, slots=True)
class CareTodo:
    todo_id: str
    title: str
    due: str
    status: str
    created_by: str
    created_at: str


class InMemoryCareTodoStore:
    def __init__(self, clock: DemoClock) -> None:
        self._clock = clock
        self._lock = RLock()
        self.items: list[CareTodo] = []

    def create(self, *, title: str, due: str, created_by: str) -> dict[str, str]:
        todo = CareTodo(
            todo_id=str(uuid4()),
            title=title,
            due=due,
            status="pending",
            created_by=created_by,
            created_at=self._clock.now_iso(),
        )
        with self._lock:
            self.items.append(todo)
        return asdict(todo)


@dataclass(frozen=True, slots=True)
class CallSession:
    call_id: str
    contact: str
    priority: str
    status: str
    initiated_by: str
    started_at: str
    ended_at: str | None = None


class SimulatedCallService:
    def __init__(self, clock: DemoClock) -> None:
        self._clock = clock
        self._lock = RLock()
        self.items: list[CallSession] = []

    def start(self, *, contact: str, priority: str, initiated_by: str) -> dict[str, object]:
        call = CallSession(
            call_id=str(uuid4()),
            contact=contact,
            priority=priority,
            status="calling",
            initiated_by=initiated_by,
            started_at=self._clock.now_iso(),
        )
        with self._lock:
            self.items.append(call)
        return asdict(call)

    def end(self, call_id: str) -> dict[str, str | None] | None:
        with self._lock:
            for index, call in enumerate(self.items):
                if call.call_id != call_id:
                    continue
                ended = replace(call, status="ended", ended_at=self._clock.now_iso())
                self.items[index] = ended
                return asdict(ended)
        return None


@dataclass(frozen=True, slots=True)
class VoiceMessage:
    message_id: str
    sender: str
    recipient: str
    content: str
    status: str
    created_at: str
    duration_seconds: int = 0
    summary: str = ""


class InMemoryVoiceMessageStore:
    def __init__(self, clock: DemoClock, *, seed_demo: bool = True) -> None:
        self._clock = clock
        self._lock = RLock()
        self.items: list[VoiceMessage] = []
        if seed_demo:
            self.items.append(
                VoiceMessage(
                    message_id=str(uuid4()),
                    sender="儿子",
                    recipient="elder-1",
                    content="爸，我今晚下班后给您打电话。",
                    status="unread",
                    created_at=clock.now_iso(),
                )
            )

    def send(
        self,
        *,
        sender: str,
        recipient: str,
        content: str,
        duration_seconds: int = 0,
        summary: str = "",
    ) -> dict[str, object]:
        message = VoiceMessage(
            message_id=str(uuid4()),
            sender=sender,
            recipient=recipient,
            content=content,
            status="unread",
            created_at=self._clock.now_iso(),
            duration_seconds=duration_seconds,
            summary=summary,
        )
        with self._lock:
            self.items.append(message)
        return asdict(message)

    def play_latest(self, *, sender: str, recipient: str) -> dict[str, str] | None:
        with self._lock:
            for index in range(len(self.items) - 1, -1, -1):
                message = self.items[index]
                if message.sender == sender and message.recipient == recipient:
                    playing = replace(message, status="playing")
                    self.items[index] = playing
                    return asdict(playing)
        return None

    def mark_played(self, message_id: str) -> dict[str, object] | None:
        with self._lock:
            for index, message in enumerate(self.items):
                if message.message_id != message_id:
                    continue
                played = replace(message, status="played")
                self.items[index] = played
                return asdict(played)
        return None


@dataclass(frozen=True, slots=True)
class Anniversary:
    anniversary_id: str
    person: str
    kind: str
    month_day: str


class InMemoryAnniversaryStore:
    def __init__(self, clock: DemoClock, *, seed_demo: bool = True) -> None:
        self._clock = clock
        self.items: list[Anniversary] = []
        if seed_demo:
            self.items.append(
                Anniversary(
                    anniversary_id=str(uuid4()),
                    person="女儿",
                    kind="birthday",
                    month_day=clock.month_day(),
                )
            )

    def today(self) -> list[dict[str, str]]:
        return [asdict(item) for item in self.items if item.month_day == self._clock.month_day()]


@dataclass(frozen=True, slots=True)
class PersonalNote:
    note_id: str
    content: str
    created_by: str
    created_at: str


class InMemoryNoteStore:
    def __init__(self, clock: DemoClock) -> None:
        self._clock = clock
        self._lock = RLock()
        self.items: list[PersonalNote] = []

    def create(self, *, content: str, created_by: str) -> dict[str, str]:
        note = PersonalNote(
            note_id=str(uuid4()),
            content=content,
            created_by=created_by,
            created_at=self._clock.now_iso(),
        )
        with self._lock:
            self.items.append(note)
        return asdict(note)


class DemoWeatherService:
    def current(self) -> dict[str, object]:
        return {
            "city": "杭州",
            "condition": "晴",
            "temperature_c": 28,
            "high_c": 32,
            "low_c": 24,
            "source": "demo",
        }


class SimulatedMediaService:
    def __init__(self) -> None:
        self.current: dict[str, str | None] = {"status": "idle", "query": None}

    def play(self, query: str) -> dict[str, str | None]:
        self.current = {"status": "playing", "query": query}
        return dict(self.current)

    def pause(self) -> dict[str, str | None]:
        if self.current["status"] == "playing":
            self.current = {**self.current, "status": "paused"}
        return dict(self.current)

    def stop(self) -> dict[str, str | None]:
        self.current = {**self.current, "status": "stopped"}
        return dict(self.current)
