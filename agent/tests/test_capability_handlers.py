import unittest

from care_bed_agent.capabilities import CAPABILITIES
from care_bed_agent.bootstrap import build_capability_handlers
from care_bed_agent.intents import Intent, IntentKind
from care_bed_agent.skills.base import SkillRegistry


class CapabilityHandlerRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        dependency = object()
        self.handlers = build_capability_handlers(
            controller=dependency,
            reminders=dependency,
            records=dependency,
            todos=dependency,
            calls=dependency,
            notifications=dependency,
            voice_messages=dependency,
            anniversaries=dependency,
            read_model=dependency,
            notes=dependency,
            weather=dependency,
            media=dependency,
        )

    def test_every_catalog_capability_has_one_handler(self) -> None:
        self.assertEqual(
            {capability.capability_id for capability in CAPABILITIES},
            {handler.capability_id for handler in self.handlers},
        )

    def test_registry_finds_exactly_one_handler_for_each_catalog_entry(self) -> None:
        registry = SkillRegistry(list(self.handlers))

        for capability in CAPABILITIES:
            action = capability.actions[0].name
            intent = Intent(kind=capability.kind, raw_text="测试", action=action)
            with self.subTest(capability=capability.capability_id):
                self.assertEqual(capability.capability_id, registry.find(intent).capability_id)

    def test_registry_does_not_match_unknown_intent(self) -> None:
        registry = SkillRegistry(list(self.handlers))

        self.assertIsNone(registry.find(Intent(kind=IntentKind.UNKNOWN, raw_text="不确定")))

    def test_registry_rejects_duplicate_capability_ids(self) -> None:
        duplicate = [self.handlers[0], self.handlers[0]]

        with self.assertRaisesRegex(ValueError, "duplicate capability handler"):
            SkillRegistry(duplicate)


if __name__ == "__main__":
    unittest.main()
