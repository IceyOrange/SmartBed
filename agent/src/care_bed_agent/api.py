from __future__ import annotations

import json
import secrets
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Mapping
from urllib.parse import parse_qs, urlsplit

from .models import EventKind, EventSource, ExecutionStatus, HandledEvent, IncomingEvent
from .speech import SpeechRecognitionError, SpeechRecognizer, WindowsSpeechRecognizer
from .system import CareBedSystem


@dataclass(frozen=True, slots=True)
class ApiResponse:
    status: int
    body: Mapping[str, Any]


class AgentApi:
    def __init__(
        self,
        system: CareBedSystem,
        speech_recognizer: SpeechRecognizer | None = None,
    ) -> None:
        self._system = system
        self._speech_recognizer = speech_recognizer or WindowsSpeechRecognizer()
        self._speech_request_token = secrets.token_urlsafe(32)

    def dispatch(
        self,
        method: str,
        path: str,
        body: Mapping[str, Any] | None = None,
    ) -> ApiResponse:
        method = method.upper()
        body = body or {}
        parsed = urlsplit(path)
        route = parsed.path
        query = parse_qs(parsed.query)
        reminder_id = self._resource_id(route, "/api/v1/reminders/")
        call_id = self._resource_id(route, "/api/v1/calls/")

        if method == "GET" and route in {"/health", "/api/v1/health"}:
            return ApiResponse(200, {"status": "ok", "service": "care-bed-agent"})
        if method == "GET" and route == "/api/v1/speech/status":
            return self._speech_status()
        if method == "POST" and route == "/api/v1/speech/recognize":
            return self._recognize_speech(body)
        if method == "GET" and route == "/api/v1/state":
            return ApiResponse(200, self._system.snapshot().to_dict())
        if method == "GET" and route == "/api/v1/reminders":
            return ApiResponse(200, {"items": [asdict(item) for item in self._system.reminders.items]})
        if method == "GET" and route == "/api/v1/capabilities":
            return ApiResponse(200, self._system.read_model.capabilities())
        if method == "GET" and route == "/api/v1/agenda/today":
            actor_id = query.get("actor_id", ["elder-1"])[0]
            return ApiResponse(200, self._system.read_model.today_agenda(actor_id))
        if method == "GET" and route == "/api/v1/demo/overview":
            return ApiResponse(200, self._system.read_model.overview())
        if method == "POST" and route == "/api/v1/reminders":
            return self._create_reminder(body)
        if method == "PATCH" and reminder_id:
            return self._update_reminder(reminder_id, body)
        if method == "DELETE" and reminder_id:
            return self._delete_reminder(reminder_id)
        if method == "POST" and route == "/api/v1/voice-messages":
            return self._create_voice_message(body)
        if method == "POST" and route == "/api/v1/calls":
            return self._start_call(body)
        if method == "PATCH" and call_id:
            return self._update_call(call_id, body)
        if method == "POST" and route == "/api/v1/agent/messages":
            return self._send_agent_message(
                body,
                kind=EventKind.APP_ASSISTANT_REQUEST,
                source=EventSource.APP,
                default_actor_id="app-user",
            )
        if method == "POST" and route == "/api/v1/bedside/messages":
            return self._send_agent_message(
                body,
                kind=EventKind.NATURAL_LANGUAGE,
                source=EventSource.VOICE,
                default_actor_id="elder-1",
            )
        return ApiResponse(404, {"code": "not_found", "message": "接口不存在。"})

    def _create_reminder(self, body: Mapping[str, Any]) -> ApiResponse:
        missing = [
            field
            for field in ("recipient", "scheduled_for", "message")
            if not body.get(field)
        ]
        if missing:
            return self._invalid(f"缺少字段：{', '.join(missing)}。")
        validation = self._validate_reminder_fields(body, partial=False)
        if validation is not None:
            return validation

        result = self._system.handle_event(
            IncomingEvent(
                kind=EventKind.APP_ACTION,
                source=EventSource.APP,
                actor_id=self._optional_string(body.get("actor_id")),
                payload={
                    "action": "create_reminder",
                    "recipient": body["recipient"],
                    "scheduled_for": body["scheduled_for"],
                    "message": body["message"],
                    "note": body.get("note", "到点后由护理床主动语音提醒"),
                    "status": body.get("status", "upcoming"),
                    "enabled": body.get("enabled", True),
                },
            )
        )
        return ApiResponse(201 if result.status is ExecutionStatus.COMPLETED else 422, self._result_body(result))

    def _update_reminder(self, reminder_id: str, body: Mapping[str, Any]) -> ApiResponse:
        validation = self._validate_reminder_fields(body, partial=True)
        if validation is not None:
            return validation
        allowed = {"scheduled_for", "message", "note", "status", "enabled"}
        changes = {key: body[key] for key in allowed if key in body}
        if not changes:
            return self._invalid("至少提供一个可更新字段。")
        item = self._system.reminders.update(reminder_id, **changes)
        if item is None:
            return self._not_found("护理事项不存在。")
        return ApiResponse(200, {"item": item})

    def _delete_reminder(self, reminder_id: str) -> ApiResponse:
        if not self._system.reminders.delete(reminder_id):
            return self._not_found("护理事项不存在。")
        return ApiResponse(200, {"deleted_id": reminder_id})

    def _create_voice_message(self, body: Mapping[str, Any]) -> ApiResponse:
        missing = [field for field in ("sender", "recipient", "content") if not body.get(field)]
        if missing:
            return self._invalid(f"缺少字段：{', '.join(missing)}。")
        duration = body.get("duration_seconds", 0)
        if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0:
            return self._invalid("duration_seconds 必须是非负整数。")
        summary = body.get("summary", "")
        if not isinstance(summary, str):
            return self._invalid("summary 必须是字符串。")
        item = self._system.voice_messages.send(
            sender=str(body["sender"]),
            recipient=str(body["recipient"]),
            content=str(body["content"]),
            duration_seconds=duration,
            summary=summary,
        )
        return ApiResponse(201, {"item": item})

    def _start_call(self, body: Mapping[str, Any]) -> ApiResponse:
        contact = body.get("contact")
        if not isinstance(contact, str) or not contact.strip():
            return self._invalid("contact 必须是非空字符串。")
        initiated_by = self._optional_string(body.get("initiated_by")) or "family-1"
        item = self._system.calls.start(
            contact=contact.strip(),
            priority="normal",
            initiated_by=initiated_by,
        )
        return ApiResponse(201, {"item": item})

    def _update_call(self, call_id: str, body: Mapping[str, Any]) -> ApiResponse:
        if body.get("status") != "ended":
            return self._invalid("通话状态只支持更新为 ended。")
        item = self._system.calls.end(call_id)
        if item is None:
            return self._not_found("通话记录不存在。")
        return ApiResponse(200, {"item": item})

    def _send_agent_message(
        self,
        body: Mapping[str, Any],
        *,
        kind: EventKind,
        source: EventSource,
        default_actor_id: str,
    ) -> ApiResponse:
        text = body.get("text")
        if not isinstance(text, str) or not text.strip():
            return self._invalid("text 必须是非空字符串。")

        result = self._system.handle_event(
            IncomingEvent(
                kind=kind,
                source=source,
                actor_id=self._optional_string(body.get("actor_id")) or default_actor_id,
                payload={"text": text},
            )
        )
        return ApiResponse(self._status_for(result), self._result_body(result))

    @classmethod
    def _validate_reminder_fields(
        cls,
        body: Mapping[str, Any],
        *,
        partial: bool,
    ) -> ApiResponse | None:
        allowed = {
            "actor_id",
            "recipient",
            "scheduled_for",
            "message",
            "note",
            "status",
            "enabled",
        }
        unknown = sorted(set(body) - allowed)
        if unknown:
            return cls._invalid(f"不支持的字段：{', '.join(unknown)}。")
        string_fields = ("scheduled_for", "message", "note")
        for field in string_fields:
            if field in body and (not isinstance(body[field], str) or not body[field].strip()):
                return cls._invalid(f"{field} 必须是非空字符串。")
        if not partial and (
            not isinstance(body.get("recipient"), str)
            or not str(body.get("recipient", "")).strip()
        ):
            return cls._invalid("recipient 必须是非空字符串。")
        if "status" in body and body["status"] not in {"done", "upcoming", "attention"}:
            return cls._invalid("status 必须是 done、upcoming 或 attention。")
        if "enabled" in body and not isinstance(body["enabled"], bool):
            return cls._invalid("enabled 必须是布尔值。")
        return None

    @staticmethod
    def _status_for(result: HandledEvent) -> int:
        if result.code == "remote_bed_control_forbidden":
            return 403
        if result.status is ExecutionStatus.REJECTED:
            return 422
        if result.status is ExecutionStatus.FAILED:
            return 501
        return 200

    def _speech_status(self) -> ApiResponse:
        status = dict(self._speech_recognizer.status())
        status["request_token"] = self._speech_request_token
        return ApiResponse(200, status)

    def _recognize_speech(self, body: Mapping[str, Any]) -> ApiResponse:
        if not secrets.compare_digest(
            str(body.get("request_token") or ""),
            self._speech_request_token,
        ):
            return ApiResponse(
                403,
                {
                    "code": "speech_access_denied",
                    "message": "语音请求已拒绝，请刷新本机演示页面后重试。",
                },
            )
        status = self._speech_recognizer.status()
        if not status.get("available"):
            return ApiResponse(
                503,
                {
                    "code": "speech_unavailable",
                    "message": str(status.get("message") or "本机中文语音识别不可用"),
                },
            )
        try:
            return ApiResponse(200, self._speech_recognizer.recognize(timeout_seconds=8))
        except TimeoutError as error:
            return ApiResponse(408, {"code": "speech_timeout", "message": str(error)})
        except SpeechRecognitionError as error:
            return ApiResponse(503, {"code": "speech_failed", "message": str(error)})

    @staticmethod
    def _result_body(result: HandledEvent) -> dict[str, Any]:
        return {
            "event_id": result.event_id,
            "path": result.path.value,
            "status": result.status.value,
            "code": result.code,
            "message": result.message,
            "data": dict(result.data),
        }

    @staticmethod
    def _invalid(message: str) -> ApiResponse:
        return ApiResponse(400, {"code": "invalid_request", "message": message})

    @staticmethod
    def _not_found(message: str) -> ApiResponse:
        return ApiResponse(404, {"code": "not_found", "message": message})

    @staticmethod
    def _resource_id(route: str, prefix: str) -> str | None:
        if not route.startswith(prefix):
            return None
        resource_id = route.removeprefix(prefix).strip("/")
        return resource_id if resource_id and "/" not in resource_id else None

    @staticmethod
    def _optional_string(value: Any) -> str | None:
        return value if isinstance(value, str) and value else None


