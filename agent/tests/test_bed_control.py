import unittest

from care_bed_agent.bed_control import DeterministicBedController
from care_bed_agent.models import BedAction, BedCommand, ExecutionStatus
from care_bed_agent.state import SharedStateStore


class DeterministicBedControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.state = SharedStateStore()
        self.controller = DeterministicBedController(self.state)

    def test_direct_backrest_control_updates_shared_state(self) -> None:
        result = self.controller.execute(BedCommand(action=BedAction.BACKREST_UP))

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(5, self.state.snapshot().bed.backrest_degrees)
        self.assertEqual("backrest_up", self.state.snapshot().bed.last_action)

    def test_controller_rejects_motion_past_mechanical_limit(self) -> None:
        self.state.update_bed(backrest_degrees=75)

        result = self.controller.execute(BedCommand(action=BedAction.BACKREST_UP))

        self.assertEqual(ExecutionStatus.REJECTED, result.status)
        self.assertEqual("limit_reached", result.code)
        self.assertEqual(75, self.state.snapshot().bed.backrest_degrees)

    def test_emergency_stop_is_accepted_even_when_device_has_fault(self) -> None:
        self.state.update_bed(moving=True, last_action="backrest_up", fault="motor_overload")

        result = self.controller.execute(BedCommand(action=BedAction.STOP, emergency=True))

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertFalse(self.state.snapshot().bed.moving)
        self.assertEqual("stop", self.state.snapshot().bed.last_action)

    def test_device_report_is_authoritative_for_shared_state(self) -> None:
        self.state.apply_device_report(
            {
                "backrest_degrees": 32,
                "legrest_degrees": 12,
                "height_cm": 58,
                "moving": False,
                "fault": None,
            }
        )

        bed = self.state.snapshot().bed
        self.assertEqual(32, bed.backrest_degrees)
        self.assertEqual(12, bed.legrest_degrees)
        self.assertEqual(58, bed.height_cm)


if __name__ == "__main__":
    unittest.main()
