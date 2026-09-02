import unittest

from care_bed_agent.capabilities import CAPABILITIES, capability_for, supported_intent_kinds
from care_bed_agent.intents import IntentKind


class CapabilityCatalogTests(unittest.TestCase):
    def test_each_executable_kind_has_one_capability(self) -> None:
        kinds = [capability.kind for capability in CAPABILITIES]

        self.assertEqual(len(kinds), len(set(kinds)))
        self.assertEqual(
            set(IntentKind) - {IntentKind.UNKNOWN, IntentKind.COMMUNICATION},
            supported_intent_kinds(),
        )

    def test_catalog_defines_stable_product_capabilities(self) -> None:
        self.assertEqual(
            {
                "bed.adjust",
                "bed.scene",
                "bed.stop",
                "care.reminder",
                "care.record",
                "care.todo",
                "care.emergency",
                "relationship.live_call",
                "relationship.voice_message",
                "relationship.anniversary",
                "daily.agenda",
                "daily.weather",
                "daily.note",
                "daily.media",
                "daily.information",
                "daily.companion",
            },
            {capability.capability_id for capability in CAPABILITIES},
        )

    def test_lookup_checks_kind_and_action(self) -> None:
        message = capability_for(IntentKind.VOICE_MESSAGE, "send")

        self.assertIsNotNone(message)
        self.assertEqual("relationship.voice_message", message.capability_id)
        self.assertEqual(("content",), message.action_for("send").parameter_names)
        self.assertIsNone(capability_for(IntentKind.VOICE_MESSAGE, "delete"))


if __name__ == "__main__":
    unittest.main()
