from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Mapping
from uuid import uuid4


class EventKind(StrEnum):
    HANDLE_CONTROL = "handle_control"
    EMERGENCY_STOP = "emergency_stop"
    SAFETY_SIGNAL = "safety_signal"
    FIXED_VOICE_COMMAND = "fixed_voice_command"
    SCHEDULE_DUE = "schedule_due"
    MESSAGE_RECEIVED = "message_received"
    APP_ACTION = "app_action"
    SYNC_REQUIRED = "sync_required"
    NATURAL_LANGUAGE = "natural_language"
    APP_ASSISTANT_REQUEST = "app_assistant_request"
    DEVICE_STATE = "device_state"


class EventSource(StrEnum):
    HANDLE = "handle"
    SAFETY_DEVICE = "safety_device"
    VOICE = "voice"
    APP = "app"
    TIMER = "timer"
    DEVICE = "device"
    CLOUD = "cloud"


class ProcessingPath(StrEnum):
    DIRECT = "direct"
    RULE = "rule"
    AGENT = "agent"
    OBSERVE = "observe"


class BedAction(StrEnum):
    BACKREST_UP = "backrest_up"
    BACKREST_DOWN = "backrest_down"
    LEGREST_UP = "legrest_up"
    LEGREST_DOWN = "legrest_down"
    BED_UP = "bed_up"
    BED_DOWN = "bed_down"
    FLAT = "flat"
    SET_POSITION = "set_position"
    STOP = "stop"


class ExecutionStatus(StrEnum):
    COMPLETED = "completed"
    REJECTED = "rejected"
    NEEDS_CLARIFICATION = "needs_clarification"
    NEEDS_CONFIRMATION = "needs_confirmation"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class IncomingEvent:
    kind: EventKind
    source: EventSource
    payload: Mapping[str, Any]
    actor_id: str | None = None
    event_id: str = field(default_factory=lambda: str(uuid4()))
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True, slots=True)
class RouteDecision:
    path: ProcessingPath
    reason: str


@dataclass(frozen=True, slots=True)
class BedCommand:
    action: BedAction
    amount: int = 5
    emergency: bool = False
    backrest_degrees: int | None = None
    legrest_degrees: int | None = None
    height_cm: int | None = None


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    status: ExecutionStatus
    code: str
    message: str
    data: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class HandledEvent:
    event_id: str
    path: ProcessingPath
    status: ExecutionStatus
    code: str
    message: str
    data: Mapping[str, Any] = field(default_factory=dict)
