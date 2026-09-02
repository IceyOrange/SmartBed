import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import IdleOverview from "./IdleOverview";

const overview = {
  care_coordination: {
    reminders: [{ scheduled_for: "14:30", message: "翻身护理", enabled: true }],
    records: [],
    todos: [{ status: "pending" }, { status: "done" }],
    notifications: [],
  },
  relationship: {
    calls: [],
    voice_messages: [{ sender: "女儿", status: "unread", duration_seconds: 38 }],
    anniversaries: [],
  },
  daily_life: {
    notes: [],
    weather: { city: "北京", condition: "晴", temperature_c: 26, high_c: 29, low_c: 19, source: "demo" },
    media: { status: "stopped", query: null },
  },
};

const systemState = {
  revision: 1,
  bed: {
    backrest_degrees: 18,
    legrest_degrees: 0,
    height_cm: 52,
    moving: false,
    last_action: null,
    fault: null,
  },
};

describe("IdleOverview", () => {
  it("presents today's bedside state through lived information, not a feature wall", () => {
    render(<IdleOverview overview={overview as never} systemState={systemState} />);

    expect(screen.getByText("今日床侧")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "一切都安排好了" })).toBeInTheDocument();
    expect(screen.getByText("舒适坐姿")).toBeInTheDocument();
    expect(screen.getByText("18°")).toBeInTheDocument();
    expect(screen.getByText("14:30 · 翻身护理")).toBeInTheDocument();
    expect(screen.getByText("女儿留了一条语音")).toBeInTheDocument();
    expect(screen.getByText("晴，最高 29℃")).toBeInTheDocument();
    expect(screen.getByText("调到睡眠姿势")).toBeInTheDocument();
    for (const label of ["身体舒适", "照护协同", "家人联系", "护理呼叫"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
