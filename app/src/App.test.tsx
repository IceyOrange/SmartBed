import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoOverviewDto, ReminderDto } from "./api/types";
import App from "./App";

const initialReminder: ReminderDto = {
  reminder_id: "reminder-agent-1",
  recipient: "elder-1",
  scheduled_for: "今天 18:30",
  message: "后端护理事项",
  created_by: "family-1",
  note: "来自 Agent 的提醒",
  status: "upcoming",
  enabled: true,
};

const overview: DemoOverviewDto = {
  care_coordination: {
    reminders: [initialReminder],
    records: [{
      record_id: "record-1",
      content: "翻身护理已完成，皮肤情况无异常。",
      created_by: "caregiver-1",
      recorded_at: "2026-08-31T14:08:00+08:00",
    }],
    todos: [],
    notifications: [],
  },
  relationship: {
    calls: [{
      call_id: "call-1",
      contact: "妈妈",
      priority: "normal",
      status: "ended",
      initiated_by: "family-1",
      started_at: "2026-08-31T08:26:00+08:00",
      ended_at: "2026-08-31T08:38:00+08:00",
    }],
    voice_messages: [{
      message_id: "voice-1",
      sender: "elder-1",
      recipient: "family-1",
      content: "这是从 Agent 返回的留言。",
      status: "unread",
      created_at: "2026-08-31T10:20:00+08:00",
      duration_seconds: 18,
      summary: "Agent 留言摘要",
    }],
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installAgentApi() {
  let reminders = [initialReminder];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/v1/health")) return jsonResponse({ status: "ok", service: "care-bed-agent" });
    if (url.endsWith("/api/v1/state")) {
      return jsonResponse({
        revision: 0,
        bed: {
          backrest_degrees: 0,
          legrest_degrees: 0,
          height_cm: 50,
          moving: false,
          last_action: null,
          fault: null,
        },
      });
    }
    if (url.endsWith("/api/v1/demo/overview")) {
      return jsonResponse({
        ...overview,
        care_coordination: { ...overview.care_coordination, reminders },
      });
    }
    if (url.endsWith("/api/v1/reminders") && method === "GET") {
      return jsonResponse({ items: reminders });
    }
    if (url.endsWith("/api/v1/reminders") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const reminder: ReminderDto = {
        reminder_id: "reminder-created",
        recipient: String(body.recipient),
        scheduled_for: String(body.scheduled_for),
        message: String(body.message),
        created_by: String(body.actor_id),
        note: String(body.note),
        status: "upcoming",
        enabled: true,
      };
      reminders = [...reminders, reminder];
      return jsonResponse({
        event_id: "event-create",
        path: "rule",
        status: "completed",
        code: "reminder_created",
        message: "护理提醒已创建。",
        data: { reminder },
      }, 201);
    }
    if (url.includes("/api/v1/reminders/") && method === "PATCH") {
      const id = url.split("/").at(-1);
      const changes = JSON.parse(String(init?.body)) as Partial<ReminderDto>;
      reminders = reminders.map((item) => item.reminder_id === id ? { ...item, ...changes } : item);
      return jsonResponse({ item: reminders.find((item) => item.reminder_id === id) });
    }
    if (url.includes("/api/v1/reminders/") && method === "DELETE") {
      const id = url.split("/").at(-1);
      reminders = reminders.filter((item) => item.reminder_id !== id);
      return jsonResponse({ deleted_id: id });
    }
    if (url.endsWith("/api/v1/voice-messages")) {
      return jsonResponse({ item: overview.relationship.voice_messages[0] }, 201);
    }
    if (url.endsWith("/api/v1/calls")) return jsonResponse({ item: overview.relationship.calls[0] }, 201);
    if (url.includes("/api/v1/calls/")) return jsonResponse({ item: overview.relationship.calls[0] });
    return jsonResponse({ code: "not_found", message: "接口不存在" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("family care app", () => {
  beforeEach(() => {
    vi.useRealTimers();
    installAgentApi();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads the family overview from Agent", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "妈妈的今日关爱" })).toBeInTheDocument();
    expect(await screen.findByText("后端护理事项")).toBeInTheDocument();
    expect(screen.getByText("Agent 在线")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按住联系妈妈" })).toBeInTheDocument();
  });

  it("uses Agent messages and calls in one contact timeline", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "联系" }));

    expect(await screen.findByText("Agent 留言摘要")).toBeInTheDocument();
    expect(screen.getByText("与妈妈通话 12 分钟")).toBeInTheDocument();
  });

  it("saves a new care item through Agent", async () => {
    const user = userEvent.setup();
    const fetchMock = installAgentApi();
    render(<App />);

    await screen.findByText("后端护理事项");
    await user.click(screen.getByRole("button", { name: "管理护理事项" }));
    await user.click(screen.getByRole("button", { name: "新增护理事项" }));
    await user.clear(screen.getByLabelText("事项名称"));
    await user.type(screen.getByLabelText("事项名称"), "睡前测量血压");
    await user.click(screen.getByRole("button", { name: "保存并同步" }));

    expect(await screen.findByText("睡前测量血压")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/reminders",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a persistent disconnected state when Agent is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<App />);

    expect(await screen.findByText("Agent 未连接")).toBeInTheDocument();
  });

  it("hides the contact launcher on the profile tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的" }));

    expect(screen.getByRole("heading", { name: "我的关爱设置" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "按住联系妈妈" })).not.toBeInTheDocument();
  });

  it("opens care-plan management from the home card", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "管理护理事项" }));

    expect(screen.getByRole("heading", { name: "护理事项" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增护理事项" })).toBeInTheDocument();
  });

  it("reveals message and call choices after holding the launcher", async () => {
    render(<App />);
    await screen.findByText("Agent 在线");
    vi.useFakeTimers();
    const launcher = screen.getByRole("button", { name: "按住联系妈妈" });

    fireEvent.pointerDown(launcher, { clientX: 180, pointerId: 1 });
    act(() => vi.advanceTimersByTime(360));

    expect(screen.getByText("录制留言")).toBeInTheDocument();
    expect(screen.getByText("打电话")).toBeInTheDocument();
  });

  it("links to the independent bedside voice demo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "我的" }));
    const link = screen.getByRole("link", { name: /床侧语音交互演示/ });

    expect(link).toHaveAttribute("href", "/voice-demo.html");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
