export interface HealthDto {
  status: "ok";
  service: "care-bed-agent";
}

export interface SpeechStatusDto {
  available: boolean;
  engine: "windows-system-speech";
  language: "zh-CN";
  message: string;
  request_token: string;
}

export interface SpeechRecognitionDto {
  text: string;
  confidence: number;
  engine: "windows-system-speech";
  language: "zh-CN";
}

export interface BedStateDto {
  backrest_degrees: number;
  legrest_degrees: number;
  height_cm: number;
  moving: boolean;
  last_action: string | null;
  fault: string | null;
}

export interface SystemStateDto {
  revision: number;
  bed: BedStateDto;
}

export interface ReminderDto {
  reminder_id: string;
  recipient: string;
  scheduled_for: string;
  message: string;
  created_by: string | null;
  note: string;
  status: "done" | "upcoming" | "attention";
  enabled: boolean;
}

export interface CareRecordDto {
  record_id: string;
  content: string;
  created_by: string;
  recorded_at: string;
}

export interface CareTodoDto {
  todo_id: string;
  title: string;
  due: string;
  status: string;
  created_by: string;
  created_at: string;
}

export interface NotificationDto {
  notification_id: string;
  recipient: string;
  channel: string;
  message: string;
}

export interface CallSessionDto {
  call_id: string;
  contact: string;
  priority: "normal" | "emergency";
  status: string;
  initiated_by: string;
  started_at: string;
  ended_at: string | null;
}

export interface VoiceMessageDto {
  message_id: string;
  sender: string;
  recipient: string;
  content: string;
  status: "unread" | "played";
  created_at: string;
  duration_seconds: number;
  summary: string;
}

export interface AnniversaryDto {
  anniversary_id: string;
  person: string;
  kind: string;
  month_day: string;
}

export interface DemoOverviewDto {
  care_coordination: {
    reminders: ReminderDto[];
    records: CareRecordDto[];
    todos: CareTodoDto[];
    notifications: NotificationDto[];
  };
  relationship: {
    calls: CallSessionDto[];
    voice_messages: VoiceMessageDto[];
    anniversaries: AnniversaryDto[];
  };
  daily_life: {
    notes: Array<{ note_id: string; content: string; created_by: string; created_at: string }>;
    weather: {
      city: string;
      condition: string;
      temperature_c: number;
      high_c: number;
      low_c: number;
      source: string;
    };
    media: { status: string; query: string | null };
  };
}

export interface AgentInterpretationDto {
  kind: string;
  target: string | null;
  action: string | null;
  parameters: Record<string, string | number | boolean | null>;
  confidence: number;
  utterance_type: string;
}

export interface ConversationMessageDto {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResultDto {
  event_id: string;
  path: "direct" | "rule" | "agent" | "observe";
  status: "completed" | "rejected" | "needs_clarification" | "needs_confirmation" | "failed";
  code: string;
  message: string;
  data: Record<string, unknown> & { interpretation?: AgentInterpretationDto };
}

export interface ItemResponse<T> {
  item: T;
}

export interface ReminderListDto {
  items: ReminderDto[];
}

export interface CreateReminderInput {
  actor_id: string;
  recipient: string;
  scheduled_for: string;
  message: string;
  note?: string;
  status?: ReminderDto["status"];
  enabled?: boolean;
}

export type UpdateReminderInput = Partial<
  Pick<ReminderDto, "scheduled_for" | "message" | "note" | "status" | "enabled">
>;
