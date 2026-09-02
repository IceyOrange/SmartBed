import json
import unittest

from care_bed_agent.intent_contract import parse_model_intent
from care_bed_agent.intents import IntentKind


def model_json(
    kind: str,
    *,
    target: object = None,
    action: object = None,
    parameters: object = None,
    confidence: object = 0.95,
    negated: object = False,
    should_execute: object = True,
    utterance_type: object = "command",
) -> str:
    return json.dumps(
        {
            "kind": kind,
            "target": target,
            "action": action,
            "parameters": {} if parameters is None else parameters,
            "confidence": confidence,
            "negated": negated,
            "should_execute": should_execute,
            "utterance_type": utterance_type,
        },
        ensure_ascii=False,
    )


class IntentContractTests(unittest.TestCase):
    def parse(self, text: str, response: str):
        return parse_model_intent(
            text,
            response,
            model_name="test-model",
            minimum_confidence=0.7,
        )

    def test_parses_valid_intent_and_clamps_bed_amount(self) -> None:
        intent = self.parse(
            "把靠背升高一些",
            model_json(
                "bed_adjust",
                target="backrest",
                action="up",
                parameters={"amount": 99},
            ),
        )

        self.assertEqual(IntentKind.BED_ADJUST, intent.kind)
        self.assertEqual("backrest", intent.target)
        self.assertEqual(10, intent.parameters["amount"])

    def test_missing_scene_remains_legal_for_handler_clarification(self) -> None:
        intent = self.parse(
            "调个姿势",
            model_json("bed_scene", action="set_scene"),
        )

        self.assertEqual(IntentKind.BED_SCENE, intent.kind)
        self.assertNotIn("scene", intent.parameters)

    def test_invalid_scene_is_removed_for_handler_clarification(self) -> None:
        intent = self.parse(
            "切换姿势",
            model_json(
                "bed_scene",
                action="set_scene",
                parameters={"scene": "standing"},
            ),
        )

        self.assertEqual(IntentKind.BED_SCENE, intent.kind)
        self.assertEqual({}, intent.parameters)

    def test_filters_parameters_not_declared_by_capability(self) -> None:
        intent = self.parse(
            "给女儿打电话",
            model_json(
                "live_call",
                target="女儿",
                action="start",
                parameters={"tool": "shell", "amount": 99},
            ),
        )

        self.assertEqual(IntentKind.LIVE_CALL, intent.kind)
        self.assertEqual({}, intent.parameters)

    def test_trims_declared_string_parameters(self) -> None:
        intent = self.parse(
            "记一下眼镜在抽屉里",
            model_json(
                "note",
                action="create",
                parameters={"content": " 眼镜在抽屉里 ", "extra": "drop"},
            ),
        )

        self.assertEqual({"content": "眼镜在抽屉里"}, intent.parameters)

    def test_companion_requires_reply_and_records_model(self) -> None:
        missing = self.parse("陪我说说话", model_json("companion", action="chat"))
        valid = self.parse(
            "陪我说说话",
            model_json(
                "companion",
                action="chat",
                parameters={"reply": " 我在，慢慢说。 "},
                utterance_type="statement",
            ),
        )

        self.assertEqual(IntentKind.UNKNOWN, missing.kind)
        self.assertEqual(IntentKind.COMPANION, valid.kind)
        self.assertEqual("我在，慢慢说。", valid.parameters["reply"])
        self.assertEqual("test-model", valid.parameters["model"])

    def test_rejects_invalid_kind_action_target_and_shape(self) -> None:
        cases = (
            model_json("unsupported", action="run"),
            model_json("live_call", target="女儿", action="delete"),
            model_json("bed_adjust", target="ceiling", action="up"),
            model_json("weather", target="杭州", action="query"),
            json.dumps([], ensure_ascii=False),
            "not-json",
        )

        for response in cases:
            with self.subTest(response=response):
                self.assertEqual(IntentKind.UNKNOWN, self.parse("测试", response).kind)

    def test_rejects_low_confidence_negated_and_non_executable_output(self) -> None:
        cases = (
            model_json("weather", action="query", confidence=0.2),
            model_json("bed_adjust", target="backrest", action="up", negated=True, should_execute=False),
            model_json("live_call", target="女儿", action="start", should_execute=False),
            model_json("weather", action="query", utterance_type="unknown"),
        )

        for response in cases:
            with self.subTest(response=response):
                self.assertEqual(IntentKind.UNKNOWN, self.parse("测试", response).kind)
        self.assertTrue(self.parse("不要升高", cases[1]).negated)


if __name__ == "__main__":
    unittest.main()
