export type VoiceDomain = "body" | "care" | "relationship" | "daily" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type TurnStatus =
  | "clarifying"
  | "awaiting-confirmation"
  | "simulated-complete"
  | "information"
  | "restricted";

export type IntentId =
  | "bed.stop"
  | "bed.back.adjust"
  | "bed.legs.adjust"
  | "bed.height.adjust"
  | "bed.scene"
  | "bed.reset"
  | "care.reminder.create"
  | "care.record.create"
  | "care.record.query"
  | "care.emergency"
  | "care.todo.query"
  | "care.todo.update"
  | "relation.call.start"
  | "relation.call.answer"
  | "relation.call.end"
  | "relation.message.play"
  | "relation.message.create"
  | "relation.anniversary.query"
  | "relation.anniversary.greet"
  | "daily.schedule.query"
  | "daily.weather.query"
  | "daily.note.create"
  | "daily.note.query"
  | "daily.chat"
  | "daily.media.play"
  | "daily.media.control"
  | "medical.restricted"
  | "conversation.confirm"
  | "conversation.cancel"
  | "unknown";

export interface IntentSlots {
  bodyPart?: "靠背" | "腿板" | "整床";
  direction?: "升高" | "降低" | "放平" | "停止";
  amount?: "小幅" | "大幅";
  angle?: number;
  scene?: "吃饭" | "看电视" | "睡眠";
  contact?: string;
  time?: string;
  item?: string;
  content?: string;
  action?: string;
}

export interface IntentMatch {
  rawText: string;
  normalizedText: string;
  domain: VoiceDomain;
  domainLabel: string;
  intent: IntentId;
  label: string;
  confidence: Confidence;
  slots: IntentSlots;
  safety: "立即响应" | "需要确认" | "标准" | "受限";
  route: "本地规则" | "业务技能" | "对话能力" | "Agent 编排";
}

export interface DemoTurn {
  id: string;
  code: string;
  data: Record<string, unknown>;
  userText: string;
  response: string;
  status: TurnStatus;
  match: IntentMatch;
}

export interface DemoSessionState {
  turns: DemoTurn[];
  activeCall: boolean;
  activeMedia: boolean;
}

export interface VoiceDomainDefinition {
  id: Exclude<VoiceDomain, "unknown">;
  title: string;
  subtitle: string;
  capabilities: string[];
  examples: string[];
}

export const VOICE_DOMAINS: VoiceDomainDefinition[] = [
  {
    id: "body",
    title: "调节身体姿势",
    subtitle: "更舒适地坐起、休息和活动",
    capabilities: ["靠背调节", "腿板调节", "整床升降", "情景姿态", "复位与停止"],
    examples: ["把靠背升高一点", "调到吃饭姿势", "调到睡眠姿势", "马上停下"],
  },
  {
    id: "care",
    title: "安排日常照护",
    subtitle: "提醒、记录和需要帮助时的联系",
    capabilities: ["护理提醒", "护理记录", "应急呼叫", "护理 Todo"],
    examples: ["十分钟后提醒我喝水", "记一下我吃过药了", "今天还有什么护理事项", "救命，快叫护理员"],
  },
  {
    id: "relationship",
    title: "和家人保持联系",
    subtitle: "通话、留言与重要日子的祝福",
    capabilities: ["实时通话", "非实时留言", "纪念日祝福"],
    examples: ["给女儿打电话", "听听女儿的留言", "给孙女送生日祝福"],
  },
  {
    id: "daily",
    title: "处理日常小事",
    subtitle: "日程、天气、记事、陪聊和点播",
    capabilities: ["今日事项", "天气", "帮助记事", "轻量陪聊", "点播"],
    examples: ["今天有什么安排", "今天天气怎么样", "记一下眼镜在抽屉里", "播放一段京剧"],
  },
];

export function createDemoSession(): DemoSessionState {
  return { turns: [], activeCall: false, activeMedia: false };
}
