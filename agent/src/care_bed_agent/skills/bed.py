from __future__ import annotations

from ..bed_control import DeterministicBedController
from ..intents import Intent, IntentKind
from ..models import BedAction, BedCommand, ExecutionResult, ExecutionStatus


class BedControlSkill:
    name = "bed_control"

    _SCENES = {
        "meal": {"backrest_degrees": 55, "legrest_degrees": 15},
        "television": {"backrest_degrees": 45, "legrest_degrees": 10},
        "sleep": {"backrest_degrees": 0, "legrest_degrees": 0},
    }

    def __init__(self, controller: DeterministicBedController) -> None:
        self._controller = controller

    def supports(self, intent: Intent) -> bool:
        return intent.kind in {IntentKind.BED_ADJUST, IntentKind.BED_SCENE, IntentKind.STOP}

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult:
        del actor_id
        command = self._compile(intent)
        if command is None:
            return ExecutionResult(
                status=ExecutionStatus.NEEDS_CLARIFICATION,
                code="missing_bed_target",
                message="请告诉我是调节靠背、腿部，还是整床高度。",
                data={"skill": self.name},
            )

        result = self._controller.execute(command)
        return ExecutionResult(
            status=result.status,
            code=result.code,
            message=result.message,
            data={**result.data, "skill": self.name, "intent": intent.kind.value},
        )

    def _compile(self, intent: Intent) -> BedCommand | None:
        if intent.kind is IntentKind.STOP:
            return BedCommand(action=BedAction.STOP)

        if intent.kind is IntentKind.BED_SCENE:
            scene = self._SCENES.get(str(intent.parameters.get("scene")))
            if scene is None:
                return None
            return BedCommand(action=BedAction.SET_POSITION, **scene)

        if intent.kind is not IntentKind.BED_ADJUST or intent.target is None:
            return None

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
            return None
        return BedCommand(action=action, amount=int(intent.parameters.get("amount", 5)))
