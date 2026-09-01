import unittest

from care_bed_agent.intents import IntentKind
from care_bed_agent.model_interpreter import AiIntentInterpreter
from tests.support import ScriptedIntentModel


class AiDomainIntentInterpreterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.model = ScriptedIntentModel()
        self.interpreter = AiIntentInterpreter(model=self.model)

    def assert_intent(self, text: str, kind: IntentKind):
        intent = self.interpreter.interpret(text)
        self.assertEqual(kind, intent.kind)
        self.assertEqual("json_object", self.model.calls[-1][1])
        return intent

    def test_interprets_care_reminder(self) -> None:
        intent = self.assert_intent("提醒我晚上八点吃药", IntentKind.REMINDER)
        self.assertEqual("晚上八点", intent.parameters["scheduled_for"])
        self.assertEqual("吃药", intent.parameters["message"])

    def test_interprets_care_record(self) -> None:
        intent = self.assert_intent("记录一下今天已经测过血压", IntentKind.CARE_RECORD)
        self.assertEqual("今天已经测过血压", intent.parameters["content"])

    def test_interprets_care_todo(self) -> None:
        intent = self.assert_intent("新增一个明天翻身的待办", IntentKind.CARE_TODO)
        self.assertEqual("明天", intent.parameters["due"])
        self.assertEqual("翻身", intent.parameters["title"])

    def test_interprets_emergency_call(self) -> None:
        intent = self.assert_intent("帮我呼叫护理员", IntentKind.EMERGENCY_CALL)
        self.assertEqual("护理员", intent.target)

    def test_interprets_live_call(self) -> None:
        intent = self.assert_intent("给女儿打电话", IntentKind.LIVE_CALL)
        self.assertEqual("女儿", intent.target)

    def test_interprets_voice_message_playback(self) -> None:
        intent = self.assert_intent("播放儿子的留言", IntentKind.VOICE_MESSAGE)
        self.assertEqual("play", intent.action)
        self.assertEqual("儿子", intent.target)

    def test_interprets_today_anniversary_query(self) -> None:
        intent = self.assert_intent("今天是不是有家人过生日", IntentKind.ANNIVERSARY)
        self.assertEqual("list_today", intent.action)

    def test_interprets_today_agenda(self) -> None:
        self.assert_intent("今天有什么事", IntentKind.TODAY_AGENDA)

    def test_interprets_weather(self) -> None:
        self.assert_intent("今天天气怎么样", IntentKind.WEATHER)

    def test_interprets_note(self) -> None:
        intent = self.assert_intent("记一下明天买药", IntentKind.NOTE)
        self.assertEqual("明天买药", intent.parameters["content"])

    def test_interprets_companion_chat(self) -> None:
        self.assert_intent("陪我聊聊天", IntentKind.COMPANION)

    def test_interprets_media_request(self) -> None:
        intent = self.assert_intent("播放一段京剧", IntentKind.MEDIA)
        self.assertEqual("京剧", intent.parameters["query"])


if __name__ == "__main__":
    unittest.main()
