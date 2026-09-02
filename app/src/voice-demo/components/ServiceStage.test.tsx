import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ServicePresentation } from "../servicePresentation";
import ServiceStage from "./ServiceStage";

const base = {
  domain: "care" as const,
  title: "服务已处理",
  description: "已经按您的需要处理。",
  badge: "演示完成",
};

function renderStage(presentation: ServicePresentation) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onReturnToOverview = vi.fn();
  render(
    <ServiceStage
      presentation={presentation}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onReturnToOverview={onReturnToOverview}
    />,
  );
  return { onConfirm, onCancel, onReturnToOverview };
}

describe("ServiceStage", () => {
  it("shows bed posture, values, progress, and safety without bed artwork", () => {
    renderStage({
      ...base,
      domain: "body",
      kind: "bed",
      title: "靠背升高已完成",
      posture: "靠背升高",
      target: "靠背",
      targetValue: "23°",
      backrest: 23,
      legrest: 6,
      height: 52,
      stopped: false,
    });

    expect(screen.getByRole("heading", { name: "靠背升高已完成" })).toBeInTheDocument();
    expect(screen.getByText("身体舒适")).toBeInTheDocument();
    expect(screen.getByText("目标 23°")).toBeInTheDocument();
    expect(screen.getByLabelText("靠背 23°")).toBeInTheDocument();
    expect(screen.getByLabelText("腿板 6°")).toBeInTheDocument();
    expect(screen.getByLabelText("床高 52 cm")).toBeInTheDocument();
    expect(screen.getByText("安全锁正常 · 随时说“停止”")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /床|护理床/ })).not.toBeInTheDocument();
  });

  it.each([
    [
      "reminder",
      { ...base, kind: "reminder", title: "提醒已经安排", time: "20:00", content: "按时吃药" },
      ["20:00", "按时吃药", "床侧语音提醒"],
    ],
    [
      "record",
      { ...base, kind: "record", title: "护理记录已保存", content: "午饭后已服药", recordedAt: "14:08" },
      ["午饭后已服药", "14:08", "已写入本次护理记录"],
    ],
    [
      "emergency",
      { ...base, kind: "emergency", title: "正在发出紧急求助", contact: "值班护理员" },
      ["值班护理员", "正在接通", "已提升为最高优先级"],
    ],
    [
      "todo",
      { ...base, kind: "todo", title: "护理事项已加入今天", item: "测量血压", due: "16:00", state: "待完成" },
      ["测量血压", "16:00", "待完成"],
    ],
  ] as const)("renders the %s care state", (_kind, presentation, details) => {
    renderStage(presentation as ServicePresentation);
    expect(screen.getByText("照护协同")).toBeInTheDocument();
    for (const detail of details) expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it("renders a call with useful controls and local simulated hang-up", async () => {
    const user = userEvent.setup();
    renderStage({
      ...base,
      domain: "relationship",
      kind: "call",
      title: "正在联系女儿",
      contact: "女儿",
      state: "calling",
    });

    expect(screen.getByText("女")).toBeInTheDocument();
    expect(screen.getByText("家人联系")).toBeInTheDocument();
    expect(screen.getByText("正在呼叫")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "结束模拟通话" }));
    expect(screen.getByText("通话已结束（模拟）")).toBeInTheDocument();
  });

  it.each([
    [
      "message",
      { ...base, domain: "relationship", kind: "message", title: "正在播放家人留言", contact: "女儿", content: "晚上给您打电话", duration: 18, state: "playing" },
      ["女儿", "晚上给您打电话", "00:18"],
    ],
    [
      "anniversary",
      { ...base, domain: "relationship", kind: "anniversary", title: "祝福已经送出", contact: "孙女", content: "祝你生日快乐，天天开心" },
      ["孙女", "祝你生日快乐，天天开心", "祝福已送达"],
    ],
  ] as const)("renders the %s relationship state", (_kind, presentation, details) => {
    renderStage(presentation as ServicePresentation);
    for (const detail of details) expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it.each([
    [
      "agenda",
      { ...base, domain: "daily", kind: "agenda", title: "今天的事项", items: [{ title: "翻身护理", time: "14:30" }, { title: "女儿来电", time: "19:00" }] },
      ["14:30", "翻身护理", "19:00", "女儿来电"],
    ],
    [
      "weather",
      { ...base, domain: "daily", kind: "weather", title: "北京今日晴", city: "北京", condition: "晴", temperature: 26, high: 29, low: 19 },
      ["26°", "最高 29° · 最低 19°", "适合适度开窗通风"],
    ],
    [
      "note",
      { ...base, domain: "daily", kind: "note", title: "已经帮您记下", content: "眼镜放在床头抽屉里", recordedAt: "刚刚" },
      ["眼镜放在床头抽屉里", "刚刚", "仅保留在本次页面"],
    ],
    [
      "companion",
      { ...base, domain: "daily", kind: "companion", title: "我在这里陪您", reply: "今天阳光很好，我们可以聊聊您喜欢的京剧。" },
      ["今天阳光很好，我们可以聊聊您喜欢的京剧。", "您可以接着说"],
    ],
    [
      "media",
      { ...base, domain: "daily", kind: "media", title: "正在播放京剧", query: "京剧·锁麟囊选段", state: "playing" },
      ["京剧·锁麟囊选段", "播放中", "模拟播放"],
    ],
  ] as const)("renders the %s daily-life state", (_kind, presentation, details) => {
    renderStage(presentation as ServicePresentation);
    expect(screen.getByText("日常服务")).toBeInTheDocument();
    for (const detail of details) expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it("shows message playback state before and after pausing", async () => {
    const user = userEvent.setup();
    renderStage({
      ...base,
      domain: "relationship",
      kind: "message",
      title: "正在播放家人留言",
      badge: "播放中",
      contact: "女儿",
      content: "晚上给您打电话",
      duration: 18,
      state: "playing",
    });

    expect(screen.getAllByText("播放中").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "暂停模拟留言" }));
    expect(screen.getByText("已暂停")).toBeInTheDocument();
  });

  it("shows a sent family message without incoming playback controls", () => {
    renderStage({
      ...base,
      domain: "relationship",
      kind: "message",
      title: "留言已经送出",
      badge: "已送达",
      contact: "女儿",
      content: "我晚点给你回电话",
      duration: 0,
      state: "sent",
    });

    expect(screen.getByText("发送给")).toBeInTheDocument();
    expect(screen.getByText("留言已送达")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /模拟留言/ })).not.toBeInTheDocument();
  });

  it("shows media playback state before and after pausing", async () => {
    const user = userEvent.setup();
    renderStage({
      ...base,
      domain: "daily",
      kind: "media",
      title: "正在播放京剧",
      badge: "播放中",
      query: "京剧·锁麟囊选段",
      state: "playing",
    });

    expect(screen.getAllByText("播放中").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "暂停模拟播放" }));
    expect(screen.getByText("已暂停")).toBeInTheDocument();
  });

  it("routes confirmation actions back through natural-language callbacks", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderStage({
      ...base,
      domain: "body",
      kind: "confirmation",
      title: "请确认这次操作",
      action: "床体复位",
    });

    expect(screen.getByText("床体复位")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认执行" }));
    await user.click(screen.getByRole("button", { name: "取消操作" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("states that cancellation leaves the bed unchanged", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderStage({
      ...base,
      domain: "body",
      kind: "confirmation",
      title: "请确认这次操作",
      action: "切换到睡眠姿势",
    });

    await user.click(screen.getByRole("button", { name: "取消操作" }));

    expect(screen.getByText("已取消，床体没有执行调整")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认执行" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回到今日概览" })).toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("labels a completed cancellation as an operation that was not executed", () => {
    renderStage({
      ...base,
      domain: "body",
      kind: "feedback",
      title: "操作已取消",
      badge: "未执行",
      tone: "neutral",
      detail: "已取消，床体没有执行调整",
    });

    expect(screen.getByText("操作未执行")).toBeInTheDocument();
    expect(screen.queryByText("需要补充信息")).not.toBeInTheDocument();
  });

  it("shows restrained safety guidance for rejected requests", () => {
    renderStage({
      ...base,
      domain: "unknown",
      kind: "feedback",
      title: "这项操作没有执行",
      description: "药量调整需要由医护人员判断。",
      badge: "安全保护",
      tone: "safe",
    });

    expect(screen.getByText("药量调整需要由医护人员判断。")).toBeInTheDocument();
    expect(screen.getByText("服务反馈")).toBeInTheDocument();
    expect(screen.getByText("建议联系专业医护人员")).toBeInTheDocument();
  });
});
