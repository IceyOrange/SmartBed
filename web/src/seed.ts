import type { DialogueTurn } from "./session";

/**
 * 预置的「虚构病人 + 家人」对话：第一次打开时种入会话，
 * 之后随对话一起持久化到 localStorage，让体验有时间连贯性与数据累积感。
 * 内容均为虚构，是一问一答的自然交流，不指代任何真实个人，也不驱动真实设备。
 */

/** 虚构病人档案：展示「定位」与基础信息。 */
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

/**
 * 预置的一问一答轮次（按时间从早到晚）。
 * 每一条都还原成「老人或家人先开口，护理床作出回复」的自然对话，
 * 让初次体验就有真实的时间连贯感，而不是孤零零的留言文本。
 */
export function seedTurns(now: number): DialogueTurn[] {
  const h = 60 * 60 * 1000;
  const d = 24 * h;

  const raw: Array<{
    userText: string;
    reply: string;
    intent: string;
    detail: string;
    at: number;
  }> = [
    {
      userText: "儿子不是说要过来吗，他到底啥时候来呀？",
      reply: "陈磊说呀，他明天下午三点过来看您，还给您带了您爱吃的桃酥。",
      intent: "语音留言",
      detail: "回顾儿子的留言",
      at: now - 2 * d - 5 * h,
    },
    {
      userText: "天冷了，小静说要来看看我，她还说啥了没？",
      reply: "陈静说周末带孩子来看您，还特意嘱咐护工，天凉了多给您披件衣服。",
      intent: "语音留言",
      detail: "回顾女儿的留言",
      at: now - 1 * d - 3 * h,
    },
    {
      userText: "小满那孩子最近忙啥呢，都没个信儿。",
      reply: "陈小满刚留了话，说这次考试考了全班第三，让您回去给她包饺子呢。",
      intent: "语音留言",
      detail: "回顾孙女的留言",
      at: now - 6 * h,
    },
  ];

  return raw.map((r, i) => ({
    id: `seed-${i}`,
    userText: r.userText,
    module: "relationship" as const,
    intent: r.intent,
    detail: r.detail,
    reply: r.reply,
    confidence: 0.9,
    at: r.at,
  }));
}

/** 病人档案展示位：顶栏悬停/状态栏可用，先附在系统提示语义里。 */
export function patientBlurb(): string {
  return `${SEED_PATIENT.name}（${SEED_PATIENT.age} 岁），${SEED_PATIENT.ward} ${SEED_PATIENT.bedNo} 床；${SEED_PATIENT.notes.join("；")}。`;
}