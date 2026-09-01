import unittest

from care_bed_agent.models import (
    EventKind,
    EventSource,
    ExecutionStatus,
    IncomingEvent,
    ProcessingPath,
)
from tests.support import build_test_system


class CareBedSystemTests(unittest.TestCase):
    def setUp(self) -> None:
        self.system = build_test_system()

    def test_handle_button_uses_direct_path_and_updates_shared_state(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.HANDLE_CONTROL,
                source=EventSource.HANDLE,
                payload={"action": "backrest_up"},
            )
        )

        self.assertEqual(ProcessingPath.DIRECT, result.path)
        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(5, self.system.snapshot().bed.backrest_degrees)

    def test_due_reminder_uses_rule_path_and_emits_notification(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.SCHEDULE_DUE,
                source=EventSource.TIMER,
                payload={"message": "现在是服药时间", "recipient": "elder-1"},
            )
        )

        self.assertEqual(ProcessingPath.RULE, result.path)
        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("现在是服药时间", self.system.notifications.items[0]["message"])

    def test_fixed_voice_stop_uses_rule_path_not_agent_path(self) -> None:
        self.system.state.update_bed(moving=True, last_action="backrest_up")

        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.FIXED_VOICE_COMMAND,
                source=EventSource.VOICE,
                payload={"action": "stop"},
            )
        )

        self.assertEqual(ProcessingPath.RULE, result.path)
        self.assertEqual("stopped", result.code)
        self.assertFalse(self.system.snapshot().bed.moving)

    def test_natural_language_uses_agent_path(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                actor_id="elder-1",
                payload={"text": "把靠背升高一点"},
            )
        )

        self.assertEqual(ProcessingPath.AGENT, result.path)
        self.assertEqual("bed_control", result.data["skill"])

    def test_device_report_updates_state_without_starting_a_task(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.DEVICE_STATE,
                source=EventSource.DEVICE,
                payload={"backrest_degrees": 28, "moving": False},
            )
        )

        self.assertEqual(ProcessingPath.OBSERVE, result.path)
        self.assertEqual(28, self.system.snapshot().bed.backrest_degrees)

    def test_structured_app_reminder_does_not_require_agent(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.APP_ACTION,
                source=EventSource.APP,
                actor_id="family-1",
                payload={
                    "action": "create_reminder",
                    "recipient": "elder-1",
                    "scheduled_for": "2026-08-28T20:00:00+08:00",
                    "message": "请按医嘱服药",
                },
            )
        )

        self.assertEqual(ProcessingPath.RULE, result.path)
        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(1, len(self.system.reminders.items))

    def test_app_agent_request_cannot_control_bed(self) -> None:
        result = self.system.handle_event(
            IncomingEvent(
                kind=EventKind.APP_ASSISTANT_REQUEST,
                source=EventSource.APP,
                actor_id="family-1",
                payload={"text": "把靠背升高一点"},
            )
        )

        self.assertEqual(ProcessingPath.AGENT, result.path)
        self.assertEqual(ExecutionStatus.REJECTED, result.status)
        self.assertEqual("remote_bed_control_forbidden", result.code)
        self.assertEqual(0, self.system.snapshot().bed.backrest_degrees)


if __name__ == "__main__":
    unittest.main()
