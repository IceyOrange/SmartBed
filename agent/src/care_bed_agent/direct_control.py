from __future__ import annotations

from .bed_control import DeterministicBedController
from .models import BedAction, BedCommand, EventKind, ExecutionResult, ExecutionStatus, IncomingEvent


class DirectControlHandler:
    _ACTIONS = {action.value: action for action in BedAction if action is not BedAction.SET_POSITION}

    def __init__(self, controller: DeterministicBedController) -> None:
        self._controller = controller

    def handle(self, event: IncomingEvent) -> ExecutionResult:
        if event.kind in {EventKind.EMERGENCY_STOP, EventKind.SAFETY_SIGNAL}:
            return self._controller.execute(BedCommand(action=BedAction.STOP, emergency=True))

        action_name = str(event.payload.get("action", ""))
        action = self._ACTIONS.get(action_name)
        if action is None:
            return ExecutionResult(
                status=ExecutionStatus.REJECTED,
                code="invalid_direct_action",
                message="无法识别该实体控制动作。",
            )
        amount = int(event.payload.get("amount", 5))
        return self._controller.execute(BedCommand(action=action, amount=amount))

