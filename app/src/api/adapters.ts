import type { CareTask, RecentUpdate, TimelineItem } from "../types";
import type {
  DemoTurn,
  IntentId,
  IntentMatch,
  IntentSlots,
  TurnStatus,
  VoiceDomain,
} from "../voice-demo/model";
import type {
  AgentInterpretationDto,
  AgentResultDto,
  DemoOverviewDto,
  ReminderDto,
} from "./types";

const DOMAIN_LABELS: Record<VoiceDomain, string> = {
  body: "身体自主",
  care: "照护协同",
  relationship: "关系链接",
  daily: "日常生活",
  unknown: "需要澄清",
};

const INTENT_LABELS: Record<string, string> = {
  bed_adjust: "床体调节",
  bed_scene: "情景姿态",
  stop: "立即停止",
  reminder: "护理提醒",
  care_record: "护理记录",
  care_todo: "护理待办",
  emergency_call: "紧急呼叫",
  live_call: "实时通话",
  voice_message: "语音留言",
  anniversary: "纪念日关怀",
  today_agenda: "今日事项",
  weather: "天气查询",
  note: "生活记事",
  companion: "陪伴对话",
  media: "内容点播",
  information: "日期时间",
  unknown: "需要进一步说明",
};

function timePart(value: string) {
  const match = value.match(/(?:T|\s)(\d{1,2}:\d{2})/);
  return match?.[1] ?? value;
}

function timelineTime(value: string) {
  return `今天 ${timePart(value)}`;
}

export function toCareTasks(reminders: ReminderDto[]): CareTask[] {
  return reminders.map((reminder) => ({
    id: reminder.reminder_id,
    title: reminder.message,
    time: timePart(reminder.scheduled_for),
    note: reminder.note,
    status: reminder.status,
    enabled: reminder.enabled,
  }));
}

export function toTimelineItems(
  relationship: DemoOverviewDto["relationship"],
): TimelineItem[] {
  const entries: Array<{ timestamp: string; item: TimelineItem }> = [];
  for (const message of relationship.voice_messages) {
    const incoming = message.sender === "elder-1";
    entries.push({
      timestamp: message.created_at,
      item: incoming
        ? {
            id: message.message_id,
            kind: "incoming-voice",
            sender: "妈妈",
            time: timelineTime(message.created_at),
            duration: message.duration_seconds,
            transcript: message.content,
            summary: message.summary || message.content,
            unread: message.status === "unread",
          }
        : {
            id: message.message_id,
            kind: "outgoing-voice",
            sender: "我",
            time: timelineTime(message.created_at),
            duration: message.duration_seconds,
            delivery: message.status === "played" ? "妈妈已播放" : "已送达",
            summary: message.summary || message.content,
          },
    });
  }

  for (const call of relationship.calls) {
    const duration = call.ended_at
      ? Math.max(1, Math.round((Date.parse(call.ended_at) - Date.parse(call.started_at)) / 60_000))
      : 0;
    entries.push({
      timestamp: call.started_at,
      item: {
        id: call.call_id,
        kind: "call",
        time: timelineTime(call.started_at),
        title: duration ? `与${call.contact}通话 ${duration} 分钟` : `正在联系${call.contact}`,
        detail: `${call.initiated_by === "family-1" ? "由家属端发起" : "由床侧发起"} · ${call.status === "ended" ? "正常结束" : "呼叫中"}`,
      },
    });
  }

  return entries
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .map(({ item }) => item);
}

export function toRecentUpdates(
  care: DemoOverviewDto["care_coordination"],
): RecentUpdate[] {
  return care.records
    .slice()
    .sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at))
    .map((record) => {
      const [title, ...detailParts] = record.content.split("，");
      const caregiver = record.created_by === "caregiver-1";
      return {
        id: record.record_id,
        source: caregiver ? "王阿姨记录" : record.created_by === "elder-1" ? "妈妈语音" : "护理床系统",
        time: timePart(record.recorded_at),
        title,
        detail: detailParts.join("，") || record.content,
        tone: caregiver ? "green" : record.created_by === "elder-1" ? "orange" : "blue",
      };
    });
}

function domainFor(kind: string): VoiceDomain {
  if (kind.startsWith("bed_") || kind === "stop") return "body";
  if (["reminder", "care_record", "care_todo", "emergency_call"].includes(kind)) return "care";
  if (["live_call", "voice_message", "anniversary"].includes(kind)) return "relationship";
  if (["today_agenda", "weather", "note", "companion", "media", "information"].includes(kind)) return "daily";
  return "unknown";
}

