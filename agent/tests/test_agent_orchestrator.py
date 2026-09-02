import unittest

from care_bed_agent.bed_control import DeterministicBedController
from care_bed_agent.bootstrap import build_default_agent
from care_bed_agent.models import ExecutionStatus
from care_bed_agent.state import SharedStateStore
from tests.support import ScriptedIntentModel


class AgentOrchestratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.state = SharedStateStore()
        self.controller = DeterministicBedController(self.state)
        self.agent = build_default_agent(
            self.state,
            self.controller,
            intent_model=ScriptedIntentModel(),
        )

    def test_natural_language_bed_request_uses_bed_skill(self) -> None:
        result = self.agent.handle_text("把靠背升高一点", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("bed_control", result.data["skill"])
        self.assertEqual(5, self.state.snapshot().bed.backrest_degrees)

    def test_relative_follow_up_reuses_conversation_target(self) -> None:
        self.agent.handle_text("把靠背升高一点", actor_id="elder-1")

        result = self.agent.handle_text("再高一点", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(10, self.state.snapshot().bed.backrest_degrees)

    def test_relative_request_without_context_asks_for_clarification(self) -> None:
        result = self.agent.handle_text("再高一点", actor_id="elder-2")

        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, result.status)
        self.assertEqual("missing_bed_target", result.code)
        self.assertEqual(0, self.state.snapshot().bed.backrest_degrees)

    def test_large_bed_request_waits_for_confirmation(self) -> None:
        result = self.agent.handle_text("把靠背大幅升高", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.NEEDS_CONFIRMATION, result.status)
        self.assertEqual("confirmation_required", result.code)
        self.assertEqual(0, self.state.snapshot().bed.backrest_degrees)

    def test_confirmation_executes_pending_bed_request_once(self) -> None:
        self.agent.handle_text("把靠背大幅升高", actor_id="elder-1")

        result = self.agent.handle_text("确认", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(10, self.state.snapshot().bed.backrest_degrees)
        repeated = self.agent.handle_text("确认", actor_id="elder-1")
        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, repeated.status)

    def test_cancellation_discards_pending_bed_request(self) -> None:
        self.agent.handle_text("把靠背大幅升高", actor_id="elder-1")

        result = self.agent.handle_text("取消", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("action_cancelled", result.code)
        self.assertEqual(0, self.state.snapshot().bed.backrest_degrees)

    def test_stop_clears_pending_bed_request(self) -> None:
        self.agent.handle_text("把靠背大幅升高", actor_id="elder-1")

        result = self.agent.handle_text("马上停下", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual("stopped", result.code)
        confirmation = self.agent.handle_text("确认", actor_id="elder-1")
        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, confirmation.status)

    def test_scene_request_executes_after_confirmation(self) -> None:
        pending = self.agent.handle_text("调到吃饭姿势", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.NEEDS_CONFIRMATION, pending.status)
        result = self.agent.handle_text("确认", actor_id="elder-1")

        bed = self.state.snapshot().bed
        self.assertEqual(ExecutionStatus.COMPLETED, result.status)
        self.assertEqual(55, bed.backrest_degrees)
        self.assertEqual(15, bed.legrest_degrees)

    def test_incomplete_scene_request_clarifies_before_confirmation(self) -> None:
        self.agent = build_default_agent(
            self.state,
            self.controller,
            intent_model=ScriptedIntentModel(
                {
                    "调个姿势": {
                        "kind": "bed_scene",
                        "target": None,
                        "action": "set_scene",
                        "parameters": {},
                        "confidence": 0.96,
                        "negated": False,
                        "should_execute": True,
                        "utterance_type": "command",
                    }
                }
            ),
        )

        result = self.agent.handle_text("调个姿势", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, result.status)
        self.assertEqual("missing_bed_target", result.code)

    def test_large_relative_adjustment_clarifies_before_confirmation(self) -> None:
        self.agent = build_default_agent(
            self.state,
            self.controller,
            intent_model=ScriptedIntentModel(
                {
                    "再大幅调一点": {
                        "kind": "bed_adjust",
                        "target": None,
                        "action": "up",
                        "parameters": {"amount": 10},
                        "confidence": 0.96,
                        "negated": False,
                        "should_execute": True,
                        "utterance_type": "command",
                    }
                }
            ),
        )

        result = self.agent.handle_text("再大幅调一点", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, result.status)
        self.assertEqual("missing_bed_target", result.code)

    def test_unknown_request_does_not_invent_an_action(self) -> None:
        result = self.agent.handle_text("我今天感觉有一点奇怪", actor_id="elder-1")

        self.assertEqual(ExecutionStatus.NEEDS_CLARIFICATION, result.status)
        self.assertEqual("unknown_intent", result.code)
        self.assertEqual(0, self.state.snapshot().bed.backrest_degrees)


if __name__ == "__main__":
    unittest.main()
