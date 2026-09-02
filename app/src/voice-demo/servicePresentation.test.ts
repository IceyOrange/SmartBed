import { describe, expect, it } from "vitest";

import { toDemoTurn } from "../api/adapters";
import type { AgentResultDto } from "../api/types";
import { toServicePresentation } from "./servicePresentation";

function result(
  code: string,
  data: AgentResultDto["data"],
  status: AgentResultDto["status"] = "completed",
): AgentResultDto {
  return {
    event_id: `event-${code}`,
    path: "agent",
    status,
    code,
    message: `result for ${code}`,
    data,
  };
}

describe("voice service presentation", () => {
  it("uses the Agent result code rather than guessing from the transcript", () => {
    const turn = toDemoTurn("这句话不包含天气关键词", result("weather_reported", {
      weather: {
        city: "北京",
        condition: "晴",
        temperature_c: 26,
        high_c: 29,
        low_c: 18,
        source: "demo",
      },
    }));

    expect(toServicePresentation(turn)).toMatchObject({
      kind: "weather",
      city: "北京",
      condition: "晴",
      temperature: 26,
    });
  });

  it("maps every requested capability to a concrete stage", () => {
    const cases: Array<[string, AgentResultDto["data"], string]> = [
      ["completed", { bed: { backrest_degrees: 25, legrest_degrees: 5, height_cm: 52, moving: false, last_action: "backrest_up", fault: null } }, "bed"],
      ["reminder_created", { reminder: { scheduled_for: "晚上八点", message: "吃药" } }, "reminder"],
      ["care_record_created", { record: { content: "今天已经测过血压", recorded_at: "2026-09-01T09:30:00+08:00" } }, "record"],
      ["emergency_call_started", { call: { contact: "护理员", status: "calling" } }, "emergency"],
      ["care_todo_created", { todo: { title: "翻身", due: "今天", status: "pending" } }, "todo"],
      ["call_started", { call: { contact: "女儿", status: "calling" } }, "call"],
      ["voice_message_playing", { voice_message: { sender: "女儿", content: "晚上给您打电话。", duration_seconds: 38 } }, "message"],
      ["anniversary_greeting_sent", { voice_message: { recipient: "孙女", content: "生日快乐" } }, "anniversary"],
      ["today_agenda_listed", { agenda: { reminders: [], todos: [{ title: "康复训练", due: "16:30" }], anniversaries: [] } }, "agenda"],
      ["note_created", { note: { content: "眼镜在抽屉里", created_at: "2026-09-01T09:30:00+08:00" } }, "note"],
      ["companion_replied", {}, "companion"],
      ["media_playing", { playback: { query: "京剧", status: "playing" } }, "media"],
    ];

    for (const [code, data, kind] of cases) {
      expect(toServicePresentation(toDemoTurn("任意原话", result(code, data))).kind).toBe(kind);
    }
  });

  it("maps confirmation and safe failures to explicit feedback stages", () => {
    const confirmation = toDemoTurn("调到睡眠姿势", result(
      "confirmation_required",
      {
        interpretation: {
          kind: "bed_scene",
          target: null,
          action: "set_scene",
          parameters: { scene: "sleep" },
          confidence: 0.96,
          utterance_type: "command",
        },
      },
      "needs_confirmation",
    ));
    const restricted = toDemoTurn("帮我调整药量", result(
      "unknown_intent",
      {},
      "needs_clarification",
    ));

    expect(toServicePresentation(confirmation)).toMatchObject({ kind: "confirmation" });
    expect(toServicePresentation(restricted)).toMatchObject({ kind: "feedback", tone: "neutral" });
  });

  it("shows a cancelled bed action as not executed", () => {
    const cancelled = toDemoTurn("取消", result(
      "action_cancelled",
      {
        interpretation: {
          kind: "bed_scene",
          target: null,
          action: "set_scene",
          parameters: { scene: "sleep" },
          confidence: 0.96,
          utterance_type: "command",
        },
      },
    ));

    expect(toServicePresentation(cancelled)).toMatchObject({
      kind: "feedback",
      title: "操作已取消",
      badge: "未执行",
      tone: "neutral",
      detail: "床体保持原位",
    });
  });
});
