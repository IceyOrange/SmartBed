from __future__ import annotations

from .models import EventKind, IncomingEvent, ProcessingPath, RouteDecision


class EventRouter:
    _DIRECT_EVENTS = {
        EventKind.HANDLE_CONTROL,
        EventKind.EMERGENCY_STOP,
        EventKind.SAFETY_SIGNAL,
    }
    _RULE_EVENTS = {
        EventKind.FIXED_VOICE_COMMAND,
        EventKind.SCHEDULE_DUE,
        EventKind.MESSAGE_RECEIVED,
        EventKind.APP_ACTION,
        EventKind.SYNC_REQUIRED,
    }
    _AGENT_EVENTS = {
        EventKind.NATURAL_LANGUAGE,
        EventKind.APP_ASSISTANT_REQUEST,
    }

    def route(self, event: IncomingEvent) -> RouteDecision:
        if event.kind in self._DIRECT_EVENTS:
            return RouteDecision(ProcessingPath.DIRECT, "确定性控制或安全事件")
        if event.kind in self._RULE_EVENTS:
            return RouteDecision(ProcessingPath.RULE, "结构化事件可由规则稳定处理")
        if event.kind in self._AGENT_EVENTS:
            return RouteDecision(ProcessingPath.AGENT, "需要自然语言理解或任务编排")
        if event.kind is EventKind.DEVICE_STATE:
            return RouteDecision(ProcessingPath.OBSERVE, "仅同步权威设备状态")
        raise ValueError(f"不支持的事件类型: {event.kind}")
