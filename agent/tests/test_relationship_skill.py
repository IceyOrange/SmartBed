import unittest

from care_bed_agent.models import EventKind, EventSource, ExecutionStatus, IncomingEvent
from tests.support import build_test_system


class RelationshipSkillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.system = build_test_system()

    def ask(self, text: str):
        return self.system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": text},
            )
        )

    def test_starts_simulated_family_call(self) -> None:
        result = self.ask("给女儿打电话")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("call_started", result.code)
        self.assertEqual("女儿", self.system.calls.items[0].contact)
        self.assertEqual("normal", self.system.calls.items[0].priority)

    def test_plays_latest_voice_message_from_contact(self) -> None:
        result = self.ask("播放儿子的留言")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("voice_message_playing", result.code)
        self.assertEqual("儿子", result.data["voice_message"]["sender"])
        self.assertEqual("played", self.system.voice_messages.items[0].status)

    def test_lists_today_anniversary(self) -> None:
        result = self.ask("今天是不是有家人过生日")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("anniversaries_listed", result.code)
        self.assertEqual("女儿", result.data["anniversaries"][0]["person"])

    def test_sends_birthday_greeting_as_non_realtime_message(self) -> None:
        result = self.ask("给女儿送生日祝福")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("anniversary_greeting_sent", result.code)
        sent = self.system.voice_messages.items[-1]
        self.assertEqual("elder-1", sent.sender)
        self.assertEqual("女儿", sent.recipient)
        self.assertIn("生日快乐", sent.content)


if __name__ == "__main__":
    unittest.main()
