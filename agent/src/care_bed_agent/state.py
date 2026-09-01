from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from threading import RLock
from typing import Any


@dataclass(frozen=True, slots=True)
class BedState:
    backrest_degrees: int = 0
    legrest_degrees: int = 0
    height_cm: int = 50
    moving: bool = False
    last_action: str | None = None
    fault: str | None = None


@dataclass(frozen=True, slots=True)
class StateSnapshot:
    bed: BedState
    revision: int

    def to_dict(self) -> dict[str, Any]:
        return {"bed": asdict(self.bed), "revision": self.revision}


class SharedStateStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._bed = BedState()
        self._revision = 0

    def snapshot(self) -> StateSnapshot:
        with self._lock:
            return StateSnapshot(bed=self._bed, revision=self._revision)

    def update_bed(self, **changes: Any) -> StateSnapshot:
        with self._lock:
            self._bed = replace(self._bed, **changes)
            self._revision += 1
            return StateSnapshot(bed=self._bed, revision=self._revision)

    def apply_device_report(self, report: dict[str, Any]) -> StateSnapshot:
        allowed_fields = {
            "backrest_degrees",
            "legrest_degrees",
            "height_cm",
            "moving",
            "last_action",
            "fault",
        }
        changes = {key: value for key, value in report.items() if key in allowed_fields}
        return self.update_bed(**changes)

