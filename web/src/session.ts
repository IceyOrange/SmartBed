import type { ChatMessage } from "./glm";
import type { MappedIntent, ModuleId } from "./modules";
import { buildSystemPrompt } from "./prompt";

export interface DialogueTurn {
  id: string;
  userText: string;
  module: ModuleId;
  intent: string;
  detail: string;
  reply: string;
  confidence: number;
  at: number;
}

const SYSTEM_PROMPT = buildSystemPrompt();
/** 送入模型的历史轮数上限，够理解“上次/刚才”这类追问即可，避免请求体膨胀。 */
const MAX_CONTEXT_TURNS = 8;

/**
 * 会话记忆：只在当前页面生命周期内保留对话历史。
 * 刷新页面即清空，不写数据库、不进 localStorage、无长期存储。
 * 存在的意义是让“上次我留言了什么”这类追问能从上下文得到回复。
 */
export class Session {
  private turns: DialogueTurn[] = [];

  get history(): readonly DialogueTurn[] {
    return this.turns;
  }

  get isEmpty(): boolean {
    return this.turns.length === 0;
  }

  /** 组装本次请求的消息：系统提示 + 最近若干轮 + 这次用户输入。 */
  buildMessages(userText: string): ChatMessage[] {
    const context: ChatMessage[] = [];
    for (const turn of this.turns.slice(-MAX_CONTEXT_TURNS)) {
      context.push({ role: "user", content: turn.userText });
      // 回给模型的助手内容用精炼摘要，既承载上文又不喂回整段 JSON。
      const summary = turn.reply || turn.detail || turn.intent;
      context.push({ role: "assistant", content: summary });
    }
    return [
      { role: "system", content: SYSTEM_PROMPT },
      ...context,
      { role: "user", content: userText },
    ];
  }

  record(userText: string, mapped: MappedIntent): DialogueTurn {
    const turn: DialogueTurn = {
      id: `${Date.now()}-${this.turns.length}`,
      userText,
      module: mapped.module,
      intent: mapped.intent,
      detail: mapped.detail,
      reply: mapped.reply,
      confidence: mapped.confidence,
      at: Date.now(),
    };
    this.turns.push(turn);
    return turn;
  }
}
