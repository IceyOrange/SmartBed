import type { VercelRequest, VercelResponse } from "@vercel/node";

// 服务端持有 GLM API Key，前端永远看不到；一到这里就把它放进环境变量。
const API_KEY = (process.env.GLM_API_KEY ?? "").trim();
const MODEL = (process.env.GLM_MODEL ?? "glm-5.3-flash").trim() || "glm-5.3-flash";
const ENDPOINT =
  (process.env.GLM_API_URL ?? "").trim() || "https://open.bigmodel.cn/api/paas/v4/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "仅支持 POST" });
    return;
  }
  if (!API_KEY) {
    res.status(500).json({ error: "服务端未配置 GLM_API_KEY" });
    return;
  }

  const body = req.body as { messages?: unknown } | undefined;
  const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  if (!messages.length) {
    res.status(400).json({ error: "缺少 messages" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
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
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      res.status(504).json({ error: "上游超时" });
    } else {
      res.status(502).json({ error: "无法连接大模型服务" });
    }
    return;
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    const detail = await upstream.text();
    res.status(502).json({ error: `大模型请求失败（HTTP ${upstream.status}）`, detail });
    return;
  }

  let payload: { choices?: { message?: { content?: unknown } }[] };
  try {
    payload = await upstream.json();
  } catch {
    res.status(502).json({ error: "大模型返回了无法解析的响应" });
    return;
  }

  const choice = payload.choices?.[0]?.message?.content;
  const content =
    typeof choice === "string"
      ? choice
      : Array.isArray(choice)
        ? choice
            .map((i) => (i && typeof i === "object" && typeof (i as { text?: unknown }).text === "string" ? (i as { text: string }).text : ""))
            .join("")
        : "";

  res.status(200).json({ content: content.trim() });
}