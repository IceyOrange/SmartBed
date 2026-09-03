import type { VercelRequest, VercelResponse } from "@vercel/node";

// 服务端持有 Gemini API Key，前端永远看不到；一到这里就把它放进环境变量。
const API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();
const MODEL = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim() || "gemini-3.5-flash-lite";
const ENDPOINT =
  (process.env.GEMINI_API_URL ?? "").trim() ||
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
    res.status(500).json({ error: "服务端未配置 GEMINI_API_KEY" });
    return;
  }

  const body = req.body as { messages?: unknown } | undefined;
  const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  if (!messages.length) {
    res.status(400).json({ error: "缺少 messages" });
    return;
  }

  // 组装 Gemini 原生请求体：system 单独成 systemInstruction，其余拆成 contents。
  const systemInstruction =
    messages.find((m) => m.role === "system")?.content ?? "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let upstream: Response;
  try {
    upstream = await fetch(`${ENDPOINT}?key=${encodeURIComponent(API_KEY)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          responseMimeType: "application/json",
        },
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

  let raw: string | null = null;
  try {
    const payload = await upstream.json();
    raw =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    /* 走后面的空内容报错 */
  }

  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) {
    res.status(502).json({ error: "大模型返回了无法解析的响应" });
    return;
  }

  res.status(200).json({ content });
}