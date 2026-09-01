import unittest

from care_bed_agent.models import EventKind, EventSource, IncomingEvent, ProcessingPath
from care_bed_agent.routing import EventRouter


class EventRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.router = EventRouter()

    def test_handle_control_bypasses_agent(self) -> None:
        event = IncomingEvent(
            kind=EventKind.HANDLE_CONTROL,
            source=EventSource.HANDLE,
            payload={"action": "backrest_up"},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.DIRECT, decision.path)

    def test_emergency_stop_bypasses_agent(self) -> None:
        event = IncomingEvent(
            kind=EventKind.EMERGENCY_STOP,
            source=EventSource.SAFETY_DEVICE,
            payload={},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.DIRECT, decision.path)

    def test_scheduled_event_uses_rules(self) -> None:
        event = IncomingEvent(
            kind=EventKind.SCHEDULE_DUE,
            source=EventSource.TIMER,
            payload={"message": "现在是服药时间"},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.RULE, decision.path)

    def test_structured_app_action_uses_rules(self) -> None:
        event = IncomingEvent(
            kind=EventKind.APP_ACTION,
            source=EventSource.APP,
            payload={"action": "create_reminder"},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.RULE, decision.path)

    def test_natural_language_uses_agent(self) -> None:
        event = IncomingEvent(
            kind=EventKind.NATURAL_LANGUAGE,
            source=EventSource.VOICE,
            payload={"text": "帮我把靠背升高一点"},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.AGENT, decision.path)

    def test_device_state_is_observed_without_reprocessing(self) -> None:
        event = IncomingEvent(
            kind=EventKind.DEVICE_STATE,
            source=EventSource.DEVICE,
            payload={"backrest_degrees": 25},
        )

        decision = self.router.route(event)

        self.assertEqual(ProcessingPath.OBSERVE, decision.path)


if __name__ == "__main__":
    unittest.main()
