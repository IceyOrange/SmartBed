const ENV_KEY = (import.meta.env.VITE_GLM_API_KEY ?? "").trim();
const MODEL = (import.meta.env.VITE_GLM_MODEL ?? "glm-5.3-flash").trim() || "glm-5.3-flash";
const ENDPOINT =
  (import.meta.env.VITE_GLM_API_URL ?? "").trim() ||
  "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class GlmNotConfiguredError extends Error {}
export class GlmRequestError extends Error {}

/** 读取 API Key：仅来自由 Vercel 等注入的构建期环境变量，不做浏览器端本地存储。 */
export function resolveApiKey(): string | null {
  return ENV_KEY || null;
}

export function keyComesFromEnv(): boolean {
  return Boolean(ENV_KEY);
}

interface CompletionChoice {
  message?: { content?: unknown };
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
          ? (item as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * 浏览器直连 GLM 的单次意图识别调用。
 * 低延迟画像：非流式、response_format=json_object、低 reasoning_effort。
 * 每句话只调用一次。
 */
export async function completeIntent(messages: ChatMessage[]): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new GlmNotConfiguredError("尚未配置 GLM_API_KEY。");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        top_p: 0.8,
        reasoning_effort: "low",
        thinking: { type: "enabled" },
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GlmRequestError("识别超时了，请稍后再试。");
    }
    throw new GlmRequestError("无法连接大模型服务，请检查网络后重试。");
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      const message = payload?.error?.message ?? payload?.message;
      if (typeof message === "string" && message.trim()) detail = message.trim();
    } catch {
      /* 保留状态码 */
    }
    throw new GlmRequestError(`大模型请求失败（${detail}）。`);
  }

  let payload: { choices?: CompletionChoice[] };
  try {
    payload = await response.json();
  } catch {
    throw new GlmRequestError("大模型返回了无法解析的响应。");
  }

  const content = extractContent(payload.choices?.[0]?.message?.content).trim();
  if (!content) {
    throw new GlmRequestError("大模型没有返回可用内容。");
  }
  return content;
}

export { MODEL as glmModel };
