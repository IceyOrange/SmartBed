import json
import unittest
from pathlib import Path

from care_bed_agent.llm import (
    GlmChatClient,
    GlmConfigurationError,
    GlmNotConfiguredError,
    GlmSettings,
    load_env_file,
)


class FakeResponse:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def __iter__(self):
        return iter(self._chunks)

    def read(self) -> bytes:
        return b"".join(self._chunks)


class RecordingOpener:
    def __init__(self, response: FakeResponse) -> None:
        self._response = response
        self.request = None
        self.timeout = None

    def __call__(self, request, *, timeout: float):
        self.request = request
        self.timeout = timeout
        return self._response


class GlmSettingsTests(unittest.TestCase):
    def test_recommended_glm_flash_defaults_are_loaded_from_environment(self) -> None:
        settings = GlmSettings.from_env({"GLM_API_KEY": "local-secret"})

        self.assertEqual("local-secret", settings.api_key)
        self.assertEqual("glm-5.3-flash", settings.model)
        self.assertEqual(
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            settings.endpoint,
        )
        self.assertEqual(1.0, settings.temperature)
        self.assertEqual(0.95, settings.top_p)
        self.assertEqual("max", settings.reasoning_effort)
        self.assertEqual("enabled", settings.thinking_type)
        self.assertFalse(settings.clear_thinking)
        self.assertTrue(settings.stream)
        self.assertTrue(settings.tool_stream)
        self.assertTrue(settings.configured)

    def test_env_file_loads_defaults_without_overwriting_shell_values(self) -> None:
        values = {"GLM_API_KEY": "shell-secret"}

        load_env_file(Path("tests/fixtures/glm.env"), values)
        settings = GlmSettings.from_env(values)

        self.assertEqual("shell-secret", settings.api_key)
        self.assertEqual("glm-local", settings.model)
        self.assertFalse(settings.stream)

    def test_sampling_values_must_stay_within_documented_ranges(self) -> None:
        with self.assertRaises(GlmConfigurationError):
            GlmSettings(api_key="local-secret", temperature=1.01)

        with self.assertRaises(GlmConfigurationError):
            GlmSettings(api_key="local-secret", top_p=0.009)

    def test_intent_profile_uses_low_latency_defaults(self) -> None:
        settings = GlmSettings.intent_from_env({"GLM_API_KEY": "local-secret"})

        self.assertEqual("local-secret", settings.api_key)
        self.assertEqual("glm-5.3-flash", settings.model)
        self.assertEqual("low", settings.reasoning_effort)
        self.assertFalse(settings.stream)
        self.assertFalse(settings.tool_stream)
        self.assertEqual(15.0, settings.timeout_seconds)

    def test_intent_profile_can_be_overridden_independently(self) -> None:
        settings = GlmSettings.intent_from_env(
            {
                "GLM_API_KEY": "local-secret",
                "GLM_INTENT_REASONING_EFFORT": "high",
                "GLM_INTENT_TIMEOUT_SECONDS": "9",
            }
        )

        self.assertEqual("high", settings.reasoning_effort)
        self.assertEqual(9.0, settings.timeout_seconds)
        self.assertFalse(settings.stream)


class GlmChatClientTests(unittest.TestCase):
    def test_streaming_request_uses_recommended_parameters_and_image_blocks(self) -> None:
        response = FakeResponse(
            [
                b'data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\n',
                'data: {"choices":[{"delta":{"content":"你好"}}]}\n'.encode(),
                'data: {"choices":[{"delta":{"content":"呀"}}]}\n'.encode(),
                b"data: [DONE]\n",
            ]
        )
        opener = RecordingOpener(response)
        settings = GlmSettings(api_key="local-secret")
        client = GlmChatClient(settings, opener=opener)
        messages = [
            {"role": "system", "content": "只输出 JSON。"},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://example.com/bed.jpg"},
                    },
                    {"type": "text", "text": "请描述图片。"},
                ],
            },
        ]

        result = client.complete(messages, response_format="json_object")

        self.assertEqual("你好呀", result)
        self.assertEqual(settings.endpoint, opener.request.full_url)
        self.assertEqual("Bearer local-secret", opener.request.get_header("Authorization"))
        payload = json.loads(opener.request.data.decode("utf-8"))
        self.assertEqual("glm-5.3-flash", payload["model"])
        self.assertEqual(messages, payload["messages"])
        self.assertEqual(1.0, payload["temperature"])
        self.assertEqual(0.95, payload["top_p"])
        self.assertEqual("max", payload["reasoning_effort"])
        self.assertEqual(
            {"type": "enabled", "clear_thinking": False},
            payload["thinking"],
        )
        self.assertTrue(payload["stream"])
        self.assertTrue(payload["tool_stream"])
        self.assertEqual({"type": "json_object"}, payload["response_format"])

    def test_non_streaming_response_returns_message_content(self) -> None:
        response = FakeResponse(
            [
                json.dumps(
                    {"choices": [{"message": {"content": "完整回复"}}]},
                    ensure_ascii=False,
                ).encode("utf-8")
            ]
        )
        opener = RecordingOpener(response)
        client = GlmChatClient(
            GlmSettings(api_key="local-secret", stream=False),
            opener=opener,
        )

        result = client.complete([{"role": "user", "content": "你好"}])

        self.assertEqual("完整回复", result)
        payload = json.loads(opener.request.data.decode("utf-8"))
        self.assertFalse(payload["stream"])
        self.assertFalse(payload["tool_stream"])

    def test_missing_api_key_fails_before_network_request(self) -> None:
        opener = RecordingOpener(FakeResponse([]))
        client = GlmChatClient(GlmSettings(api_key=None), opener=opener)

        with self.assertRaises(GlmNotConfiguredError):
            client.complete([{"role": "user", "content": "你好"}])

        self.assertIsNone(opener.request)


if __name__ == "__main__":
    unittest.main()
