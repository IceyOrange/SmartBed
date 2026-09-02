from __future__ import annotations

import json
from collections.abc import Mapping

from .capabilities import CapabilityAction, capability_for
from .intents import Intent, IntentKind


_EXECUTABLE_UTTERANCE_TYPES = {"command", "query", "statement"}
_INVALID_TARGET = object()


def parse_model_intent(
    raw_text: str,
    response: str,
    *,
    model_name: str,
    minimum_confidence: float,
) -> Intent:
    payload = _decode_object(response)
    if payload is None:
        return unknown_intent(raw_text)

    confidence = _confidence(payload.get("confidence"))
    negated = payload.get("negated") is True
    utterance_type = _utterance_type(payload.get("utterance_type"))
    try:
        kind = IntentKind(str(payload.get("kind", IntentKind.UNKNOWN.value)))
    except ValueError:
        return unknown_intent(raw_text, confidence=confidence, utterance_type=utterance_type)

    if kind is IntentKind.UNKNOWN:
        return unknown_intent(
            raw_text,
            confidence=confidence,
            negated=negated,
            utterance_type=utterance_type,
        )
    if confidence < minimum_confidence:
        return unknown_intent(raw_text, confidence=confidence, utterance_type=utterance_type)
    if negated or payload.get("should_execute") is not True:
        return unknown_intent(
            raw_text,
            confidence=confidence,
            negated=negated,
            utterance_type=utterance_type,
        )
    if utterance_type not in _EXECUTABLE_UTTERANCE_TYPES:
        return unknown_intent(raw_text, confidence=confidence)

    action_name = payload.get("action")
    if not isinstance(action_name, str):
        return unknown_intent(raw_text, confidence=confidence)
    capability = capability_for(kind, action_name)
    if capability is None:
        return unknown_intent(raw_text, confidence=confidence)
    action = capability.action_for(action_name)
    if action is None:
        return unknown_intent(raw_text, confidence=confidence)

    target = _normalize_target(action, payload.get("target"))
    if target is _INVALID_TARGET:
        return unknown_intent(raw_text, confidence=confidence)

    raw_parameters = payload.get("parameters")
    parameters = _normalize_parameters(
        kind,
        action,
        raw_parameters if isinstance(raw_parameters, Mapping) else {},
    )
    if kind is IntentKind.COMPANION:
        reply = parameters.get("reply")
        if not isinstance(reply, str) or not reply:
            return unknown_intent(raw_text, confidence=confidence)
        parameters["model"] = model_name

    return Intent(
        kind=kind,
        raw_text=raw_text,
        target=target,
        action=action_name,
        parameters=parameters,
        confidence=confidence,
        negated=False,
        utterance_type=utterance_type,
    )


def unknown_intent(
    raw_text: str,
    *,
    confidence: float = 0.0,
    negated: bool = False,
    utterance_type: str = "unknown",
) -> Intent:
    return Intent(
        kind=IntentKind.UNKNOWN,
        raw_text=raw_text,
        confidence=confidence,
        negated=negated,
        utterance_type=utterance_type,
    )


def _decode_object(response: str) -> Mapping[str, object] | None:
    try:
        payload = json.loads(response)
    except (json.JSONDecodeError, TypeError):
        return None
    return payload if isinstance(payload, Mapping) else None


def _normalize_target(action: CapabilityAction, value: object) -> str | None | object:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not value.strip():
        return _INVALID_TARGET
    target = value.strip()
    if action.target_mode == "contact":
        return target
    if action.target_mode == "bed_part" and target in {"backrest", "legrest", "bed_height"}:
        return target
    return _INVALID_TARGET


def _normalize_parameters(
    kind: IntentKind,
    action: CapabilityAction,
    parameters: Mapping[object, object],
) -> dict[str, object]:
    allowed = set(action.parameter_names)
    normalized: dict[str, object] = {}
    for key, value in parameters.items():
        if not isinstance(key, str) or key not in allowed:
            continue
        if not isinstance(value, (str, int, float, bool, type(None))):
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        normalized[key] = value

    if kind is IntentKind.BED_ADJUST:
        try:
            amount = int(normalized.get("amount", 5))
        except (TypeError, ValueError):
            amount = 5
        normalized["amount"] = min(10, max(1, amount))

    for parameter, _values in action.parameter_options:
        if parameter in normalized and str(normalized[parameter]) not in action.options_for(parameter):
            normalized.pop(parameter)
    return normalized


def _confidence(value: object) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return min(1.0, max(0.0, confidence))


def _utterance_type(value: object) -> str:
    return value if isinstance(value, str) else "unknown"
