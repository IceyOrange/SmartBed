import unittest

from care_bed_agent.models import EventKind, EventSource, ExecutionStatus, IncomingEvent
from tests.support import build_test_system


class DailyLifeSkillTests(unittest.TestCase):
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

    def test_returns_demo_weather(self) -> None:
        result = self.ask("今天天气怎么样")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("weather_reported", result.code)
        self.assertEqual("杭州", result.data["weather"]["city"])
        self.assertEqual("晴", result.data["weather"]["condition"])

    def test_saves_a_personal_note(self) -> None:
        result = self.ask("记一下明天买药")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("note_created", result.code)
        self.assertEqual("明天买药", self.system.notes.items[0].content)

    def test_companion_chat_returns_warm_non_medical_response(self) -> None:
        result = self.ask("陪我聊聊天")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("companion_replied", result.code)
        self.assertIn("我在", result.message)
        self.assertEqual("non_medical", result.data["boundary"])

    def test_starts_simulated_media_playback(self) -> None:
        result = self.ask("播放一段京剧")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("media_playing", result.code)
        self.assertEqual("京剧", self.system.media.current["query"])
        self.assertEqual("playing", self.system.media.current["status"])

    def test_today_agenda_aggregates_existing_domain_data(self) -> None:
        self.ask("提醒我晚上八点吃药")
        self.ask("新增一个今天翻身的待办")

        result = self.ask("今天有什么事")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("today_agenda_listed", result.code)
        agenda = result.data["agenda"]
        self.assertEqual("吃药", agenda["reminders"][0]["message"])
        self.assertEqual("翻身", agenda["todos"][0]["title"])
        self.assertEqual("女儿", agenda["anniversaries"][0]["person"])


if __name__ == "__main__":
    unittest.main()
