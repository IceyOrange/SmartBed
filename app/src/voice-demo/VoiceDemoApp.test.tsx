import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentInterpretationDto, AgentResultDto } from "../api/types";
import VoiceDemoApp from "./VoiceDemoApp";

const originalMediaDevices = Object.getOwnPropertyDescriptor(window.navigator, "mediaDevices");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resultFor(
  text: string,
  status: AgentResultDto["status"] = "completed",
): AgentResultDto {
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
  if (text.includes("靠背")) {
    interpretation = {
      kind: "bed_adjust",
      target: "backrest",
      action: "up",
      parameters: { amount: 5 },
      confidence: 0.97,
      utterance_type: "command",
    };
    message = "床体调节已完成。";
    code = "completed";
  } else if (text.includes("放平") || text === "确认") {
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
      : "床体调节已完成。";
    code = status === "needs_confirmation" ? "confirmation_required" : "completed";
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
  }
  return {
    event_id: `event-${text}`,
    path: "agent",
    status,
    code,
    message,
    data: { interpretation },
  };
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
    const body = JSON.parse(String(init?.body)) as { text: string };
    if (body.text.includes("放平")) {
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
    vi.unstubAllGlobals();
  });

  it("explains the Agent result in plain language", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    expect(screen.getByText("智能护理床中控 Agent")).toBeInTheDocument();
    expect(screen.getByText(/可使用文字输入/)).toBeInTheDocument();
    expect(await screen.findByText("Agent 已连接")).toBeInTheDocument();
    await user.type(screen.getByLabelText("输入想对护理床说的话"), "把靠背升高一点");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));

    expect(await screen.findByText("Agent 听懂了")).toBeInTheDocument();
    expect(screen.getByText("你想把护理床靠背升高一点。")).toBeInTheDocument();
    expect(screen.getByText("调用的功能")).toBeInTheDocument();
    expect(screen.getByText("调节护理床靠背。")).toBeInTheDocument();
    expect(screen.getByText("处理结果")).toBeInTheDocument();
    expect(screen.getByText("床体调节已完成。")).toBeInTheDocument();
    expect(screen.queryByText("功能域")).not.toBeInTheDocument();
    expect(screen.queryByText("置信度")).not.toBeInTheDocument();
    expect(screen.queryByText("任务编排")).not.toBeInTheDocument();
  });

  it("fills an example into the input and waits for send", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.click(screen.getAllByRole("button", { name: "示例：给女儿打电话" })[0]);
    expect(screen.getByLabelText("输入想对护理床说的话")).toHaveValue("给女儿打电话");
    expect(screen.queryByText("正在联系女儿。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("正在联系女儿。")).toBeInTheDocument();
  });

  it("fills a capability-card example without submitting it", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.click(screen.getByRole("button", { name: "示例：听听女儿的留言" }));
    expect(screen.getByLabelText("输入想对护理床说的话")).toHaveValue("听听女儿的留言");
    expect(screen.queryByText("这是女儿的留言。")).not.toBeInTheDocument();
  });

  it("confirms a protected bed action through Agent", async () => {
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "把床全部放平");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));
    expect(await screen.findByText("这是幅度较大的床体动作，请确认是否执行。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认执行" }));
    expect(await screen.findByText("床体调节已完成。")).toBeInTheDocument();
  });

  it("submits a final microphone transcript automatically", async () => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: never) => void) | null = null;
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
    expect(screen.getByText("你想播放京剧。")).toBeInTheDocument();
  });

  it("uses Agent local speech recognition before the browser and submits it automatically", async () => {
    const fetchMock = installBedsideApi({ speechAvailable: true, speechText: "播放京剧" });
    const browserStart = vi.fn();
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart = null;
      onend = null;
      onresult = null;
      onerror = null;
      start = browserStart;
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition as unknown as NonNullable<typeof window.SpeechRecognition>;
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    expect(await screen.findByText("本机中文语音识别已就绪，点击麦克风开始说话")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始语音识别" }));

    expect(await screen.findByText("正在播放京剧。")).toBeInTheDocument();
    expect(screen.getByText("你想播放京剧。")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/v1/speech/recognize"))).toBe(true);
    expect(browserStart).not.toHaveBeenCalled();
  });

  it("keeps the no-speech error visible after recognition ends", async () => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: never) => void) | null = null;
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
    expect(screen.queryByText("点击麦克风再次说话，也可使用文字输入")).not.toBeInTheDocument();
  });

  it("requests microphone permission before starting recognition", async () => {
    const start = vi.fn();
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
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

  it("keeps the text and shows a connection error when Agent is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const user = userEvent.setup();
    render(<VoiceDemoApp />);

    await user.type(screen.getByLabelText("输入想对护理床说的话"), "今天天气怎么样");
    await user.click(screen.getByRole("button", { name: "发送文字指令" }));

    expect(await screen.findByText("无法连接护理床 Agent。")).toBeInTheDocument();
    expect(screen.getByLabelText("输入想对护理床说的话")).toHaveValue("今天天气怎么样");
  });
});
