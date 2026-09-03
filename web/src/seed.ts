import type { DialogueTurn } from "./session";

/**
 * 预置的“虚构病人 + 家人留言”数据：第一次打开时种入会话，
 * 之后随对话一起持久化到 localStorage，让体验时有时间连贯性与数据累积感。
 * 均为虚构演示内容，不指代任何真实个人，也不驱动真实设备。
 */

/** 虚构病人档案：展示“定位”与基础信息。 */
export interface PatientProfile {
  name: string;
  age: number;
  bedNo: string;
  ward: string;
  notes: string[];
}

export const SEED_PATIENT: PatientProfile = {
  name: "陈桂芳",
  age: 78,
  bedNo: "3-12",
  ward: "颐养楼 · 302 病房",
  notes: [
    "髋部术后恢复中，需定时翻身",
    "每晚 20:30 服用降压药",
    "家属已开通亲情连线",
  ],
};

/** 预置的家人留言（按时间从早到晚）。 */
export interface SeedMessage {
  from: string;
  text: string;
  at: number; // 相对 now 的毫秒偏移（负数表示过去）
}

/** 家人类别：用于“上次我留言了什么”这类追问的自然回答素材。 */
export function seedMessages(now: number): SeedMessage[] {
  const h = 60 * 60 * 1000;
  const d = 24 * h;
  return [
    { from: "儿子 · 陈磊", text: "妈，我明天下午三点过来看您，给您带了您爱吃的桃酥。", at: now - 2 * d - 5 * h },
    { from: "女儿 · 陈静", text: "妈，周末我带孩子来看您，天气转凉了，让护工多给您披件衣服。", at: now - 1 * d - 3 * h },
    { from: "孙女 · 陈小满", text: "奶奶，我考试考了全班第三，等您回来给我包饺子呀！", at: now - 6 * h },
  ];
}

/** 把预置家人留言转成会话里的“关系”轮次，作为历史种入。 */
export function seedTurns(now: number): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let i = 0;
  for (const m of seedMessages(now)) {
    turns.push({
      id: `seed-msg-${i}`,
      userText: `预置留言 · ${m.from}`,
      module: "relationship",
      intent: "语音留言",
      detail: `${m.from} 给您留了言`,
      reply: `${m.from}说：${m.text}`,
      confidence: 0.9,
      at: m.at,
    });
    i += 1;
  }
  return turns;
}

/** 病人档案展示位：顶栏悬停/状态栏可用，先附在系统提示语义里。 */
export function patientBlurb(): string {
  return `${SEED_PATIENT.name}（${SEED_PATIENT.age} 岁），${SEED_PATIENT.ward} ${SEED_PATIENT.bedNo} 床；${SEED_PATIENT.notes.join("；")}。`;
}