function intentIdFor(interpretation?: AgentInterpretationDto): IntentId {
  if (!interpretation) return "unknown";
  const { kind, target, action, parameters } = interpretation;
  if (kind === "stop") return "bed.stop";
  if (kind === "bed_scene") return parameters.scene === "sleep" ? "bed.reset" : "bed.scene";
  if (kind === "bed_adjust") {
    if (target === "backrest") return "bed.back.adjust";
    if (target === "legrest") return "bed.legs.adjust";
    return "bed.height.adjust";
  }
  if (kind === "reminder") return "care.reminder.create";
  if (kind === "care_record") return action === "query" ? "care.record.query" : "care.record.create";
  if (kind === "care_todo") return action === "query" ? "care.todo.query" : "care.todo.update";
  if (kind === "emergency_call") return "care.emergency";
  if (kind === "live_call") return "relation.call.start";
  if (kind === "voice_message") return action === "play" ? "relation.message.play" : "relation.message.create";
  if (kind === "anniversary") return action === "send_greeting" ? "relation.anniversary.greet" : "relation.anniversary.query";
  if (kind === "today_agenda") return "daily.schedule.query";
  if (kind === "weather") return "daily.weather.query";
  if (kind === "note") return action === "query" ? "daily.note.query" : "daily.note.create";
  if (kind === "companion") return "daily.chat";
  if (kind === "media") return "daily.media.play";
  return "unknown";
}

function labelFor(interpretation?: AgentInterpretationDto) {
  if (!interpretation) return INTENT_LABELS.unknown;
  if (interpretation.kind === "bed_adjust") {
    if (interpretation.target === "backrest") return "靠背调节";
    if (interpretation.target === "legrest") return "腿板调节";
    return "整床升降";
  }
  if (interpretation.kind === "bed_scene" && interpretation.parameters.scene === "sleep") {
    return "床体复位";
  }
  return INTENT_LABELS[interpretation.kind] ?? INTENT_LABELS.unknown;
}

function slotsFor(interpretation?: AgentInterpretationDto): IntentSlots {
  if (!interpretation) return {};
  const slots: IntentSlots = {};
  if (interpretation.target === "backrest") slots.bodyPart = "靠背";
  else if (interpretation.target === "legrest") slots.bodyPart = "腿板";
  else if (interpretation.target === "bed_height") slots.bodyPart = "整床";
  else if (interpretation.target) slots.contact = interpretation.target;
  if (interpretation.action === "up") slots.direction = "升高";
  if (interpretation.action === "down") slots.direction = "降低";
  const amount = interpretation.parameters.amount;
  if (typeof amount === "number") slots.amount = amount >= 10 ? "大幅" : "小幅";
  const scene = interpretation.parameters.scene;
  if (scene === "meal") slots.scene = "吃饭";
  if (scene === "television") slots.scene = "看电视";
  if (scene === "sleep") slots.scene = "睡眠";
  const content = interpretation.parameters.content ?? interpretation.parameters.message ?? interpretation.parameters.query;
  if (typeof content === "string") slots.content = content;
  const scheduledFor = interpretation.parameters.scheduled_for;
  if (typeof scheduledFor === "string") slots.time = scheduledFor;
  return slots;
}

function turnStatus(result: AgentResultDto): TurnStatus {
  if (result.status === "needs_confirmation") return "awaiting-confirmation";
  if (result.status === "needs_clarification") return "clarifying";
  if (result.status === "rejected" || result.status === "failed") return "restricted";
  if (/(listed|reported|replied|playing|date_time)/.test(result.code)) return "information";
  return "simulated-complete";
}

export function toDemoTurn(userText: string, result: AgentResultDto): DemoTurn {
  const interpretation = result.data.interpretation;
  const domain = domainFor(interpretation?.kind ?? "unknown");
  const match: IntentMatch = {
    rawText: userText,
    normalizedText: userText.trim(),
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    intent: intentIdFor(interpretation),
    label: labelFor(interpretation),
    confidence: !interpretation || interpretation.confidence < 0.5
      ? "low"
      : interpretation.confidence < 0.8 ? "medium" : "high",
    slots: slotsFor(interpretation),
    safety: result.status === "needs_confirmation"
      ? "需要确认"
      : result.status === "rejected" || result.status === "failed"
        ? "受限"
        : result.code === "stopped" ? "立即响应" : "标准",
    route: result.path === "agent" ? "Agent 编排" : result.path === "rule" ? "业务技能" : "本地规则",
  };
  return {
    id: result.event_id,
    code: result.code,
    data: result.data,
    userText,
    response: result.message,
    status: turnStatus(result),
    match,
  };
}
