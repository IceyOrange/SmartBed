from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any, Callable, Mapping, Protocol, Sequence


SpeechPayload = Mapping[str, Any]
CommandRunner = Callable[[Sequence[str], float], subprocess.CompletedProcess[str]]


class SpeechRecognizer(Protocol):
    def status(self) -> SpeechPayload: ...

    def recognize(self, *, timeout_seconds: int) -> SpeechPayload: ...


class SpeechRecognitionError(RuntimeError):
    pass


_STATUS_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
try {
    Add-Type -AssemblyName System.Speech -ErrorAction Stop
    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
        Where-Object { $_.Culture.Name -eq 'zh-CN' } |
        Select-Object -First 1
    if ($null -eq $recognizer) {
        [ordered]@{
            available = $false
            engine = 'windows-system-speech'
            language = 'zh-CN'
            message = 'Windows 未安装中文语音识别器'
        } | ConvertTo-Json -Compress
    } else {
        [ordered]@{
            available = $true
            engine = 'windows-system-speech'
            language = $recognizer.Culture.Name
            message = '本机中文语音识别已就绪'
        } | ConvertTo-Json -Compress
    }
} catch {
    [ordered]@{
        available = $false
        engine = 'windows-system-speech'
        language = 'zh-CN'
        message = '本机中文语音识别不可用'
    } | ConvertTo-Json -Compress
}
"""


_RECOGNIZE_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$engine = $null
try {
    Add-Type -AssemblyName System.Speech -ErrorAction Stop
    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
        Where-Object { $_.Culture.Name -eq 'zh-CN' } |
        Select-Object -First 1
    if ($null -eq $recognizer) {
        [ordered]@{
            ok = $false
            code = 'speech_unavailable'
            message = 'Windows 未安装中文语音识别器'
        } | ConvertTo-Json -Compress
    } else {
        $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizer)
        $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
        $engine.SetInputToDefaultAudioDevice()
        $result = $engine.Recognize([TimeSpan]::FromSeconds(__TIMEOUT_SECONDS__))
        if ($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
            [ordered]@{
                ok = $false
                code = 'speech_timeout'
                message = '没有听清，请靠近麦克风再说一次'
            } | ConvertTo-Json -Compress
        } else {
            [ordered]@{
                ok = $true
                text = $result.Text.Trim()
                confidence = [Math]::Round([double]$result.Confidence, 4)
                engine = 'windows-system-speech'
                language = $recognizer.Culture.Name
            } | ConvertTo-Json -Compress
        }
    }
} catch {
    [ordered]@{
        ok = $false
        code = 'speech_failed'
        message = '本机语音识别启动失败，请检查 Windows 麦克风权限和默认输入设备'
    } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $engine) {
        $engine.Dispose()
    }
}
"""


def _default_runner(
    command: Sequence[str],
    timeout_seconds: float,
) -> subprocess.CompletedProcess[str]:
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
        check=False,
        creationflags=creation_flags,
    )


class WindowsSpeechRecognizer:
    def __init__(
        self,
        *,
        runner: CommandRunner | None = None,
        powershell_path: str | None = None,
    ) -> None:
        self._runner = runner or _default_runner
        self._powershell_path = powershell_path or self._find_powershell()
        self._available_status: dict[str, Any] | None = None

    def status(self) -> SpeechPayload:
        if self._available_status is not None:
            return dict(self._available_status)
        if sys.platform != "win32":
            return self._unavailable("本机离线语音识别仅支持 Windows")
        if not self._powershell_path:
            return self._unavailable("未找到 Windows PowerShell")
        try:
            payload = self._invoke(_STATUS_SCRIPT, process_timeout=8)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            return self._unavailable("本机中文语音识别不可用")
        status = {
            "available": bool(payload.get("available")),
            "engine": "windows-system-speech",
            "language": str(payload.get("language") or "zh-CN"),
            "message": str(payload.get("message") or "本机中文语音识别不可用"),
        }
        if status["available"]:
            self._available_status = status
        return dict(status)

    def recognize(self, *, timeout_seconds: int = 8) -> SpeechPayload:
        status = self.status()
        if not status["available"]:
            raise SpeechRecognitionError(str(status["message"]))
        listening_seconds = max(3, min(int(timeout_seconds), 15))
        script = _RECOGNIZE_SCRIPT.replace("__TIMEOUT_SECONDS__", str(listening_seconds))
        try:
            payload = self._invoke(script, process_timeout=listening_seconds + 8)
        except subprocess.TimeoutExpired as error:
            raise TimeoutError("没有听清，请靠近麦克风再说一次") from error
        except (OSError, ValueError) as error:
            raise SpeechRecognitionError("本机语音识别启动失败，请检查 Windows 麦克风权限和默认输入设备") from error
        if not payload.get("ok"):
            message = str(payload.get("message") or "本机语音识别暂时不可用")
            if payload.get("code") == "speech_timeout":
                raise TimeoutError(message)
            raise SpeechRecognitionError(message)
        text = str(payload.get("text") or "").strip()
        if not text:
            raise TimeoutError("没有听清，请靠近麦克风再说一次")
        return {
            "text": text,
            "confidence": float(payload.get("confidence") or 0),
            "engine": "windows-system-speech",
            "language": str(payload.get("language") or "zh-CN"),
        }

    def _invoke(self, script: str, *, process_timeout: float) -> dict[str, Any]:
        if not self._powershell_path:
            raise OSError("Windows PowerShell is unavailable")
        encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
        completed = self._runner(
            [
                self._powershell_path,
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-EncodedCommand",
                encoded,
            ],
            process_timeout,
        )
        for line in reversed(completed.stdout.splitlines()):
            candidate = line.strip()
            if not candidate.startswith("{"):
                continue
            try:
                payload = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                return payload
        raise ValueError("PowerShell did not return a JSON payload")

    @staticmethod
    def _find_powershell() -> str | None:
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        bundled = Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        if bundled.is_file():
            return str(bundled)
        return shutil.which("powershell.exe") or shutil.which("powershell")

    @staticmethod
    def _unavailable(message: str) -> dict[str, Any]:
        return {
            "available": False,
            "engine": "windows-system-speech",
            "language": "zh-CN",
            "message": message,
        }
