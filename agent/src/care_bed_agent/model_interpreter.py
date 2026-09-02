from __future__ import annotations

from typing import Mapping, Sequence

from .intent_contract import parse_model_intent, unknown_intent
from .intents import Intent, IntentInterpretationError
from .llm import ChatModel, GlmClientError, GlmNotConfiguredError
from .prompting import build_system_prompt


class AiIntentInterpreter:
    _SYSTEM_PROMPT = build_system_prompt()

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
            return unknown_intent(text)
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

        return parse_model_intent(
            text,
            response,
            model_name=self._model.model_name,
            minimum_confidence=self._minimum_confidence,
        )
