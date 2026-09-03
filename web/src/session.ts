import type { ChatMessage } from "./glm";
import type { MappedIntent, ModuleId } from "./modules";
import { buildSystemPrompt } from "./prompt";
import { seedTurns, patientBlurb } from "./seed";

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

const STORAGE_KEY = "care-bed-lite.session";
const SEED_FLAG_KEY = "care-bed-lite.seeded";
const PATIENT_KEY = "care-bed-lite.patient";

/**
 * 会话记忆：用 localStorage 持久化，刷新/下次打开仍保留，
 * 让体验有时间连贯性；首次打开会种入虚构病人档案与几条家人留言。
 * 不连真实后端，不写数据库。
 */
export class Session {
  private turns: DialogueTurn[] = [];

  constructor() {
    this.load();
  }

  get history(): readonly DialogueTurn[] {
    return this.turns;
  }

  get isEmpty(): boolean {
    return this.turns.length === 0;
  }

  /** 首次打开时种入预置病人档案 + 家人留言，让体验起点不是空白。 */
  private load(): void {
    this.turns = readTurns();
    const now = Date.now();
    if (!isSeeded()) {
      this.turns.push(...seedTurns(now));
      writePatient(patientBlurb());
      markSeeded();
    }
    this.turns.sort((a, b) => a.at - b.at);
  }

  /** 组装本次请求的消息：系统提示(含病人档案) + 最近若干轮 + 这次用户输入。 */
  buildMessages(userText: string): ChatMessage[] {
    const context: ChatMessage[] = [];
    const patient = readPatient();
    for (const turn of this.turns.slice(-MAX_CONTEXT_TURNS)) {
      context.push({ role: "user", content: turn.userText });
      // 回给模型的助手内容用精炼摘要，既承载上文又不喂回整段 JSON。
      const summary = turn.reply || turn.detail || turn.intent;
      context.push({ role: "assistant", content: summary });
    }
    const extra = patient ? `\n\n【当前病人档案】\n${patient}` : "";
    return [
      { role: "system", content: SYSTEM_PROMPT + extra },
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
    this.persist();
    return turn;
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.turns));
    } catch {
      /* 隐私模式下 localStorage 可能不可写，静默降级为仅内存。 */
    }
  }
}

function readTurns(): DialogueTurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DialogueTurn[]) : [];
  } catch {
    return [];
  }
}

function isSeeded(): boolean {
  try {
    return localStorage.getItem(SEED_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_FLAG_KEY, "1");
  } catch {
    /* 忽略 */
  }
}

function readPatient(): string {
  try {
    return localStorage.getItem(PATIENT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writePatient(blurb: string): void {
  try {
    localStorage.setItem(PATIENT_KEY, blurb);
  } catch {
    /* 忽略 */
  }
}