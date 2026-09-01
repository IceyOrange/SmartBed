from __future__ import annotations

import json
from typing import Mapping, Sequence

from .intents import Intent, IntentInterpretationError, IntentKind
from .llm import ChatModel, GlmClientError, GlmNotConfiguredError


class AiIntentInterpreter:
    _SYSTEM_PROMPT = """
你是智能护理床的意图解析器。理解整句语义、否定、疑问和上下文指代，只输出一个 JSON 对象。
字段：kind、target、action、parameters、confidence、negated、should_execute、utterance_type。
kind 只能是 bed_adjust、bed_scene、stop、reminder、care_record、care_todo、emergency_call、
live_call、voice_message、anniversary、today_agenda、weather、note、media、information、
companion、unknown。utterance_type 只能是 command、query、statement、unknown。
床体 target 只能是 backrest、legrest、bed_height；bed_adjust action 只能是 up、down，
parameters.amount 为 1 到 10；bed_scene action=set_scene，parameters.scene 只能是
meal、television、sleep。其他 action：stop=stop，reminder/care_record/care_todo/note=create，
emergency_call=call，live_call=start，voice_message=play 或 send，anniversary=list_today 或
send_greeting，today_agenda=list，weather/information=query，media=play，companion=chat。
参数名固定为：reminder 使用 scheduled_for、message；care_record 使用 content；care_todo
使用 title、due；voice_message 发送时使用 content；note 使用 content；media 使用 query。
联系人原称写入 target。anniversary=list_today 仅适用于询问今天是否有生日或纪念日，
询问其他日期或范围时输出 unknown。
companion 必须在 parameters.reply 中同时给出一句温暖、简短、不涉及医疗判断的中文回复。
只有用户明确要求执行当前已支持的操作时 should_execute=true。否定、拒绝、假设、转述、
讨论功能、信息不足、医疗诊断、用药调整或未支持操作必须 should_execute=false，并优先输出 unknown。
历史消息仅用于理解指代和连续表达，只有最后一条用户消息可以触发动作。
不要声称已经执行，不要输出 Markdown 或解释。
""".strip()

    _ALLOWED_ACTIONS: dict[IntentKind, set[str]] = {
        IntentKind.BED_ADJUST: {"up", "down"},
        IntentKind.BED_SCENE: {"set_scene"},
        IntentKind.STOP: {"stop"},
        IntentKind.REMINDER: {"create"},
        IntentKind.CARE_RECORD: {"create"},
        IntentKind.CARE_TODO: {"create"},
        IntentKind.EMERGENCY_CALL: {"call"},
        IntentKind.LIVE_CALL: {"start"},
        IntentKind.VOICE_MESSAGE: {"play", "send"},
        IntentKind.ANNIVERSARY: {"list_today", "send_greeting"},
        IntentKind.TODAY_AGENDA: {"list"},
        IntentKind.WEATHER: {"query"},
        IntentKind.NOTE: {"create"},
        IntentKind.MEDIA: {"play"},
        IntentKind.INFORMATION: {"query"},
        IntentKind.COMPANION: {"chat"},
    }
    _BED_TARGETS = {"backrest", "legrest", "bed_height"}
    _EXECUTABLE_UTTERANCE_TYPES = {"command", "query", "statement"}

    def __init__(
        self,
        *,
        model: ChatModel | None,
        minimum_confidence: float = 0.7,
    ) -> None:
        self._model = model
        self._minimum_confidence = minimum_confidence

    def interpret(
        self,
        text: str,
        history: Sequence[Mapping[str, str]] = (),
    ) -> Intent:
        if not text.strip():
            return self._unknown(text)
        if self._model is None:
            raise IntentInterpretationError(
                "ai_not_configured",
                "AI意图识别尚未配置，请设置模型后重试。",
            )

        try:
            context = [
                {"role": message["role"], "content": message["content"]}
                for message in history
                if message.get("role") in {"user", "assistant"}
                and isinstance(message.get("content"), str)
            ]
            response = self._model.complete(
                [
                    {"role": "system", "content": self._SYSTEM_PROMPT},
                    *context,
                    {"role": "user", "content": text},
                ],
                response_format="json_object",
            )
        except GlmNotConfiguredError as error:
            raise IntentInterpretationError(
                "ai_not_configured",
                "AI意图识别尚未配置，请设置模型后重试。",
            ) from error
        except GlmClientError as error:
            raise IntentInterpretationError(
                "ai_unavailable",
                "AI意图识别暂时不可用，请稍后重试或使用实体控制方式。",
            ) from error

        return self._parse_intent(text, response) or self._unknown(text)

    def _parse_intent(self, raw_text: str, response: str) -> Intent | None:
        try:
            payload = json.loads(response)
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(payload, dict):
            return None

        try:
            kind = IntentKind(str(payload.get("kind", "unknown")))
        except ValueError:
            return None
        confidence = self._confidence(payload.get("confidence"))
        negated = payload.get("negated") is True
        utterance_type = str(payload.get("utterance_type", "unknown"))
        if kind is IntentKind.UNKNOWN:
            return self._unknown(
                raw_text,
                confidence=confidence,
                negated=negated,
                utterance_type=utterance_type,
            )
        if confidence < self._minimum_confidence:
            return self._unknown(raw_text, confidence=confidence)
        if negated or payload.get("should_execute") is not True:
            return self._unknown(
                raw_text,
                confidence=confidence,
                negated=negated,
                utterance_type=utterance_type,
            )
        if utterance_type not in self._EXECUTABLE_UTTERANCE_TYPES:
            return self._unknown(raw_text, confidence=confidence)

        action = payload.get("action")
        if not isinstance(action, str) or action not in self._ALLOWED_ACTIONS.get(kind, set()):
            return self._unknown(raw_text, confidence=confidence)

        target = payload.get("target")
        normalized_target = target if isinstance(target, str) and target.strip() else None
        if kind is IntentKind.BED_ADJUST and normalized_target not in self._BED_TARGETS | {None}:
            return self._unknown(raw_text, confidence=confidence)

        parameters = payload.get("parameters")
        normalized_parameters = self._normalize_parameters(
            kind,
            parameters if isinstance(parameters, Mapping) else {},
        )
        if kind is IntentKind.BED_SCENE and "scene" not in normalized_parameters:
            return self._unknown(raw_text, confidence=confidence)
        if kind is IntentKind.COMPANION:
            reply = normalized_parameters.get("reply")
            if not isinstance(reply, str) or not reply.strip():
                return self._unknown(raw_text, confidence=confidence)
            normalized_parameters["reply"] = reply.strip()
            normalized_parameters["model"] = self._model.model_name

        return Intent(
            kind=kind,
            raw_text=raw_text,
            target=normalized_target,
            action=action,
            parameters=normalized_parameters,
            confidence=confidence,
            negated=False,
            utterance_type=utterance_type,
        )

    @staticmethod
    def _normalize_parameters(
        kind: IntentKind,
        parameters: Mapping[object, object],
    ) -> dict[str, object]:
        normalized = {
            key: value
            for key, value in parameters.items()
            if isinstance(key, str)
            and isinstance(value, (str, int, float, bool, type(None)))
        }
        if kind is IntentKind.BED_ADJUST:
            raw_amount = normalized.get("amount", 5)
            try:
                amount = int(raw_amount)
            except (TypeError, ValueError):
                amount = 5
            normalized["amount"] = min(10, max(1, amount))
        if kind is IntentKind.BED_SCENE:
            scene = normalized.get("scene")
            if scene not in {"meal", "television", "sleep"}:
                normalized.pop("scene", None)
        return normalized

    @staticmethod
    def _confidence(value: object) -> float:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return 0.0
        return min(1.0, max(0.0, confidence))

    @staticmethod
    def _unknown(
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
