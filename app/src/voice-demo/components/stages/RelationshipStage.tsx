import { Gift, MessageCircle, Pause, PhoneOff, Play, Send } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type RelationshipPresentation = Extract<
  ServicePresentation,
  { kind: "call" | "message" | "anniversary" }
>;

interface RelationshipStageProps {
  presentation: RelationshipPresentation;
  ended: boolean;
  paused: boolean;
  onEndCall: () => void;
  onTogglePlayback: () => void;
}

function initials(name: string) {
  return Array.from(name.trim())[0] ?? "家";
}

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function RelationshipStage({
  presentation,
  ended,
  paused,
  onEndCall,
  onTogglePlayback,
}: RelationshipStageProps) {
  if (presentation.kind === "call") {
    return (
      <div className={`relationship-stage relationship-stage--call${ended ? " is-ended" : ""}`}>
        <div className="contact-avatar" aria-hidden="true">{initials(presentation.contact)}</div>
        <span className="contact-role">家人联系人</span>
        <strong className="contact-name">{presentation.contact}</strong>
        <p>{ended ? "通话已结束（模拟）" : "正在呼叫"}</p>
        <div className="call-wave" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
        </div>
        <button type="button" className="danger-control" onClick={onEndCall} disabled={ended}>
          <PhoneOff size={19} />{ended ? "通话已结束" : "结束模拟通话"}
        </button>
      </div>
    );
  }

  if (presentation.kind === "message") {
    const isPlaying = presentation.state === "playing" && !paused;
    return (
      <div className="relationship-stage relationship-stage--message">
        <div className="message-sender">
          <div className="contact-avatar" aria-hidden="true">{initials(presentation.contact)}</div>
          <div><span>来自</span><strong>{presentation.contact}</strong></div>
          <MessageCircle size={22} />
        </div>
        <blockquote>{presentation.content}</blockquote>
        <div className="playback-row">
          <button type="button" aria-label={isPlaying ? "暂停模拟留言" : "继续模拟留言"} onClick={onTogglePlayback}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="playback-track"><span style={{ width: presentation.state === "playing" ? "42%" : "100%" }} /></div>
          <time>{durationLabel(presentation.duration)}</time>
        </div>
      </div>
    );
  }

  return (
    <div className="relationship-stage relationship-stage--anniversary">
      <span className="anniversary-icon"><Gift size={29} /></span>
      <span>送给</span>
      <strong>{presentation.contact}</strong>
      <blockquote>{presentation.content}</blockquote>
      <p><Send size={17} />温暖祝福已送达</p>
    </div>
  );
}
