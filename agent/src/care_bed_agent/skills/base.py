from __future__ import annotations

from typing import Protocol, Sequence

from ..intents import Intent, IntentKind
from ..models import ExecutionResult


class CapabilityHandler(Protocol):
    capability_id: str
    intent_kind: IntentKind
    name: str

    def can_handle(self, intent: Intent) -> bool: ...

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult: ...


AgentSkill = CapabilityHandler


class KindCapabilityHandler:
    capability_id: str
    intent_kind: IntentKind
    actions: frozenset[str]

    def can_handle(self, intent: Intent) -> bool:
        return intent.kind is self.intent_kind and intent.action in self.actions


class SkillRegistry:
    def __init__(self, skills: Sequence[CapabilityHandler]) -> None:
        capability_ids = [skill.capability_id for skill in skills]
        if len(capability_ids) != len(set(capability_ids)):
            raise ValueError("duplicate capability handler")
        self._skills = tuple(skills)

    def find(self, intent: Intent) -> CapabilityHandler | None:
        matches = [skill for skill in self._skills if skill.can_handle(intent)]
        if len(matches) > 1:
            raise RuntimeError(f"multiple handlers match {intent.kind.value}/{intent.action}")
        return matches[0] if matches else None
