import unittest

from care_bed_agent.bootstrap import build_default_system
from care_bed_agent.intents import IntentKind
from care_bed_agent.llm import GlmClientError
from care_bed_agent.model_interpreter import AiIntentInterpreter
from care_bed_agent.models import EventKind, EventSource, ExecutionStatus, IncomingEvent
from care_bed_agent.prompting import build_system_prompt


class FakeChatModel:
    model_name = "glm-5.3-flash"

    def __init__(self, *responses: str | Exception) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[list[dict[str, object]], str | None]] = []

    def complete(
        self,
        messages: list[dict[str, object]],
        *,
        response_format: str | None = None,
    ) -> str:
        self.calls.append((messages, response_format))
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def intent_json(
    kind: str,
    *,
    target: str | None = None,
    action: str | None = None,
    parameters: str = "{}",
    confidence: float = 0.95,
    negated: bool = False,
    should_execute: bool = True,
    utterance_type: str = "command",
) -> str:
    target_json = "null" if target is None else f'"{target}"'
    action_json = "null" if action is None else f'"{action}"'
    return (
        f'{{"kind":"{kind}","target":{target_json},"action":{action_json},'
        f'"parameters":{parameters},"confidence":{confidence},'
        f'"negated":{str(negated).lower()},'
        f'"should_execute":{str(should_execute).lower()},'
        f'"utterance_type":"{utterance_type}"}}'
    )