def create_http_server(
    api: AgentApi,
    *,
    host: str = "127.0.0.1",
    port: int = 8765,
    allowed_origins: set[str] | None = None,
) -> ThreadingHTTPServer:
    trusted_origins = allowed_origins or {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    }

    class RequestHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:
            if not self._origin_allowed():
                self._write(AgentApi._not_found("不允许从当前网页访问本机 Agent。"))
                return
            self.send_response(204)
            self._cors_headers()
            self.end_headers()

        def do_GET(self) -> None:
            if urlsplit(self.path).path == "/api/v1/speech/status" and not self._origin_allowed():
                self._write(ApiResponse(403, {"code": "origin_forbidden", "message": "当前网页不能访问本机麦克风。"}))
                return
            self._write(api.dispatch("GET", self.path))

        def do_POST(self) -> None:
            self._write_with_body("POST")

        def do_PATCH(self) -> None:
            self._write_with_body("PATCH")

        def do_DELETE(self) -> None:
            self._write(api.dispatch("DELETE", self.path))

        def _write_with_body(self, method: str) -> None:
            if urlsplit(self.path).path == "/api/v1/speech/recognize" and not self._origin_allowed():
                self._write(ApiResponse(403, {"code": "origin_forbidden", "message": "当前网页不能使用本机麦克风。"}))
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length) if content_length else b"{}"
                body = json.loads(raw_body.decode("utf-8"))
                if not isinstance(body, dict):
                    raise ValueError("JSON body must be an object")
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self._write(AgentApi._invalid("请求体必须是 JSON 对象。"))
                return
            self._write(api.dispatch(method, self.path, body))

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _write(self, response: ApiResponse) -> None:
            payload = json.dumps(response.body, ensure_ascii=False).encode("utf-8")
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(payload)

        def _cors_headers(self) -> None:
            origin = self.headers.get("Origin")
            if origin in trusted_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

        def _origin_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin in trusted_origins

    return ThreadingHTTPServer((host, port), RequestHandler)
