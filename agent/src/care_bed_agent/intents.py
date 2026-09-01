from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import StrEnum
from threading import RLock
from typing import Any, Mapping, Protocol


class IntentKind(StrEnum):
    BED_ADJUST = "bed_adjust"
    BED_SCENE = "bed_scene"
    STOP = "stop"
    REMINDER = "reminder"
    CARE_RECORD = "care_record"
    CARE_TODO = "care_todo"
    EMERGENCY_CALL = "emergency_call"
    LIVE_CALL = "live_call"
    VOICE_MESSAGE = "voice_message"
    ANNIVERSARY = "anniversary"
    TODAY_AGENDA = "today_agenda"
    WEATHER = "weather"
    NOTE = "note"
    COMMUNICATION = "communication"
    MEDIA = "media"
    INFORMATION = "information"
    COMPANION = "companion"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class Intent:
    kind: IntentKind
    raw_text: str
    target: str | None = None
    action: str | None = None
    parameters: Mapping[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    negated: bool = False
    utterance_type: str = "unknown"


class IntentInterpretationError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class IntentInterpreter(Protocol):
    def interpret(self, text: str) -> Intent: ...


@dataclass(frozen=True, slots=True)
class ConversationContext:
    last_bed_target: str | None = None
    pending_intent: Intent | None = None


class ConversationContextStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._contexts: dict[str, ConversationContext] = {}

    def resolve(self, actor_id: str, intent: Intent) -> Intent:
        with self._lock:
            context = self._contexts.get(actor_id, ConversationContext())
        if intent.kind is IntentKind.BED_ADJUST and intent.target is None:
            return replace(intent, target=context.last_bed_target)
        return intent

    def remember(self, actor_id: str, intent: Intent) -> None:
        if intent.kind is not IntentKind.BED_ADJUST or intent.target is None:
            return
        with self._lock:
            current = self._contexts.get(actor_id, ConversationContext())
            self._contexts[actor_id] = replace(current, last_bed_target=intent.target)

    def defer(self, actor_id: str, intent: Intent) -> None:
        with self._lock:
            current = self._contexts.get(actor_id, ConversationContext())
            self._contexts[actor_id] = replace(current, pending_intent=intent)

    def take_pending(self, actor_id: str) -> Intent | None:
        with self._lock:
            current = self._contexts.get(actor_id, ConversationContext())
            pending = current.pending_intent
            self._contexts[actor_id] = replace(current, pending_intent=None)
        return pending

    def clear_pending(self, actor_id: str) -> None:
        with self._lock:
            current = self._contexts.get(actor_id, ConversationContext())
            self._contexts[actor_id] = replace(current, pending_intent=None)
