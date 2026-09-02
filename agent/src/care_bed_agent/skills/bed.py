from __future__ import annotations

from ..intents import Intent, IntentKind
from ..models import BedAction, BedCommand, ExecutionResult, ExecutionStatus
from ..ports import BedControlPort
from .base import KindCapabilityHandler


def _clarify(message: str) -> ExecutionResult:
    return ExecutionResult(
        status=ExecutionStatus.NEEDS_CLARIFICATION,
        code="missing_bed_target",
        message=message,
        data={"skill": "bed_control"},
    )


class _BedHandler(KindCapabilityHandler):
    name = "bed_control"

    def __init__(self, controller: BedControlPort) -> None:
        self._controller = controller

    def _execute_command(self, intent: Intent, command: BedCommand) -> ExecutionResult:
        result = self._controller.execute(command)
        return ExecutionResult(
            status=result.status,
            code=result.code,
            message=result.message,
            data={**result.data, "skill": self.name, "intent": intent.kind.value},
        )


class BedAdjustHandler(_BedHandler):
    capability_id = "bed.adjust"
    intent_kind = IntentKind.BED_ADJUST
    actions = frozenset({"up", "down"})

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        if intent.target is None:
            return _clarify("请告诉我是调节靠背、腿部，还是整床高度。")
        actions = {
            ("backrest", "up"): BedAction.BACKREST_UP,
            ("backrest", "down"): BedAction.BACKREST_DOWN,
            ("legrest", "up"): BedAction.LEGREST_UP,
            ("legrest", "down"): BedAction.LEGREST_DOWN,
            ("bed_height", "up"): BedAction.BED_UP,
            ("bed_height", "down"): BedAction.BED_DOWN,
        }
        action = actions.get((intent.target, intent.action))
        if action is None:
            return _clarify("请告诉我是调节靠背、腿部，还是整床高度。")
        command = BedCommand(action=action, amount=int(intent.parameters.get("amount", 5)))
        return self._execute_command(intent, command)


class BedSceneHandler(_BedHandler):
    capability_id = "bed.scene"
    intent_kind = IntentKind.BED_SCENE
    actions = frozenset({"set_scene"})
    _SCENES = {
        "meal": {"backrest_degrees": 55, "legrest_degrees": 15},
        "television": {"backrest_degrees": 45, "legrest_degrees": 10},
        "sleep": {"backrest_degrees": 0, "legrest_degrees": 0},
    }

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        scene = self._SCENES.get(str(intent.parameters.get("scene", "")))
        if scene is None:
            return _clarify("请告诉我需要切换到吃饭、看电视还是睡眠姿势。")
        return self._execute_command(
            intent,
            BedCommand(action=BedAction.SET_POSITION, **scene),
        )


class BedStopHandler(_BedHandler):
    capability_id = "bed.stop"
    intent_kind = IntentKind.STOP
    actions = frozenset({"stop"})

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        return self._execute_command(intent, BedCommand(action=BedAction.STOP))
