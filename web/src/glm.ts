// 前端不再直连 GLM，也不碰 API Key——一切请求都走同源的服务端代理 /api/chat。
// Key 只存在于 Vercel 服务端环境变量（GLM_API_KEY），浏览器即使打开 DevTools 也看不到。
// 但前端仍决定请求参数（模型、温度、response_format 等），故这里保留对 buildMessages
// 结果的透传；真正的鉴权和转发在 web/api/chat.ts 里完成。

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const PROXY_URL = "/api/chat";

export class GlmNotConfiguredError extends Error {}
export class GlmRequestError extends Error {}

/**
 * 同源代理版“单次意图识别”。低延迟画像：非流式、response_format=json_object、低 reasoning。
 * 每句话只调用一次；模型名等派生参数由服务端统一决定，前端只关心内容。
 */
export async function completeIntent(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ messages }),
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
      const message = payload?.error ?? payload?.detail;
      if (typeof message === "string" && message.trim()) detail = message.trim();
    } catch {
      /* 保留状态码 */
    }
    if (response.status === 500) {
      throw new GlmNotConfiguredError("服务端还没有配置 GLM API Key。");
    }
    throw new GlmRequestError(`大模型请求失败（${detail}）。`);
  }

  let payload: { content?: unknown };
  try {
    payload = await response.json();
  } catch {
    throw new GlmRequestError("大模型返回了无法解析的响应。");
  }

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content) {
    throw new GlmRequestError("大模型没有返回可用内容。");
  }
  return content;
}