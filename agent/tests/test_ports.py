import unittest

from care_bed_agent.bed_control import DeterministicBedController
from care_bed_agent.domain_tools import DemoClock, InMemoryVoiceMessageStore, SimulatedMediaService
from care_bed_agent.ports import (
    AgendaPort,
    AnniversaryPort,
    BedControlPort,
    CallPort,
    CareRecordPort,
    CareTodoPort,
    MediaPort,
    NotePort,
    NotificationPort,
    ReminderPort,
    VoiceMessagePort,
    WeatherPort,
)
from care_bed_agent.state import SharedStateStore
from tests.support import build_test_system


class PortContractTests(unittest.TestCase):
    def test_default_adapters_implement_replaceable_ports(self) -> None:
        system = build_test_system()

        self.assertIsInstance(DeterministicBedController(SharedStateStore()), BedControlPort)
        self.assertIsInstance(system.reminders, ReminderPort)
        self.assertIsInstance(system.care_records, CareRecordPort)
        self.assertIsInstance(system.care_todos, CareTodoPort)
        self.assertIsInstance(system.notifications, NotificationPort)
        self.assertIsInstance(system.calls, CallPort)
        self.assertIsInstance(system.voice_messages, VoiceMessagePort)
        self.assertIsInstance(system.anniversaries, AnniversaryPort)
        self.assertIsInstance(system.weather, WeatherPort)
        self.assertIsInstance(system.notes, NotePort)
        self.assertIsInstance(system.media, MediaPort)
        self.assertIsInstance(system.read_model, AgendaPort)

    def test_voice_message_moves_from_unread_to_playing_to_played(self) -> None:
        messages = InMemoryVoiceMessageStore(DemoClock())

        playing = messages.play_latest(sender="儿子", recipient="elder-1")
        played = messages.mark_played(str(playing["message_id"]))

        self.assertEqual("playing", playing["status"])
        self.assertEqual("played", played["status"])
        self.assertEqual("played", messages.items[0].status)

    def test_media_supports_play_pause_and_stop(self) -> None:
        media = SimulatedMediaService()

        self.assertEqual("playing", media.play("京剧")["status"])
        self.assertEqual("paused", media.pause()["status"])
        self.assertEqual("stopped", media.stop()["status"])
        self.assertEqual("京剧", media.current["query"])


if __name__ == "__main__":
    unittest.main()
