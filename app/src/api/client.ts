import type {
  AgentResultDto,
  CallSessionDto,
  CreateReminderInput,
  DemoOverviewDto,
  HealthDto,
  ItemResponse,
  ReminderDto,
  ReminderListDto,
  SpeechRecognitionDto,
  SpeechStatusDto,
  SystemStateDto,
  UpdateReminderInput,
  VoiceMessageDto,
} from "./types";

interface AgentApiOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ErrorPayload {
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, { status = 0, code = "request_failed" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isAgentResult(payload: unknown): payload is AgentResultDto {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AgentResultDto>;
  return typeof candidate.event_id === "string" && typeof candidate.message === "string";
}

export function createAgentApi({
  baseUrl = import.meta.env.VITE_AGENT_BASE_URL ?? "",
  fetchImpl,
  timeoutMs = 20_000,
}: AgentApiOptions = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  let speechRequestToken: string | null = null;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    acceptAgentResult = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? globalThis.fetch)(`${normalizedBaseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
        signal: controller.signal,
      });
      const payload = await response.json() as unknown;
      if (!response.ok && !(acceptAgentResult && isAgentResult(payload))) {
        const error = payload as ErrorPayload;
        throw new ApiError(error.message ?? `请求失败（${response.status}）`, {
          status: response.status,
          code: error.code ?? "http_error",
        });
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("护理床 Agent 响应超时。", { code: "timeout" });
      }
      throw new ApiError("无法连接护理床 Agent。", { code: "network_error" });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function getSpeechStatus() {
    const status = await request<SpeechStatusDto>("/api/v1/speech/status");
    speechRequestToken = status.request_token;
    return status;
  }

  async function recognizeSpeech() {
    if (!speechRequestToken) await getSpeechStatus();
    return request<SpeechRecognitionDto>("/api/v1/speech/recognize", {
      method: "POST",
      body: JSON.stringify({ request_token: speechRequestToken }),
    });
  }

  return {
    health: () => request<HealthDto>("/api/v1/health"),
    getSpeechStatus,
    recognizeSpeech,
    getState: () => request<SystemStateDto>("/api/v1/state"),
    getOverview: () => request<DemoOverviewDto>("/api/v1/demo/overview"),
    getReminders: () => request<ReminderListDto>("/api/v1/reminders"),
    createReminder: (input: CreateReminderInput) =>
      request<AgentResultDto>("/api/v1/reminders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateReminder: (reminderId: string, input: UpdateReminderInput) =>
      request<ItemResponse<ReminderDto>>(`/api/v1/reminders/${encodeURIComponent(reminderId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    deleteReminder: (reminderId: string) =>
      request<{ deleted_id: string }>(`/api/v1/reminders/${encodeURIComponent(reminderId)}`, {
        method: "DELETE",
      }),
    createVoiceMessage: (input: {
      sender: string;
      recipient: string;
      content: string;
      duration_seconds: number;
      summary: string;
    }) => request<ItemResponse<VoiceMessageDto>>("/api/v1/voice-messages", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    startCall: (input: { contact: string; initiated_by: string }) =>
      request<ItemResponse<CallSessionDto>>("/api/v1/calls", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    endCall: (callId: string) =>
      request<ItemResponse<CallSessionDto>>(`/api/v1/calls/${encodeURIComponent(callId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ended" }),
      }),
    sendFamilyMessage: (text: string, actorId = "family-1") =>
      request<AgentResultDto>("/api/v1/agent/messages", {
        method: "POST",
        body: JSON.stringify({ text, actor_id: actorId }),
      }, true),
    sendBedsideMessage: (text: string, actorId = "elder-1") =>
      request<AgentResultDto>("/api/v1/bedside/messages", {
        method: "POST",
        body: JSON.stringify({ text, actor_id: actorId }),
      }, true),
  };
}

export const agentApi = createAgentApi();
