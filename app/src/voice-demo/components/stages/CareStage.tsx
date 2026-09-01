import { BellRing, CalendarCheck2, CheckCircle2, ClipboardCheck, PhoneCall, Siren } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type CarePresentation = Extract<
  ServicePresentation,
  { kind: "reminder" | "record" | "emergency" | "todo" }
>;

interface CareStageProps {
  presentation: CarePresentation;
  cancelled: boolean;
  onCancelEmergency: () => void;
}

export default function CareStage({ presentation, cancelled, onCancelEmergency }: CareStageProps) {
  if (presentation.kind === "reminder") {
    return (
      <div className="care-stage care-stage--reminder">
        <div className="care-time-card">
          <span className="stage-icon"><BellRing size={25} /></span>
          <time>{presentation.time}</time>
          <small>今天 · 一次提醒</small>
        </div>
        <div className="care-detail-card">
          <span>提醒内容</span>
          <strong>{presentation.content}</strong>
          <p><CheckCircle2 size={17} />床侧语音提醒</p>
        </div>
      </div>
    );
  }

  if (presentation.kind === "record") {
    return (
      <div className="care-stage care-stage--record">
        <span className="stage-icon"><ClipboardCheck size={25} /></span>
        <blockquote>{presentation.content}</blockquote>
        <div className="record-meta">
          <span>{presentation.recordedAt}</span>
          <strong><CheckCircle2 size={17} />已写入本次护理记录</strong>
        </div>
      </div>
    );
  }

  if (presentation.kind === "emergency") {
    return (
      <div className={`care-stage care-stage--emergency${cancelled ? " is-cancelled" : ""}`}>
        <span className="emergency-pulse"><Siren size={28} /></span>
        <div>
          <span>{cancelled ? "演示呼叫已取消" : "已提升为最高优先级"}</span>
          <strong>{presentation.contact}</strong>
          <p><PhoneCall size={18} />{cancelled ? "未连接真实护理系统" : "正在接通"}</p>
        </div>
        <button type="button" onClick={onCancelEmergency} disabled={cancelled}>
          {cancelled ? "已取消" : "取消模拟呼叫"}
        </button>
      </div>
    );
  }

  return (
    <div className="care-stage care-stage--todo">
      <span className="stage-icon"><CalendarCheck2 size={25} /></span>
      <div className="todo-main">
        <span>今日护理事项</span>
        <strong>{presentation.item}</strong>
      </div>
      <dl>
        <div><dt>计划时间</dt><dd>{presentation.due}</dd></div>
        <div><dt>当前状态</dt><dd>{presentation.state}</dd></div>
      </dl>
    </div>
  );
}
