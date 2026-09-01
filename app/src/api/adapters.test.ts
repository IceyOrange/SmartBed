import { describe, expect, it } from "vitest";

import { toCareTasks, toDemoTurn, toRecentUpdates, toTimelineItems } from "./adapters";
import type { AgentResultDto, DemoOverviewDto, ReminderDto } from "./types";

const reminders: ReminderDto[] = [
  {
    reminder_id: "reminder-1",
    recipient: "elder-1",
    scheduled_for: "今天 18:30",
    message: "晚间服药",
    created_by: "family-1",
    note: "提前十分钟提醒",
    status: "attention",
    enabled: false,
  },
];

const overview: DemoOverviewDto = {
  care_coordination: {
    reminders,
    records: [
      {
        record_id: "record-1",
        content: "下午翻身护理已完成，皮肤情况无异常。",
        created_by: "caregiver-1",
        recorded_at: "2026-08-31T14:08:00+08:00",
      },
    ],
    todos: [],
    notifications: [],
  },
  relationship: {
    calls: [
      {
        call_id: "call-1",
        contact: "妈妈",
        priority: "normal",
        status: "ended",
        initiated_by: "family-1",
        started_at: "2026-08-31T08:26:00+08:00",
        ended_at: "2026-08-31T08:38:00+08:00",
      },
    ],
    voice_messages: [
      {
        message_id: "message-in",
        sender: "elder-1",
        recipient: "family-1",
        content: "午饭已经吃过了。",
        status: "unread",
        created_at: "2026-08-31T10:20:00+08:00",
        duration_seconds: 38,
        summary: "妈妈确认已吃午饭。",
      },
      {
        message_id: "message-out",
        sender: "family-1",
        recipient: "elder-1",
        content: "记得按医嘱服药。",
        status: "played",
        created_at: "2026-08-31T09:45:00+08:00",
        duration_seconds: 23,
        summary: "提醒妈妈服药。",
      },
    ],
    anniversaries: [],
  },
  daily_life: {
    notes: [],
    weather: {
      city: "杭州",
      condition: "晴",
      temperature_c: 28,
      high_c: 32,
      low_c: 24,
      source: "demo",
    },
    media: { status: "idle", query: null },
  },
};

describe("Agent DTO adapters", () => {
  it("maps reminder fields to the existing care task model", () => {
    expect(toCareTasks(reminders)).toEqual([
      {
        id: "reminder-1",
        title: "晚间服药",
        time: "18:30",
        note: "提前十分钟提醒",
        status: "attention",
        enabled: false,
      },
    ]);
  });

  it("maps Agent communications into one newest-first timeline", () => {
    const items = toTimelineItems(overview.relationship);

    expect(items.map((item) => item.id)).toEqual(["message-in", "message-out", "call-1"]);
    expect(items[0]).toMatchObject({ kind: "incoming-voice", duration: 38, unread: true });
    expect(items[1]).toMatchObject({ kind: "outgoing-voice", delivery: "妈妈已播放" });
    expect(items[2]).toMatchObject({ kind: "call", title: "与妈妈通话 12 分钟" });
  });

  it("maps care records to sourced home updates", () => {
    expect(toRecentUpdates(overview.care_coordination)).toEqual([
      {
        id: "record-1",
        source: "王阿姨记录",
        time: "14:08",
        title: "下午翻身护理已完成",
        detail: "皮肤情况无异常。",
        tone: "green",
      },
    ]);
  });

  it("uses backend interpretation and execution status for a bedside turn", () => {
    const result: AgentResultDto = {
      event_id: "event-1",
      path: "agent",
      status: "needs_confirmation",
      code: "confirmation_required",
      message: "这是幅度较大的床体动作，请确认是否执行。",
      data: {
        interpretation: {
          kind: "bed_adjust",
          target: "backrest",
          action: "up",
          parameters: { amount: 10 },
          confidence: 0.97,
          utterance_type: "command",
        },
      },
    };

    expect(toDemoTurn("把靠背大幅升高", result)).toMatchObject({
      id: "event-1",
      code: "confirmation_required",
      data: result.data,
      status: "awaiting-confirmation",
      response: result.message,
      match: {
        domain: "body",
        intent: "bed.back.adjust",
        label: "靠背调节",
        confidence: "high",
        safety: "需要确认",
        route: "Agent 编排",
      },
    });
  });
});
