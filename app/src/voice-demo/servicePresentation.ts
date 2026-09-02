import type { DemoTurn, VoiceDomain } from "./model";

interface PresentationBase {
  domain: VoiceDomain;
  title: string;
  description: string;
  badge: string;
}

export type ServicePresentation =
  | (PresentationBase & {
      kind: "bed";
      posture: string;
      target: string;
      targetValue: string;
      backrest: number;
      legrest: number;
      height: number;
      stopped: boolean;
    })
  | (PresentationBase & { kind: "reminder"; time: string; content: string })
  | (PresentationBase & { kind: "record"; content: string; recordedAt: string })
  | (PresentationBase & { kind: "emergency"; contact: string })
  | (PresentationBase & { kind: "todo"; item: string; due: string; state: string })
  | (PresentationBase & { kind: "call"; contact: string; state: string })
  | (PresentationBase & {
      kind: "message";
      contact: string;
      content: string;
      duration: number;
      state: "playing" | "sent" | "empty";
    })
  | (PresentationBase & { kind: "anniversary"; contact: string; content: string })
  | (PresentationBase & { kind: "agenda"; items: Array<{ title: string; time: string }> })
  | (PresentationBase & {
      kind: "weather";
      city: string;
      condition: string;
      temperature: number;
      high: number;
      low: number;
    })
  | (PresentationBase & { kind: "note"; content: string; recordedAt: string })
  | (PresentationBase & { kind: "companion"; reply: string })
  | (PresentationBase & { kind: "media"; query: string; state: string })
  | (PresentationBase & { kind: "confirmation"; action: string })
  | (PresentationBase & {
      kind: "feedback";
      tone: "neutral" | "safe" | "danger";
      detail?: string;
    });

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bedPresentation(turn: DemoTurn): ServicePresentation {
  const bed = record(turn.data.bed);
  const target = turn.match.slots.bodyPart ?? "床体姿态";
  const values = {
    backrest: number(bed.backrest_degrees, 0),
    legrest: number(bed.legrest_degrees, 0),
    height: number(bed.height_cm, 52),
  };
  const targetValue = target === "靠背"
    ? `${values.backrest}°`
    : target === "腿板" ? `${values.legrest}°` : `${values.height} cm`;
  const posture = turn.match.slots.scene
    ? `${turn.match.slots.scene}姿势`
    : turn.code === "stopped" ? "保持当前位置" : `${target}${turn.match.slots.direction ?? "调节"}`;
  return {
    kind: "bed",
    domain: "body",
    title: turn.code === "stopped" ? "床体已安全停止" : `${posture}已完成`,
    description: turn.response,
    badge: turn.code === "stopped" ? "已停止" : "已完成",
    posture,
    target,
    targetValue,
    backrest: values.backrest,
    legrest: values.legrest,
    height: values.height,
    stopped: turn.code === "stopped",
  };
}

function agendaItems(data: Record<string, unknown>) {
  const agenda = record(data.agenda);
  const items: Array<{ title: string; time: string }> = [];
  for (const reminder of Array.isArray(agenda.reminders) ? agenda.reminders : []) {
    const item = record(reminder);
    items.push({
      title: text(item.message, "护理提醒"),
      time: text(item.scheduled_for, "今天"),
    });
  }
  for (const todo of Array.isArray(agenda.todos) ? agenda.todos : []) {
    const item = record(todo);
    items.push({ title: text(item.title, "护理事项"), time: text(item.due, "今天") });
  }
  for (const anniversary of Array.isArray(agenda.anniversaries) ? agenda.anniversaries : []) {
    const item = record(anniversary);
    items.push({ title: `${text(item.person, "家人")}的纪念日`, time: "今天" });
  }
  return items;
}

