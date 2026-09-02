import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentInterpretationDto, AgentResultDto } from "../api/types";
import VoiceDemoApp from "./VoiceDemoApp";

const originalMediaDevices = Object.getOwnPropertyDescriptor(window.navigator, "mediaDevices");

const overview = {
  care_coordination: {
    reminders: [{
      reminder_id: "reminder-1",
      recipient: "妈妈",
      scheduled_for: "14:30",
      message: "翻身护理",
      created_by: "nurse-1",
      note: "",
      status: "upcoming",
      enabled: true,
    }],
    records: [],
    todos: [{
      todo_id: "todo-1",
      title: "测量血压",
      due: "16:00",
      status: "待完成",
      created_by: "nurse-1",
      created_at: "2026-09-01T09:00:00+08:00",
    }],
    notifications: [],
  },
  relationship: {
    calls: [],
    voice_messages: [{
      message_id: "message-1",
      sender: "女儿",
      recipient: "妈妈",
      content: "妈，我晚上下班后给您打电话。",
      status: "unread",
      created_at: "2026-09-01T09:30:00+08:00",
      duration_seconds: 12,
      summary: "女儿晚些时候来电",
    }],
    anniversaries: [],
  },
  daily_life: {
    notes: [],
    weather: {
      city: "北京",
      condition: "晴",
      temperature_c: 26,
      high_c: 29,
      low_c: 19,
      source: "演示天气",
    },
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resultFor(text: string, status: AgentResultDto["status"] = "completed"): AgentResultDto {
  let interpretation: AgentInterpretationDto = {
    kind: "unknown",
    target: null,
    action: null,
    parameters: {},
    confidence: 0.4,
    utterance_type: "unknown",
  };
  let message = "我还不能确定您想做什么，请换一种说法。";
  let code = "unknown_intent";
  let data: Record<string, unknown> = {};
  if (text.includes("靠背")) {
    interpretation = {
      kind: "bed_adjust",
      target: "backrest",
      action: "up",
      parameters: { amount: 5 },
      confidence: 0.97,
      utterance_type: "command",
    };
    message = "靠背已升高到 23 度。";
    code = "completed";
    data = { bed: { ...systemState.bed, backrest_degrees: 23 } };
  } else if (text.includes("睡眠姿势") || text === "确认") {
    interpretation = {
      kind: "bed_scene",
      target: null,
      action: "set_scene",
      parameters: { scene: "sleep" },
      confidence: 0.98,
      utterance_type: "command",
    };
    message = status === "needs_confirmation"
      ? "这是幅度较大的床体动作，请确认是否执行。"
      : "床体已调整为舒适平躺。";
    code = status === "needs_confirmation" ? "confirmation_required" : "completed";
    data = { bed: { ...systemState.bed, backrest_degrees: 0 } };
  } else if (text.includes("打电话")) {
    interpretation = {
      kind: "live_call",
      target: "女儿",
      action: "start",
      parameters: {},
      confidence: 0.96,
      utterance_type: "command",
    };
    message = "正在联系女儿。";
    code = "call_started";
    data = { call: { contact: "女儿", status: "calling" } };
  } else if (text.includes("留言")) {
    interpretation = {
      kind: "voice_message",
      target: "女儿",
      action: "play",
      parameters: {},
      confidence: 0.95,
      utterance_type: "command",
    };
    message = "这是女儿的留言。";
    code = "voice_message_playing";
    data = { voice_message: overview.relationship.voice_messages[0] };
  } else if (text.includes("京剧")) {
    interpretation = {
      kind: "media",
      target: null,
      action: "play",
      parameters: { query: "京剧" },
      confidence: 0.95,
      utterance_type: "command",
    };
    message = "正在播放京剧。";
    code = "media_playing";
    data = { playback: { query: "京剧", status: "playing" } };
  }
  return {
    event_id: `event-${text}-${Math.random()}`,
    path: "agent",
    status,
    code,
    message,
    data: { ...data, interpretation },
  };
}

interface BedsideRequestBody {
  text: string;
  actor_id: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

function installBedsideApi({
  speechAvailable = false,
  speechText = "播放京剧",
}: {
  speechAvailable?: boolean;
  speechText?: string;
} = {}) {
  let pendingConfirmation = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/v1/health")) {
      return jsonResponse({ status: "ok", service: "care-bed-agent" });
    }
    if (url.endsWith("/api/v1/state")) return jsonResponse(systemState);
    if (url.endsWith("/api/v1/demo/overview")) return jsonResponse(overview);
    if (url.endsWith("/api/v1/speech/status")) {
      return jsonResponse({
        available: speechAvailable,
        engine: "windows-system-speech",
        language: "zh-CN",
        message: speechAvailable ? "本机中文语音识别已就绪" : "本机中文语音识别不可用",
        request_token: "speech-token",
      });
    }
    if (url.endsWith("/api/v1/speech/recognize")) {
      return jsonResponse({
        text: speechText,
        confidence: 0.93,
        engine: "windows-system-speech",
        language: "zh-CN",
      });
    }
    const body = JSON.parse(String(init?.body)) as BedsideRequestBody;
    if (body.text.includes("睡眠姿势")) {
      pendingConfirmation = true;
      return jsonResponse(resultFor(body.text, "needs_confirmation"));
    }
    if (body.text === "确认" && pendingConfirmation) {
      pendingConfirmation = false;
      return jsonResponse(resultFor(body.text));
    }
    return jsonResponse(resultFor(body.text));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bedsideRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith("/api/v1/bedside/messages"))
    .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body)) as BedsideRequestBody);
}

