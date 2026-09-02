import unittest

from care_bed_agent.capabilities import CAPABILITIES
from care_bed_agent.prompting import build_system_prompt


class PromptBuilderTests(unittest.TestCase):
    def test_prompt_contains_every_capability_and_output_field(self) -> None:
        prompt = build_system_prompt()

        for capability in CAPABILITIES:
            self.assertIn(capability.capability_id, prompt)
        for field in (
            "kind",
            "target",
            "action",
            "parameters",
            "confidence",
            "negated",
            "should_execute",
            "utterance_type",
        ):
            self.assertIn(field, prompt)

    def test_prompt_contains_approved_disambiguation_examples(self) -> None:
        prompt = build_system_prompt()

        for phrase in (
            "把床全部放平",
            "调到睡眠姿势",
            "记一下我吃过药了",
            "记一下眼镜在抽屉里",
            "听听女儿的留言",
            "播放一段京剧",
            "给女儿说晚点回电话",
            "给女儿打电话",
            "我想女儿了",
        ):
            self.assertIn(phrase, prompt)

    def test_prompt_renders_every_catalog_example_for_the_model(self) -> None:
        prompt = build_system_prompt()

        for capability in CAPABILITIES:
            for action in capability.actions:
                for example in action.examples:
                    with self.subTest(
                        capability=capability.capability_id,
                        action=action.name,
                        example=example,
                    ):
                        self.assertIn(example, prompt)

    def test_prompt_routes_incomplete_supported_requests_to_local_clarification(self) -> None:
        prompt = build_system_prompt()

        self.assertIn("已经明确属于支持能力，但缺少执行细节", prompt)
        self.assertIn("仍输出对应 kind 和 action", prompt)
        self.assertIn("should_execute=true", prompt)
        self.assertIn("不得猜测或补造缺失信息", prompt)

    def test_prompt_prioritizes_safety_and_only_executes_latest_message(self) -> None:
        prompt = build_system_prompt()

        self.assertLess(prompt.index("立即停止"), prompt.index("普通能力"))
        self.assertIn("应急优先", prompt)
        self.assertIn("自伤或轻生", prompt)
        self.assertIn("只有最后一条用户消息可以触发动作", prompt)
        for unsafe_case in ("否定", "转述", "假设", "医疗诊断", "药量调整"):
            self.assertIn(unsafe_case, prompt)


if __name__ == "__main__":
    unittest.main()