class AiIntentInterpreterTests(unittest.TestCase):
    def test_known_expression_always_calls_model(self) -> None:
        model = FakeChatModel(
            intent_json("weather", action="query", utterance_type="query")
        )
        interpreter = AiIntentInterpreter(model=model)

        intent = interpreter.interpret("今天天气怎么样")

        self.assertEqual(IntentKind.WEATHER, intent.kind)
        self.assertEqual(1, len(model.calls))
        self.assertEqual("json_object", model.calls[0][1])
        self.assertEqual(
            {"role": "system", "content": build_system_prompt()},
            model.calls[0][0][0],
        )

    def test_recent_conversation_precedes_the_current_user_request(self) -> None:
        model = FakeChatModel(
            intent_json("weather", action="query", utterance_type="query")
        )
        interpreter = AiIntentInterpreter(model=model)
        history = (
            {"role": "user", "content": "把靠背升高一点"},
            {"role": "assistant", "content": "靠背已经升高。"},
        )

        interpreter.interpret("今天天气怎么样", history=history)

        self.assertEqual(
            [
                {"role": "user", "content": "把靠背升高一点"},
                {"role": "assistant", "content": "靠背已经升高。"},
                {"role": "user", "content": "今天天气怎么样"},
            ],
            model.calls[0][0][-3:],
        )

    def test_model_maps_natural_expression_to_structured_intent(self) -> None:
        model = FakeChatModel(
            intent_json(
                "bed_adjust",
                target="backrest",
                action="up",
                parameters='{"amount":8}',
            )
        )
        interpreter = AiIntentInterpreter(model=model)

        intent = interpreter.interpret("把上半身垫得舒服些")

        self.assertEqual(IntentKind.BED_ADJUST, intent.kind)
        self.assertEqual("backrest", intent.target)
        self.assertEqual("up", intent.action)
        self.assertEqual(8, intent.parameters["amount"])

    def test_invalid_model_json_returns_unknown(self) -> None:
        interpreter = AiIntentInterpreter(model=FakeChatModel("not-json"))

        intent = interpreter.interpret("这是一条自然语言请求")

        self.assertEqual(IntentKind.UNKNOWN, intent.kind)

    def test_negated_action_returns_unknown_without_execution(self) -> None:
        interpreter = AiIntentInterpreter(
            model=FakeChatModel(
                intent_json(
                    "bed_adjust",
                    target="backrest",
                    action="up",
                    negated=True,
                    should_execute=False,
                )
            )
        )

        intent = interpreter.interpret("靠背别升高")

        self.assertEqual(IntentKind.UNKNOWN, intent.kind)
        self.assertTrue(intent.negated)

    def test_low_confidence_action_returns_unknown(self) -> None:
        interpreter = AiIntentInterpreter(
            model=FakeChatModel(
                intent_json(
                    "live_call",
                    target="女儿",
                    action="start",
                    confidence=0.4,
                )
            )
        )

        intent = interpreter.interpret("我好像想找一下女儿")

        self.assertEqual(IntentKind.UNKNOWN, intent.kind)

    def test_invalid_bed_action_returns_unknown(self) -> None:
        interpreter = AiIntentInterpreter(
            model=FakeChatModel(
                intent_json(
                    "bed_adjust",
                    target="backrest",
                    action="rotate",
                )
            )
        )

        intent = interpreter.interpret("转一下靠背")

        self.assertEqual(IntentKind.UNKNOWN, intent.kind)

    def test_unknown_utterance_type_returns_unknown(self) -> None:
        interpreter = AiIntentInterpreter(
            model=FakeChatModel(
                intent_json(
                    "bed_adjust",
                    target="backrest",
                    action="up",
                    utterance_type="unknown",
                )
            )
        )

        intent = interpreter.interpret("这句话的表达类型不明确")

        self.assertEqual(IntentKind.UNKNOWN, intent.kind)

    def test_model_failure_is_reported_without_execution(self) -> None:
        system = build_default_system(
            intent_model=FakeChatModel(GlmClientError("temporary failure"))
        )

        result = system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": "把靠背升高一点"},
            )
        )

        self.assertEqual(ExecutionStatus.FAILED, result.status)
        self.assertEqual("ai_unavailable", result.code)
        self.assertEqual(0, system.snapshot().bed.backrest_degrees)

    def test_missing_model_is_reported_without_execution(self) -> None:
        system = build_default_system()

        result = system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": "把靠背升高一点"},
            )
        )

        self.assertEqual(ExecutionStatus.FAILED, result.status)
        self.assertEqual("ai_not_configured", result.code)
        self.assertEqual(0, system.snapshot().bed.backrest_degrees)

    def test_ai_classified_app_bed_request_is_still_rejected(self) -> None:
        model = FakeChatModel(
            intent_json(
                "bed_adjust",
                target="backrest",
                action="up",
                parameters='{"amount":8}',
            )
        )
        system = build_default_system(intent_model=model)

        result = system.handle_event(
            IncomingEvent(
                kind=EventKind.APP_ASSISTANT_REQUEST,
                source=EventSource.APP,
                actor_id="family-1",
                payload={"text": "把上半身垫得舒服些"},
            )
        )

        self.assertEqual(ExecutionStatus.REJECTED, result.status)
        self.assertEqual("remote_bed_control_forbidden", result.code)
        self.assertEqual(0, system.snapshot().bed.backrest_degrees)


class ModelCompanionTests(unittest.TestCase):
    def test_companion_uses_a_single_ai_call(self) -> None:
        intent_model = FakeChatModel(
            intent_json(
                "companion",
                action="chat",
                parameters='{"reply":"当然可以，我陪您聊聊。"}',
                utterance_type="statement",
            )
        )
        system = build_default_system(intent_model=intent_model)

        result = system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": "陪我聊聊天"},
            )
        )

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("当然可以，我陪您聊聊。", result.message)
        self.assertTrue(result.data["model_used"])
        self.assertEqual("json_object", intent_model.calls[0][1])
        self.assertEqual(1, len(intent_model.calls))

    def test_companion_without_generated_reply_is_not_executed(self) -> None:
        model = FakeChatModel(
            intent_json(
                "companion",
                action="chat",
                utterance_type="statement",
            )
        )
        system = build_default_system(intent_model=model)

        result = system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": "陪我聊聊天"},
            )
        )

        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, result.status)
        self.assertEqual("unknown_intent", result.code)


if __name__ == "__main__":
    unittest.main()
