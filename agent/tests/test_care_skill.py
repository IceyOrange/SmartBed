import unittest

from care_bed_agent.models import (
    EventKind,
    EventSource,
    ExecutionStatus,
    IncomingEvent,
    ProcessingPath,
)
from tests.support import build_test_system


class CareCoordinationSkillTests(unittest.TestCase):
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

    def test_creates_care_reminder_from_natural_language(self) -> None:
        result = self.ask("提醒我晚上八点吃药")

        self.assertEqual(ProcessingPath.AGENT, result.path)
        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("reminder_created", result.code)
        self.assertEqual("晚上八点", self.system.reminders.items[0].scheduled_for)
        self.assertEqual("吃药", self.system.reminders.items[0].message)

    def test_creates_care_record(self) -> None:
        result = self.ask("记录一下今天已经测过血压")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("care_record_created", result.code)
        self.assertEqual("今天已经测过血压", self.system.care_records.items[0].content)

    def test_creates_care_todo(self) -> None:
        result = self.ask("新增一个明天翻身的待办")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("care_todo_created", result.code)
        self.assertEqual("翻身", self.system.care_todos.items[0].title)
        self.assertEqual("明天", self.system.care_todos.items[0].due)
        self.assertEqual("pending", self.system.care_todos.items[0].status)

    def test_emergency_call_uses_high_priority_simulated_call(self) -> None:
        result = self.ask("帮我呼叫护理员")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("emergency_call_started", result.code)
        self.assertEqual("护理员", self.system.calls.items[0].contact)
        self.assertEqual("emergency", self.system.calls.items[0].priority)
        self.assertEqual("calling", self.system.calls.items[0].status)


if __name__ == "__main__":
    unittest.main()
