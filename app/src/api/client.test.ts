import { describe, expect, it, vi } from "vitest";

import { createAgentApi } from "./client";
import type { AgentResultDto } from "./types";

const health = { status: "ok" as const, service: "care-bed-agent" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Agent API client", () => {
  it("uses the relative API path and JSON headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(health), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await expect(api.health()).resolves.toEqual(health);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/health",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });

  it("returns structured Agent failures for the bedside UI", async () => {
    const payload: AgentResultDto = {
      event_id: "event-1",
      path: "agent",
      status: "failed",
      code: "ai_unavailable",
      message: "AI意图识别暂时不可用，请稍后重试。",
      data: {},
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await expect(api.sendBedsideMessage("今天天气怎么样", "elder-1")).resolves.toEqual(payload);
  });

  it("normalizes non-Agent HTTP failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "unavailable", message: "服务不可用" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await expect(api.health()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      code: "unavailable",
      message: "服务不可用",
    });
  });

  it("normalizes network failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await expect(api.health()).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      code: "network_error",
      message: "无法连接护理床 Agent。",
    });
  });

  it("gets local speech status from the Agent", async () => {
    const payload = {
      available: true,
      engine: "windows-system-speech",
      language: "zh-CN",
      message: "本机中文语音识别已就绪",
      request_token: "speech-token",
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(payload));
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await expect(api.getSpeechStatus()).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/speech/status",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });

  it("requests one local speech transcript from the Agent", async () => {
    const status = {
      available: true,
      engine: "windows-system-speech",
      language: "zh-CN",
      message: "本机中文语音识别已就绪",
      request_token: "speech-token",
    };
    const transcript = {
      text: "播放一段京剧",
      confidence: 0.93,
      engine: "windows-system-speech",
      language: "zh-CN",
    };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(status))
      .mockResolvedValueOnce(jsonResponse(transcript));
    const api = createAgentApi({ fetchImpl, timeoutMs: 1000 });

    await api.getSpeechStatus();
    await expect(api.recognizeSpeech()).resolves.toEqual(transcript);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "/api/v1/speech/recognize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ request_token: "speech-token" }),
      }),
    );
  });
});
