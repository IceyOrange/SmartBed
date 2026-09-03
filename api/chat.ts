import type { VercelRequest, VercelResponse } from "@vercel/node";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// —— 多模型 fallback 链 ——
// 按顺序逐个尝试：Gemini 轻量 → Gemini 主力 → GLM 兜底。
// 命中「额度耗尽」(429)、上游错误、超时或空结果时降级到下一档；
// 一有成功且非空的 JSON 就立即返回，不再往下试。
// Key 分别从环境变量读取，缺哪个就跳过哪一档。

interface GeminiAttempt {
  kind: "gemini";
  key: string;
  model: string;
}
interface GlmAttempt {
  kind: "glm";
  key: string;
  model: string;
  url: string;
}
type Attempt = GeminiAttempt | GlmAttempt;

function buildAttempts(): Attempt[] {
  const list: Attempt[] = [];

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey) {
    for (const model of [
      (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim(),
      "gemini-2.5-flash",
      "gemini-3-flash",
    ]) {
      const m = model.trim();
      if (m) list.push({ kind: "gemini", key: geminiKey, model: m });
    }
  }

  const glmKey = (process.env.GLM_API_KEY ?? "").trim();
  const glmModel = (process.env.GLM_MODEL ?? "glm-4-flash").trim();
  const glmUrl =
    (process.env.GLM_API_URL ?? "").trim() ||
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  if (glmKey) list.push({ kind: "glm", key: glmKey, model: glmModel, url: glmUrl });

  return list;
}

/** 提取 Gemini / GLM 响应里的纯文本内容，失败返回 null。 */
function extractText(
  attempt: Attempt,
  payload: Record<string, unknown>,
): string | null {
  if (attempt.kind === "gemini") {
    const parts = (payload as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }).candidates?.[0]?.content?.parts;
    const text = parts?.map((p) => p.text ?? "").join("") ?? "";
    return text.trim() || null;
  }
  const choice = (payload as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  }).choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice.trim() || null;
  if (Array.isArray(choice)) {
    return choice.map((i) => i?.text ?? "").join("").trim() || null;
  }
  return null;
}

/** 组装 Gemini 原生请求体。 */
function geminiBody(attempt: GeminiAttempt, messages: ChatMessage[]) {
  const systemInstruction =
    messages.find((m) => m.role === "system")?.content ?? "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${attempt.model}:generateContent`,
    headers: {} as Record<string, string>,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: "application/json",
      },
    }),
    query: `?key=${encodeURIComponent(attempt.key)}`,
  };
}

/** 组装 GLM 原生请求体。 */
function glmBody(attempt: GlmAttempt, messages: ChatMessage[]) {
  return {
    url: attempt.url,
    headers: {
      Authorization: `Bearer ${attempt.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: attempt.model,
      messages,
      temperature: 0.2,
      top_p: 0.8,
      stream: false,
      response_format: { type: "json_object" },
    }),
    query: "",
  };
}

/** 判断一次上游错误是否属于「额度耗尽/该换一档」，而非网络硬错误。 */
function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "仅支持 POST" });
    return;
  }

  const body = req.body as { messages?: unknown } | undefined;
  const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  if (!messages.length) {
    res.status(400).json({ error: "缺少 messages" });
    return;
  }

  // 请求预检：防超长历史把请求体撑爆（前端已限 8 轮，这里兜底异常输入）。
  if (messages.length > 40) {
    res.status(400).json({ error: "消息过多，请精简后再试" });
    return;
  }
  const totalChars = messages.reduce(
    (sum, m) => sum + (typeof m?.content === "string" ? m.content.length : 0),
    0,
  );
  if (totalChars > 40000) {
    res.status(400).json({ error: "消息过长，请精简后再试" });
    return;
  }

  const attempts = buildAttempts();
  if (!attempts.length) {
    res.status(500).json({ error: "服务端未配置任何可用的模型 Key" });
    return;
  }

  let lastError = "所有模型均不可用";

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let upstream: Response;
    try {
      const built =
        attempt.kind === "gemini" ? geminiBody(attempt, messages) : glmBody(attempt, messages);
      const headers = built.headers;
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      headers.Accept = headers.Accept ?? "application/json";
      upstream = await fetch(built.url + built.query, {
        method: "POST",
        headers,
        body: built.body,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `${attempt.kind} ${attempt.model} 超时`;
      } else {
        lastError = `${attempt.kind} ${attempt.model} 无法连接`;
      }
      continue;
    }
    clearTimeout(timer);

    if (!upstream.ok) {
      const detail = await upstream.text();
      // 额度耗尽或上游故障：记住错误，换下一档。
      if (isRetryable(upstream.status)) {
        lastError = `${attempt.kind} ${attempt.model} HTTP ${upstream.status}`;
        continue;
      }
      // 4xx（如鉴权失败）通常是配置问题，不是额度问题，但也尝试下一档。
      lastError = `${attempt.kind} ${attempt.model} HTTP ${upstream.status}: ${detail.slice(0, 200)}`;
      continue;
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      lastError = `${attempt.kind} ${attempt.model} 返回了无法解析的响应`;
      continue;
    }

    const content = extractText(
      attempt,
      (payload ?? {}) as Record<string, unknown>,
    );
    if (content) {
      res.status(200).json({ content });
      return;
    }
    lastError = `${attempt.kind} ${attempt.model} 返回了空内容`;
  }

  res.status(502).json({ error: lastError });
}