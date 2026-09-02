from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path


AGENT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENT_ROOT / "src"))
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from care_bed_agent.capabilities import capability_for
from care_bed_agent.intents import Intent, IntentInterpretationError, IntentKind
from care_bed_agent.llm import GlmChatClient, GlmClientError, GlmSettings, load_env_file
from care_bed_agent.model_interpreter import AiIntentInterpreter


@dataclass(frozen=True, slots=True)
class SmokeCase:
    phrase: str
    expected_kind: IntentKind
    expected_action: str | None


CASES = (
    SmokeCase("把床全部放平", IntentKind.BED_SCENE, "set_scene"),
    SmokeCase("调到睡眠姿势", IntentKind.BED_SCENE, "set_scene"),
    SmokeCase("记一下我吃过药了", IntentKind.CARE_RECORD, "create"),
    SmokeCase("记一下眼镜在抽屉里", IntentKind.NOTE, "create"),
    SmokeCase("听听女儿的留言", IntentKind.VOICE_MESSAGE, "play"),
    SmokeCase("播放一段京剧", IntentKind.MEDIA, "play"),
    SmokeCase("给女儿说晚点回电话", IntentKind.VOICE_MESSAGE, "send"),
    SmokeCase("给女儿打电话", IntentKind.LIVE_CALL, "start"),
    SmokeCase("我想女儿了", IntentKind.UNKNOWN, None),
    SmokeCase("不要把靠背升高", IntentKind.UNKNOWN, None),
    SmokeCase("如果我摔倒了就帮我呼叫护理员", IntentKind.UNKNOWN, None),
    SmokeCase("把降压药加倍", IntentKind.UNKNOWN, None),
    SmokeCase("救命，快叫护理员", IntentKind.EMERGENCY_CALL, "call"),
)


def _validation_error(case: SmokeCase, intent: Intent) -> str | None:
    if case.phrase == "我想女儿了":
        if intent.kind not in {IntentKind.UNKNOWN, IntentKind.COMPANION}:
            return f"不得触发 {intent.kind.value}"
        if intent.kind is IntentKind.COMPANION and intent.action != "chat":
            return f"陪聊动作应为 chat，实际为 {intent.action!r}"
        return None

    if intent.kind is not case.expected_kind:
        return f"kind 应为 {case.expected_kind.value}，实际为 {intent.kind.value}"
    if intent.action != case.expected_action:
        return f"action 应为 {case.expected_action!r}，实际为 {intent.action!r}"
    if intent.kind is IntentKind.UNKNOWN:
        return None

    capability = capability_for(intent.kind, intent.action or "")
    action = capability.action_for(intent.action or "") if capability else None
    if action is None:
        return "没有匹配到能力目录动作"
    if action.target_mode != "none" and not intent.target:
        return "缺少目标对象"
    missing = [name for name in action.required_parameters if name not in intent.parameters]
    if missing:
        return f"缺少必填参数：{', '.join(missing)}"
    return None


def main() -> int:
    load_env_file(AGENT_ROOT / ".env")
    settings = GlmSettings.intent_from_env()
    if not settings.configured:
        print("GLM 冒烟测试未运行：agent/.env 或环境变量中未配置 GLM_API_KEY。", file=sys.stderr)
        return 2

    interpreter = AiIntentInterpreter(model=GlmChatClient(settings))
    failures: list[str] = []
    for case in CASES:
        try:
            intent = interpreter.interpret(case.phrase)
        except (IntentInterpretationError, GlmClientError) as error:
            failures.append(f"{case.phrase}：模型调用失败：{error}")
            continue

        print(json.dumps({
            "phrase": case.phrase,
            "kind": intent.kind.value,
            "action": intent.action,
            "parameters": dict(intent.parameters),
        }, ensure_ascii=False))
        error = _validation_error(case, intent)
        if error:
            failures.append(f"{case.phrase}：{error}")

    if failures:
        print("\nGLM 冒烟测试失败：", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"\nGLM 冒烟测试通过：{len(CASES)} 条话术。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