export function toServicePresentation(turn: DemoTurn): ServicePresentation {
  const base = {
    domain: turn.match.domain,
    description: turn.response,
  };

  if (turn.status === "awaiting-confirmation") {
    return {
      ...base,
      kind: "confirmation",
      title: "请确认这次操作",
      badge: "等待确认",
      action: turn.match.label,
    };
  }
  if (turn.status === "clarifying" || turn.status === "restricted") {
    return {
      ...base,
      kind: "feedback",
      title: turn.status === "restricted" ? "这项操作没有执行" : "还需要您再说明一下",
      badge: turn.status === "restricted" ? "安全保护" : "等待补充",
      tone: turn.status === "restricted" ? "safe" : "neutral",
    };
  }
  if (turn.code === "action_cancelled") {
    return {
      ...base,
      kind: "feedback",
      title: "操作已取消",
      badge: "未执行",
      tone: "neutral",
      detail: "已取消，床体没有执行调整",
    };
  }
  if (turn.match.domain === "body" || ["completed", "stopped"].includes(turn.code)) {
    return bedPresentation(turn);
  }

  if (turn.code === "reminder_created") {
    const reminder = record(turn.data.reminder);
    return {
      ...base,
      kind: "reminder",
      title: "提醒已经安排",
      badge: "已保存",
      time: text(reminder.scheduled_for, turn.match.slots.time ?? "稍后"),
      content: text(reminder.message, turn.match.slots.content ?? "护理提醒"),
    };
  }
  if (turn.code === "care_record_created") {
    const careRecord = record(turn.data.record);
    return {
      ...base,
      kind: "record",
      title: "护理记录已保存",
      badge: "已记录",
      content: text(careRecord.content, turn.match.slots.content ?? "护理记录"),
      recordedAt: text(careRecord.recorded_at, "刚刚"),
    };
  }
  if (turn.code === "emergency_call_started") {
    const call = record(turn.data.call);
    return {
      ...base,
      kind: "emergency",
      title: "正在发出紧急求助",
      badge: "紧急呼叫",
      contact: text(call.contact, turn.match.slots.contact ?? "护理人员"),
    };
  }
  if (turn.code === "care_todo_created") {
    const todo = record(turn.data.todo);
    return {
      ...base,
      kind: "todo",
      title: "护理事项已加入今天",
      badge: "已添加",
      item: text(todo.title, turn.match.slots.content ?? "护理事项"),
      due: text(todo.due, "今天"),
      state: text(todo.status, "待完成"),
    };
  }
  if (turn.code === "call_started") {
    const call = record(turn.data.call);
    return {
      ...base,
      kind: "call",
      title: `正在联系${text(call.contact, turn.match.slots.contact ?? "家人")}`,
      badge: "正在呼叫",
      contact: text(call.contact, turn.match.slots.contact ?? "家人"),
      state: text(call.status, "calling"),
    };
  }
  if (turn.code.startsWith("voice_message_")) {
    const message = record(turn.data.voice_message);
    const state = turn.code === "voice_message_playing"
      ? "playing"
      : turn.code === "voice_message_sent" ? "sent" : "empty";
    return {
      ...base,
      kind: "message",
      title: state === "playing" ? "正在播放家人留言" : state === "sent" ? "留言已经送出" : "暂时没有新留言",
      badge: state === "playing" ? "播放中" : state === "sent" ? "已送达" : "没有留言",
      contact: text(state === "sent" ? message.recipient : message.sender, turn.match.slots.contact ?? "家人"),
      content: text(message.content, turn.response),
      duration: number(message.duration_seconds, 0),
      state,
    };
  }
  if (turn.code.startsWith("anniversar")) {
    const message = record(turn.data.voice_message);
    const anniversaries = Array.isArray(turn.data.anniversaries) ? turn.data.anniversaries : [];
    const first = record(anniversaries[0]);
    const contact = text(message.recipient ?? first.person, turn.match.slots.contact ?? "家人");
    return {
      ...base,
      kind: "anniversary",
      title: turn.code === "anniversary_greeting_sent" ? "祝福已经送出" : "今天的特别日子",
      badge: turn.code === "anniversary_greeting_sent" ? "已送达" : "纪念日",
      contact,
      content: text(message.content, turn.response),
    };
  }
  if (turn.code === "today_agenda_listed") {
    return {
      ...base,
      kind: "agenda",
      title: "今天的事项",
      badge: "今日安排",
      items: agendaItems(turn.data),
    };
  }
  if (turn.code === "weather_reported") {
    const weather = record(turn.data.weather);
    return {
      ...base,
      kind: "weather",
      title: `${text(weather.city, "当地")}今日${text(weather.condition, "天气平稳")}`,
      badge: "今日天气",
      city: text(weather.city, "当地"),
      condition: text(weather.condition, "天气平稳"),
      temperature: number(weather.temperature_c, 24),
      high: number(weather.high_c, 28),
      low: number(weather.low_c, 18),
    };
  }
  if (turn.code === "note_created") {
    const note = record(turn.data.note);
    return {
      ...base,
      kind: "note",
      title: "已经帮您记下",
      badge: "本次对话",
      content: text(note.content, turn.match.slots.content ?? turn.response),
      recordedAt: text(note.created_at, "刚刚"),
    };
  }
  if (turn.code === "companion_replied") {
    return {
      ...base,
      kind: "companion",
      title: "我在这里陪您",
      badge: "陪伴交流",
      reply: turn.response,
    };
  }
  if (turn.code === "media_playing") {
    const playback = record(turn.data.playback);
    return {
      ...base,
      kind: "media",
      title: `正在播放${text(playback.query, turn.match.slots.content ?? "点播内容")}`,
      badge: "播放中",
      query: text(playback.query, turn.match.slots.content ?? "点播内容"),
      state: text(playback.status, "playing"),
    };
  }

  return {
    ...base,
    kind: "feedback",
    title: turn.match.label,
    badge: turn.status === "information" ? "已经答复" : "已经处理",
    tone: "neutral",
  };
}
