export type CareTaskStatus = "done" | "upcoming" | "attention";

export interface CareTask {
  id: string;
  title: string;
  time: string;
  note: string;
  status: CareTaskStatus;
  enabled: boolean;
}

export interface RecentUpdate {
  id: string;
  source: string;
  time: string;
  title: string;
  detail: string;
  tone: "green" | "orange" | "blue";
}

export type TimelineItem =
  | {
      id: string;
      kind: "incoming-voice";
      sender: string;
      time: string;
      duration: number;
      transcript: string;
      summary: string;
      unread?: boolean;
    }
  | {
      id: string;
      kind: "outgoing-voice";
      sender: string;
      time: string;
      duration: number;
      delivery: "发送中" | "已送达" | "妈妈已播放" | "等待设备上线";
      summary?: string;
    }
  | {
      id: string;
      kind: "call";
      time: string;
      title: string;
      detail: string;
      missed?: boolean;
    };
