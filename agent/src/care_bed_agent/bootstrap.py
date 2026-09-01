from __future__ import annotations

from .bed_control import DeterministicBedController
from .direct_control import DirectControlHandler
from .domain_tools import (
    DemoClock,
    DemoWeatherService,
    InMemoryAnniversaryStore,
    InMemoryCareRecordStore,
    InMemoryCareTodoStore,
    InMemoryNoteStore,
    InMemoryVoiceMessageStore,
    SimulatedMediaService,
    SimulatedCallService,
)
from .intents import ConversationContextStore
from .llm import ChatModel
from .model_interpreter import AiIntentInterpreter
from .orchestrator import AgentOrchestrator
from .policy import AgentAccessPolicy
from .read_models import DemoReadModel
from .routing import EventRouter
from .rules import RuleEngine
from .skills.base import SkillRegistry
from .skills.bed import BedControlSkill
from .skills.care import CareCoordinationSkill
from .skills.daily_life import DailyLifeSkill
from .skills.relationship import RelationshipSkill
from .state import SharedStateStore
from .system import CareBedSystem
from .tools import InMemoryNotificationSink, InMemoryReminderStore


def build_default_agent(
    state: SharedStateStore,
    controller: DeterministicBedController,
    care_skill: CareCoordinationSkill | None = None,
    relationship_skill: RelationshipSkill | None = None,
    daily_life_skill: DailyLifeSkill | None = None,
    intent_model: ChatModel | None = None,
) -> AgentOrchestrator:
    del state
    skills = [BedControlSkill(controller)]
    if care_skill is not None:
        skills.append(care_skill)
    if relationship_skill is not None:
        skills.append(relationship_skill)
    if daily_life_skill is not None:
        skills.append(daily_life_skill)
    return AgentOrchestrator(
        interpreter=AiIntentInterpreter(model=intent_model),
        contexts=ConversationContextStore(),
        skills=SkillRegistry(skills),
        access_policy=AgentAccessPolicy(),
    )


def build_default_system(
    *,
    intent_model: ChatModel | None = None,
    seed_family_demo: bool = False,
) -> CareBedSystem:
    state = SharedStateStore()
    controller = DeterministicBedController(state)
    clock = DemoClock()
    notifications = InMemoryNotificationSink()
    reminders = InMemoryReminderStore()
    care_records = InMemoryCareRecordStore(clock)
    care_todos = InMemoryCareTodoStore(clock)
    calls = SimulatedCallService(clock)
    voice_messages = InMemoryVoiceMessageStore(clock)
    anniversaries = InMemoryAnniversaryStore(clock)
    notes = InMemoryNoteStore(clock)
    weather = DemoWeatherService()
    media = SimulatedMediaService()
    if seed_family_demo:
        _seed_family_demo(
            reminders=reminders,
            care_records=care_records,
            calls=calls,
            voice_messages=voice_messages,
        )
    read_model = DemoReadModel(
        clock=clock,
        reminders=reminders,
        care_records=care_records,
        care_todos=care_todos,
        calls=calls,
        voice_messages=voice_messages,
        anniversaries=anniversaries,
        notes=notes,
        notifications=notifications,
        weather=weather,
        media=media,
    )
    care_skill = CareCoordinationSkill(
        reminders=reminders,
        records=care_records,
        todos=care_todos,
        calls=calls,
        notifications=notifications,
    )
    relationship_skill = RelationshipSkill(
        calls=calls,
        voice_messages=voice_messages,
        anniversaries=anniversaries,
    )
    daily_life_skill = DailyLifeSkill(
        read_model=read_model,
        notes=notes,
        weather=weather,
        media=media,
    )
    return CareBedSystem(
        state=state,
        router=EventRouter(),
        direct=DirectControlHandler(controller),
        rules=RuleEngine(controller, notifications, reminders),
        agent=build_default_agent(
            state,
            controller,
            care_skill,
            relationship_skill,
            daily_life_skill,
            intent_model,
        ),
        notifications=notifications,
        reminders=reminders,
        care_records=care_records,
        care_todos=care_todos,
        calls=calls,
        voice_messages=voice_messages,
        anniversaries=anniversaries,
        notes=notes,
        weather=weather,
        media=media,
        read_model=read_model,
    )


def _seed_family_demo(
    *,
    reminders: InMemoryReminderStore,
    care_records: InMemoryCareRecordStore,
    calls: SimulatedCallService,
    voice_messages: InMemoryVoiceMessageStore,
) -> None:
    reminder_data = (
        ("今天 08:30", "早餐后服药", "已由妈妈语音确认", "done"),
        ("今天 14:00", "下午翻身护理", "王阿姨已记录完成", "done"),
        ("今天 16:30", "腿部康复训练", "妈妈选择稍后提醒", "attention"),
        ("今天 18:30", "晚间服药", "提前 10 分钟语音提醒", "upcoming"),
    )
    for scheduled_for, message, note, status in reminder_data:
        reminders.create(
            recipient="elder-1",
            scheduled_for=scheduled_for,
            message=message,
            created_by="family-1",
            note=note,
            status=status,
        )

    care_records.create(content="下午翻身护理已完成，皮肤情况无异常。", created_by="caregiver-1")
    care_records.create(content="午饭已经吃过，今天胃口还可以。", created_by="elder-1")

    voice_messages.send(
        sender="elder-1",
        recipient="family-1",
        content="午饭已经吃过了，今天胃口还可以。你晚上八点有空的话，给我打个电话。",
        duration_seconds=38,
        summary="午饭已经吃过，希望你晚上八点打电话。",
    )
    voice_messages.send(
        sender="family-1",
        recipient="elder-1",
        content="午饭后记得按医嘱服药。",
        duration_seconds=23,
        summary="提醒妈妈午饭后按医嘱服药。",
    )

    call = calls.start(contact="妈妈", priority="normal", initiated_by="family-1")
    calls.end(str(call["call_id"]))
