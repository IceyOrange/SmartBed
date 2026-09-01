import { CalendarDays, CheckCircle2, CloudSun, Headphones, NotebookPen, Pause, Play, Quote } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type DailyPresentation = Extract<
  ServicePresentation,
  { kind: "agenda" | "weather" | "note" | "companion" | "media" }
>;

interface DailyLifeStageProps {
  presentation: DailyPresentation;
  paused: boolean;
  onTogglePlayback: () => void;
}

export default function DailyLifeStage({ presentation, paused, onTogglePlayback }: DailyLifeStageProps) {
  if (presentation.kind === "agenda") {
    return (
      <div className="daily-stage daily-stage--agenda">
        <span className="stage-icon"><CalendarDays size={25} /></span>
        <ol className="agenda-timeline">
          {presentation.items.length ? presentation.items.map((item, index) => (
            <li key={`${item.time}-${item.title}`} className={index === 0 ? "is-next" : ""}>
              <time>{item.time}</time>
              <span />
              <strong>{item.title}</strong>
            </li>
          )) : <li className="is-empty">今天暂时没有其他安排</li>}
        </ol>
      </div>
    );
  }

  if (presentation.kind === "weather") {
    return (
      <div className="daily-stage daily-stage--weather">
        <div className="weather-main">
          <span className="weather-icon"><CloudSun size={42} /></span>
          <div><strong>{presentation.temperature}°</strong><span>{presentation.city} · {presentation.condition}</span></div>
        </div>
        <p>最高 {presentation.high}° · 最低 {presentation.low}°</p>
        <div className="weather-advice"><CheckCircle2 size={18} />适合适度开窗通风</div>
      </div>
    );
  }

  if (presentation.kind === "note") {
    return (
      <div className="daily-stage daily-stage--note">
        <span className="stage-icon"><NotebookPen size={25} /></span>
        <blockquote>{presentation.content}</blockquote>
        <div className="note-meta"><span>{presentation.recordedAt}</span><strong>仅保留在本次页面</strong></div>
      </div>
    );
  }

  if (presentation.kind === "companion") {
    return (
      <div className="daily-stage daily-stage--companion">
        <span className="quote-mark"><Quote size={28} /></span>
        <blockquote>{presentation.reply}</blockquote>
        <p>您可以接着说</p>
      </div>
    );
  }

  const isPlaying = presentation.state === "playing" && !paused;
  return (
    <div className="daily-stage daily-stage--media">
      <div className="media-cover" aria-hidden="true"><Headphones size={34} /></div>
      <div className="media-copy">
        <span>演示音频</span>
        <strong>{presentation.query}</strong>
        <p>{isPlaying ? "正在播放" : "已暂停"}</p>
        <div className="playback-row">
          <button type="button" aria-label={isPlaying ? "暂停模拟播放" : "继续模拟播放"} onClick={onTogglePlayback}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="playback-track"><span style={{ width: "36%" }} /></div>
          <time>01:24</time>
        </div>
      </div>
    </div>
  );
}
