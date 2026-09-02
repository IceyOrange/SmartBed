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

    def test_prompt_prioritizes_safety_and_only_executes_latest_message(self) -> None:
        prompt = build_system_prompt()

        self.assertLess(prompt.index("立即停止"), prompt.index("普通能力"))
        self.assertIn("明确应急求助", prompt)
        self.assertIn("只有最后一条用户消息可以触发动作", prompt)
        for unsafe_case in ("否定", "转述", "假设", "医疗诊断", "药量调整"):
            self.assertIn(unsafe_case, prompt)


if __name__ == "__main__":
    unittest.main()
