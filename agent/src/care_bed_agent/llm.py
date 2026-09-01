from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, MutableMapping, Protocol, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ChatMessage = Mapping[str, object]
OpenUrl = Callable[..., Any]


def load_env_file(
    path: str | Path,
    values: MutableMapping[str, str] | None = None,
) -> None:
    target = os.environ if values is None else values
    env_path = Path(path)
    if not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").strip()
        if "=" not in line:
            continue
        name, raw_value = line.split("=", 1)
        name = name.strip()
        if not name or not name.replace("_", "").isalnum() or name[0].isdigit():
            continue
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        target.setdefault(name, value)


class ChatModel(Protocol):
    @property
    def model_name(self) -> str: ...

    def complete(
        self,
        messages: Sequence[ChatMessage],
        *,
        response_format: str | None = None,
    ) -> str: ...


class GlmClientError(RuntimeError):
    pass


class GlmNotConfiguredError(GlmClientError):
    pass


class GlmConfigurationError(GlmClientError):
    pass


@dataclass(frozen=True, slots=True)
class GlmSettings:
    api_key: str | None
    model: str = "glm-5.3-flash"
    endpoint: str = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    temperature: float = 1.0
    top_p: float = 0.95
    reasoning_effort: str = "max"
    thinking_type: str = "enabled"
    clear_thinking: bool = False
    stream: bool = True
    tool_stream: bool = True
    timeout_seconds: float = 120.0

    def __post_init__(self) -> None:
        if self.thinking_type != "enabled":
            raise GlmConfigurationError("glm-5.3-flash 的 thinking.type 只能是 enabled。")
        if self.reasoning_effort not in {"low", "high", "max"}:
            raise GlmConfigurationError("reasoning_effort 必须是 low、high 或 max。")
        if not 0 <= self.temperature <= 1:
            raise GlmConfigurationError("temperature 必须在 0 到 1 之间。")
        if not 0.01 <= self.top_p <= 1:
            raise GlmConfigurationError("top_p 必须在 0.01 到 1 之间。")
        if self.timeout_seconds <= 0:
            raise GlmConfigurationError("timeout_seconds 必须大于 0。")

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    @classmethod
    def from_env(cls, values: Mapping[str, str] | None = None) -> GlmSettings:
        source = os.environ if values is None else values
        api_key = source.get("GLM_API_KEY", "").strip() or None
        return cls(
            api_key=api_key,
            model=source.get("GLM_MODEL", "glm-5.3-flash").strip() or "glm-5.3-flash",
            endpoint=(
                source.get(
                    "GLM_API_URL",
                    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                ).strip()
                or "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            ),
            temperature=cls._float_value(source, "GLM_TEMPERATURE", 1.0),
            top_p=cls._float_value(source, "GLM_TOP_P", 0.95),
            reasoning_effort=source.get("GLM_REASONING_EFFORT", "max").strip() or "max",
            thinking_type="enabled",
            clear_thinking=cls._bool_value(source, "GLM_CLEAR_THINKING", False),
            stream=cls._bool_value(source, "GLM_STREAM", True),
            tool_stream=cls._bool_value(source, "GLM_TOOL_STREAM", True),
            timeout_seconds=cls._float_value(source, "GLM_TIMEOUT_SECONDS", 120.0),
        )

    @classmethod
    def intent_from_env(cls, values: Mapping[str, str] | None = None) -> GlmSettings:
        source = os.environ if values is None else values
        base = cls.from_env(source)
        return cls(
            api_key=base.api_key,
            model=source.get("GLM_INTENT_MODEL", base.model).strip() or base.model,
            endpoint=source.get("GLM_INTENT_API_URL", base.endpoint).strip() or base.endpoint,
            temperature=cls._float_value(source, "GLM_INTENT_TEMPERATURE", 0.2),
            top_p=cls._float_value(source, "GLM_INTENT_TOP_P", 0.8),
            reasoning_effort=(
                source.get("GLM_INTENT_REASONING_EFFORT", "low").strip() or "low"
            ),
            thinking_type="enabled",
            clear_thinking=cls._bool_value(
                source,
                "GLM_INTENT_CLEAR_THINKING",
                False,
            ),
            stream=False,
            tool_stream=False,
            timeout_seconds=cls._float_value(
                source,
                "GLM_INTENT_TIMEOUT_SECONDS",
                15.0,
            ),
        )

    @staticmethod
    def _float_value(source: Mapping[str, str], name: str, default: float) -> float:
        raw_value = source.get(name)
        if raw_value is None or not raw_value.strip():
            return default
        try:
            return float(raw_value)
        except ValueError as error:
            raise GlmConfigurationError(f"{name} 必须是数字。") from error

    @staticmethod
    def _bool_value(source: Mapping[str, str], name: str, default: bool) -> bool:
        raw_value = source.get(name)
        if raw_value is None or not raw_value.strip():
            return default
        normalized = raw_value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        raise GlmConfigurationError(f"{name} 必须是 true 或 false。")


class GlmChatClient:
    def __init__(self, settings: GlmSettings, *, opener: OpenUrl = urlopen) -> None:
        self._settings = settings
        self._opener = opener

    @property
    def model_name(self) -> str:
        return self._settings.model

    def complete(
        self,
        messages: Sequence[ChatMessage],
        *,
        response_format: str | None = None,
    ) -> str:
        if not self._settings.configured:
            raise GlmNotConfiguredError("尚未配置 GLM_API_KEY。")
        if not messages:
            raise GlmClientError("messages 不能为空。")
        if response_format not in {None, "text", "json_object"}:
            raise GlmConfigurationError("response_format 仅支持 text 或 json_object。")

        payload: dict[str, object] = {
            "model": self._settings.model,
            "messages": [dict(message) for message in messages],
            "temperature": self._settings.temperature,
            "top_p": self._settings.top_p,
            "reasoning_effort": self._settings.reasoning_effort,
            "thinking": {
                "type": self._settings.thinking_type,
                "clear_thinking": self._settings.clear_thinking,
            },
            "stream": self._settings.stream,
            "tool_stream": self._settings.tool_stream and self._settings.stream,
        }
        if response_format is not None:
            payload["response_format"] = {"type": response_format}

        request = Request(
            self._settings.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._settings.api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream" if self._settings.stream else "application/json",
            },
            method="POST",
        )

        try:
            with self._opener(request, timeout=self._settings.timeout_seconds) as response:
                if self._settings.stream:
                    return self._read_stream(response)
                return self._read_response(response)
        except HTTPError as error:
            detail = self._http_error_detail(error)
            raise GlmClientError(f"GLM API 请求失败（HTTP {error.code}）：{detail}") from error
        except (URLError, TimeoutError, OSError) as error:
            raise GlmClientError(f"无法连接 GLM API：{error}") from error

    @classmethod
    def _read_stream(cls, response: Any) -> str:
        fragments: list[str] = []
        try:
            for raw_line in response:
                line = raw_line.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                data = line.removeprefix("data:").strip()
                if data == "[DONE]":
                    break
                if not data:
                    continue
                chunk = json.loads(data)
                for choice in chunk.get("choices", []):
                    content = choice.get("delta", {}).get("content")
                    fragments.extend(cls._content_fragments(content))
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError) as error:
            raise GlmClientError("GLM API 返回了无法解析的流式响应。") from error
        return cls._require_content("".join(fragments))

    @classmethod
    def _read_response(cls, response: Any) -> str:
        try:
            payload = json.loads(response.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
            KeyError,
            IndexError,
            TypeError,
        ) as error:
            raise GlmClientError("GLM API 返回了无法解析的响应。") from error
        return cls._require_content("".join(cls._content_fragments(content)))

    @staticmethod
    def _content_fragments(content: object) -> list[str]:
        if isinstance(content, str):
            return [content]
        if isinstance(content, list):
            return [
                str(item["text"])
                for item in content
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ]
        return []

    @staticmethod
    def _require_content(content: str) -> str:
        result = content.strip()
        if not result:
            raise GlmClientError("GLM API 未返回可见文本内容。")
        return result

    @staticmethod
    def _http_error_detail(error: HTTPError) -> str:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("error", {}).get("message") or payload.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError):
            pass
        return error.reason or "未知错误"
