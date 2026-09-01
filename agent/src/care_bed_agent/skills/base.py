from __future__ import annotations

from typing import Protocol

from ..intents import Intent
from ..models import ExecutionResult


class AgentSkill(Protocol):
    name: str

    def supports(self, intent: Intent) -> bool: ...

    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult: ...


class SkillRegistry:
    def __init__(self, skills: list[AgentSkill]) -> None:
        self._skills = tuple(skills)

    def find(self, intent: Intent) -> AgentSkill | None:
        return next((skill for skill in self._skills if skill.supports(intent)), None)
