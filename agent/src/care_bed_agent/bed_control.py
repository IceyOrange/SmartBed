from __future__ import annotations

from dataclasses import asdict

from .models import BedAction, BedCommand, ExecutionResult, ExecutionStatus
from .state import BedState, SharedStateStore


class DeterministicBedController:
    BACKREST_RANGE = (0, 75)
    LEGREST_RANGE = (0, 40)
    HEIGHT_RANGE = (40, 75)

    def __init__(self, state: SharedStateStore) -> None:
        self._state = state

    def execute(self, command: BedCommand) -> ExecutionResult:
        current = self._state.snapshot().bed

        if command.action is BedAction.STOP:
            snapshot = self._state.update_bed(moving=False, last_action=BedAction.STOP.value)
            return ExecutionResult(
                status=ExecutionStatus.COMPLETED,
                code="stopped",
                message="床体已停止，并保持当前位置。",
                data={"bed": asdict(snapshot.bed)},
            )

        if current.fault:
            return ExecutionResult(
                status=ExecutionStatus.REJECTED,
                code="device_fault",
                message="床体存在故障，当前不能执行运动操作。",
                data={"fault": current.fault},
            )

        target = self._target_state(current, command)
        if target is None:
            return ExecutionResult(
                status=ExecutionStatus.REJECTED,
                code="limit_reached",
                message="已到达安全限位，不能继续调节。",
                data={"bed": asdict(current)},
            )

        snapshot = self._state.update_bed(
            **target,
            moving=False,
            last_action=command.action.value,
        )
        return ExecutionResult(
            status=ExecutionStatus.COMPLETED,
            code="completed",
            message="床体调节已完成。",
            data={"bed": asdict(snapshot.bed)},
        )

    def _target_state(self, current: BedState, command: BedCommand) -> dict[str, int] | None:
        amount = max(1, command.amount)
        if command.action is BedAction.BACKREST_UP:
            return self._bounded("backrest_degrees", current.backrest_degrees + amount, self.BACKREST_RANGE)
        if command.action is BedAction.BACKREST_DOWN:
            return self._bounded("backrest_degrees", current.backrest_degrees - amount, self.BACKREST_RANGE)
        if command.action is BedAction.LEGREST_UP:
            return self._bounded("legrest_degrees", current.legrest_degrees + amount, self.LEGREST_RANGE)
        if command.action is BedAction.LEGREST_DOWN:
            return self._bounded("legrest_degrees", current.legrest_degrees - amount, self.LEGREST_RANGE)
        if command.action is BedAction.BED_UP:
            return self._bounded("height_cm", current.height_cm + amount, self.HEIGHT_RANGE)
        if command.action is BedAction.BED_DOWN:
            return self._bounded("height_cm", current.height_cm - amount, self.HEIGHT_RANGE)
        if command.action is BedAction.FLAT:
            return {"backrest_degrees": 0, "legrest_degrees": 0}
        if command.action is BedAction.SET_POSITION:
            targets = {
                "backrest_degrees": command.backrest_degrees,
                "legrest_degrees": command.legrest_degrees,
                "height_cm": command.height_cm,
            }
            ranges = {
                "backrest_degrees": self.BACKREST_RANGE,
                "legrest_degrees": self.LEGREST_RANGE,
                "height_cm": self.HEIGHT_RANGE,
            }
            changes: dict[str, int] = {}
            for field, value in targets.items():
                if value is None:
                    continue
                bounded = self._bounded(field, value, ranges[field])
                if bounded is None:
                    return None
                changes.update(bounded)
            return changes or None
        raise ValueError(f"不支持的床体动作: {command.action}")

    @staticmethod
    def _bounded(field: str, value: int, limits: tuple[int, int]) -> dict[str, int] | None:
        minimum, maximum = limits
        if value < minimum or value > maximum:
            return None
        return {field: value}