describe("bedside voice demo", () => {
  beforeEach(() => {
    installBedsideApi();
  });

  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    if (originalMediaDevices) {
      Object.defineProperty(window.navigator, "mediaDevices", originalMediaDevices);
    } else {
      delete (window.navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a calm daily overview instead of a bed drawing or capability wall", async () => {
    render(<VoiceDemoApp />);

    expect(screen.getByRole("heading", { name: "需要什么帮助？" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "今天，一切都安排好了" })).toBeInTheDocument();
    expect(screen.getByText("床体静止 · 安全状态正常")).toBeInTheDocument();
    expect(screen.getByText("14:30 · 翻身护理")).toBeInTheDocument();
    expect(screen.getByText("女儿的新留言")).toBeInTheDocument();
    expect(screen.getByText("北京 · 晴 26℃")).toBeInTheDocument();
    expect(screen.queryByText("中控 Agent 能做什么")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /护理床|床体/ })).not.toBeInTheDocument();
  });

  it("keeps examples inside a closable guide and only fills the text field", async () => {
    const fetchMock = installBedsideApi();
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    expect(screen.queryByRole("dialog", { name: "演示指南" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开演示指南" }));
    const guide = screen.getByRole("dialog", { name: "演示指南" });
    expect(within(guide).getByRole("heading", { name: "试着这样说" })).toBeInTheDocument();
    expect(within(guide).getByRole("button", { name: "示例：调到睡眠姿势" })).toBeInTheDocument();
    expect(within(guide).queryByRole("button", { name: "示例：把床全部放平" })).not.toBeInTheDocument();

    await user.click(within(guide).getByRole("button", { name: "示例：给女儿打电话" }));
    const input = screen.getByLabelText("输入想对护理床说的话");
    expect(input).toHaveValue("给女儿打电话");
    expect(bedsideRequests(fetchMock)).toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: "演示指南" })).not.toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("keeps keyboard focus inside the guide and restores it after Escape", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    const guideButton = screen.getByRole("button", { name: "打开演示指南" });
    await user.click(guideButton);

    const guide = screen.getByRole("dialog", { name: "演示指南" });
    expect(within(guide).getByRole("button", { name: "关闭演示指南" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "演示指南" })).not.toBeInTheDocument();
    expect(guideButton).toHaveFocus();
  });

  it("shows a trustworthy loading state before bedside data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<VoiceDemoApp />);

    expect(screen.getByRole("status", { name: "正在同步床侧状态" })).toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("returns to the daily overview without clearing the current conversation", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "把靠背升高一点");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("靠背已升高到 23 度。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "回到今日概览" }));

    expect(screen.getByRole("heading", { name: "今天，一切都安排好了" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "本次对话" })).toHaveTextContent("把靠背升高一点");
  });

  it("shows the daily overview instead of a stale result while a follow-up is pending", async () => {
    const fetchMock = installBedsideApi();
    const user = userEvent.setup();
    let rejectFollowUp: (reason?: unknown) => void = () => undefined;
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "把靠背升高一点");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("靠背已升高到 23 度。")).toBeInTheDocument();

    fetchMock.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
      rejectFollowUp = reject;
    }));
    await user.type(screen.getByLabelText("输入想对护理床说的话"), "今天天气怎么样");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));

    expect(screen.getByRole("heading", { name: "今天，一切都安排好了" })).toBeInTheDocument();
    expect(screen.queryByText("靠背已升高到 23 度。")).not.toBeInTheDocument();

    await act(async () => rejectFollowUp(new TypeError("offline")));

    expect(await screen.findByText("暂时无法连接床侧服务，请稍后重试。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "今天，一切都安排好了" })).toBeInTheDocument();
  });

  it("uses one page actor and sends only the latest eight turns as context", async () => {
    const fetchMock = installBedsideApi();
    const user = userEvent.setup();
    render(<VoiceDemoApp />);
    const input = screen.getByLabelText("输入想对护理床说的话");
    const send = screen.getByRole("button", { name: "发送文字指令" });

    for (let index = 1; index <= 10; index += 1) {
      await user.type(input, `第${index}条`);
      await user.click(send);
      await waitFor(() => expect(input).toHaveValue(""));
    }

    const requests = bedsideRequests(fetchMock);
    expect(requests).toHaveLength(10);
    expect(requests[0].actor_id).toMatch(/^voice-session-[0-9a-f-]{36}$/i);
    expect(new Set(requests.map((request) => request.actor_id)).size).toBe(1);
    expect(requests[0].history).toBeUndefined();
    expect(requests[1].history).toEqual([
      { role: "user", content: "第1条" },
      { role: "assistant", content: "我还不能确定您想做什么，请换一种说法。" },
    ]);
    expect(requests[9].history).toHaveLength(16);
    expect(requests[9].history?.[0]).toEqual({ role: "user", content: "第2条" });
    expect(requests[9].history?.[15]).toEqual({
      role: "assistant",
      content: "我还不能确定您想做什么，请换一种说法。",
    });
    expect(screen.getByRole("region", { name: "本次对话" })).toBeInTheDocument();
  });

  it("starts and stops browser speech with Space outside editable controls", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    class ManualRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend: (() => void) | null = null;
      onresult = null;
      onnomatch = null;
      onerror = null;

      start() {
        start();
        this.onstart?.();
      }

      stop() {
        stop();
        this.onend?.();
      }

      abort() {}
    }
    window.SpeechRecognition = ManualRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    render(<VoiceDemoApp />);
    await screen.findByText("点击麦克风或按空格键开始说话");

    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "停止语音识别" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("ignores the Space shortcut while an input or button has focus", async () => {
    const start = vi.fn();
    class ManualRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend = null;
      onresult = null;
      onnomatch = null;
      onerror = null;
      start = start;
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = ManualRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    render(<VoiceDemoApp />);
    await screen.findByText("点击麦克风或按空格键开始说话");

    const input = screen.getByLabelText("输入想对护理床说的话");
    input.focus();
    fireEvent.keyDown(input, { key: " ", code: "Space" });
    const guideButton = screen.getByRole("button", { name: "打开演示指南" });
    guideButton.focus();
    fireEvent.keyDown(guideButton, { key: " ", code: "Space" });

    expect(start).not.toHaveBeenCalled();
  });

  it("confirms a protected bed action through the same Agent path", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "调到睡眠姿势");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("这是幅度较大的床体动作，请确认是否执行。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认执行" }));
    expect(await screen.findByText("床体已调整为舒适平躺。")).toBeInTheDocument();
  });

  it("submits a final browser transcript automatically", async () => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend: (() => void) | null = null;
      onresult: ((event: never) => void) | null = null;
      onnomatch = null;
      onerror: ((event: { error: string }) => void) | null = null;

      start() {
        this.onstart?.();
        this.onresult?.({
          resultIndex: 0,
          results: { 0: { 0: { transcript: "播放京剧" }, isFinal: true, length: 1 }, length: 1 },
        } as never);
        this.onend?.();
      }

      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    const user = userEvent.setup();
    render(<VoiceDemoApp />);
    await user.click(screen.getByRole("button", { name: "开始语音识别" }));

    expect(await screen.findByText("正在播放京剧。")).toBeInTheDocument();
  });

  it("uses local speech recognition before the browser", async () => {
    const fetchMock = installBedsideApi({ speechAvailable: true, speechText: "播放京剧" });
    const browserStart = vi.fn();
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend = null;
      onresult = null;
      onnomatch = null;
      onerror = null;
      start = browserStart;
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    expect(await screen.findByText("本机中文语音识别已就绪，点击麦克风或按空格键开始说话")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始语音识别" }));

    expect(await screen.findByText("正在播放京剧。")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/v1/speech/recognize"))).toBe(true);
    expect(browserStart).not.toHaveBeenCalled();
  });

  it("keeps the no-speech error visible after recognition ends", async () => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend: (() => void) | null = null;
      onresult = null;
      onnomatch = null;
      onerror: ((event: { error: string }) => void) | null = null;

      start() {
        this.onstart?.();
        this.onerror?.({ error: "no-speech" });
        this.onend?.();
      }

      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    const user = userEvent.setup();
    render(<VoiceDemoApp />);
    await user.click(screen.getByRole("button", { name: "开始语音识别" }));

    expect(await screen.findByText("没有听清，请靠近麦克风再说一次")).toBeInTheDocument();
  });

  it("requests microphone permission before browser recognition", async () => {
    const start = vi.fn();
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart = null;
      onaudiostart = null;
      onsoundstart = null;
      onspeechstart = null;
      onend = null;
      onresult = null;
      onnomatch = null;
      onerror = null;
      start = start;
      stop() {}
      abort() {}
    }
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    window.SpeechRecognition = FakeRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;

    const user = userEvent.setup();
    render(<VoiceDemoApp />);
    await user.click(screen.getByRole("button", { name: "开始语音识别" }));

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(await screen.findByText("麦克风权限未开启，请在浏览器地址栏允许麦克风")).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("keeps the text and shows a connection error when the service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "今天天气怎么样");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));

    expect(await screen.findByText("暂时无法连接床侧服务，请稍后重试。")).toBeInTheDocument();
    expect(screen.getByLabelText("输入想对护理床说的话")).toHaveValue("今天天气怎么样");
  });

  it("retries the last failed request without asking the user to type it again", async () => {
    const fetchMock = installBedsideApi();
    const user = userEvent.setup();
    render(<VoiceDemoApp />);
    await screen.findByText("床体静止 · 安全状态正常");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "今天天气怎么样");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("暂时无法连接床侧服务，请稍后重试。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新发送刚才的请求" }));

    expect(await screen.findByText("我还不能确定您想做什么，请换一种说法。")).toBeInTheDocument();
    expect(screen.getByLabelText("输入想对护理床说的话")).toHaveValue("");
  });
});
