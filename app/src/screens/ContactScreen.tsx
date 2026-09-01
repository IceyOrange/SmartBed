import {
  ArrowRight,
  Check,
  MessageCircleReply,
  Pause,
  Phone,
  PhoneIncoming,
  Play,
  Sparkles,
  Wifi,
} from "lucide-react";
import { useState } from "react";

import type { TimelineItem } from "../types";

interface ContactScreenProps {
  items: TimelineItem[];
  deviceOnline: boolean;
  onStartCall: () => void;
  onToast: (message: string) => void;
}

function VoiceBars({ outgoing = false }: { outgoing?: boolean }) {
  return (
    <span className={`compact-wave${outgoing ? " outgoing" : ""}`} aria-hidden="true">
      {[7, 13, 9, 18, 12, 20, 11, 16, 8].map((height, index) => (
        <span key={`${height}-${index}`} style={{ height }} />
      ))}
    </span>
  );
}

export function ContactScreen({ items, deviceOnline, onStartCall, onToast }: ContactScreenProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);

  return (
    <main className="screen-content contact-screen">
      <header className="screen-header contact-header">
        <div>
          <p className="date-line">你和妈妈的联系记录</p>
          <h1>联系妈妈</h1>
        </div>
        <span className={`connection-chip${deviceOnline ? "" : " is-offline"}`}>
          <Wifi size={13} aria-hidden="true" />{deviceOnline ? "Agent 在线" : "Agent 未连接"}
        </span>
      </header>

      <section className="contact-summary" aria-labelledby="contact-summary-title">
        <div className="summary-orb"><Sparkles size={20} aria-hidden="true" /></div>
        <div>
          <div className="summary-title-row">
            <h2 id="contact-summary-title">今日沟通摘要</h2>
            <span>AI 整理</span>
          </div>
          <p>妈妈确认午饭已吃，希望晚上八点与你通话。下午康复训练尚未确认。</p>
          <button type="button" onClick={() => onToast("摘要来源：2 条语音留言、1 次通话") }>
            查看来源 <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="timeline-section" aria-label="联系时间线">
        <div className="timeline-day"><span>今天</span></div>
        {items.map((item, index) => {
          const startsYesterday = item.time.startsWith("昨天");
          const previousWasYesterday = index > 0 && items[index - 1].time.startsWith("昨天");

          return (
            <div key={item.id}>
              {startsYesterday && !previousWasYesterday ? (
                <div className="timeline-day"><span>昨天</span></div>
              ) : null}

              {item.kind === "incoming-voice" ? (
                <article className="timeline-message incoming-message">
                  <div className="message-avatar" aria-hidden="true">妈</div>
                  <div className="timeline-message-body">
                    <div className="timeline-label-row">
                      <strong>妈妈的语音留言</strong>
                      <time>{item.time.replace("今天 ", "").replace("昨天 ", "")}</time>
                    </div>
                    <button
                      type="button"
                      className="timeline-voice incoming-voice"
                      aria-label={playingId === item.id ? "暂停语音留言" : "播放语音留言"}
                      onClick={() => setPlayingId((current) => current === item.id ? null : item.id)}
                    >
                      <span className="mini-play">
                        {playingId === item.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                      </span>
                      <VoiceBars />
                      <span>{item.duration}″</span>
                      {item.unread ? <span className="unread-dot" aria-label="未读" /> : null}
                    </button>
                    <div className="timeline-ai-summary">
                      <span><Sparkles size={13} aria-hidden="true" />AI 摘要</span>
                      <p>{item.summary}</p>
                    </div>
                    {expandedTranscript === item.id ? (
                      <p className="transcript-box">语音转文字：{item.transcript}</p>
                    ) : null}
                    <div className="message-inline-actions">
                      <button type="button" onClick={() => setExpandedTranscript((current) => current === item.id ? null : item.id)}>
                        {expandedTranscript === item.id ? "收起文字" : "查看文字"}
                      </button>
                      <button type="button" onClick={() => onToast("请按住下方按钮录制回复") }>
                        <MessageCircleReply size={14} />回复
                      </button>
                      <button type="button" onClick={onStartCall}><Phone size={14} />打电话</button>
                    </div>
                  </div>
                </article>
              ) : null}

              {item.kind === "outgoing-voice" ? (
                <article className="timeline-message outgoing-message">
                  <div className="timeline-message-body">
                    <div className="timeline-label-row">
                      <strong>我的语音留言</strong>
                      <time>{item.time.replace("今天 ", "").replace("昨天 ", "")}</time>
                    </div>
                    <button
                      type="button"
                      className="timeline-voice outgoing-voice"
                      aria-label={playingId === item.id ? "暂停我的语音留言" : "播放我的语音留言"}
                      onClick={() => setPlayingId((current) => current === item.id ? null : item.id)}
                    >
                      <span className="mini-play">
                        {playingId === item.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                      </span>
                      <VoiceBars outgoing />
                      <span>{item.duration}″</span>
                    </button>
                    <div className="delivery-status"><Check size={13} />{item.delivery}</div>
                    {item.summary ? <p className="outgoing-summary">“{item.summary}”</p> : null}
                  </div>
                  <div className="message-avatar me-avatar" aria-hidden="true">我</div>
                </article>
              ) : null}

              {item.kind === "call" ? (
                <article className={`call-record${item.missed ? " is-missed" : ""}`}>
                  <div className="call-record-icon"><PhoneIncoming size={18} aria-hidden="true" /></div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail} · {item.time.replace("今天 ", "").replace("昨天 ", "")}</p>
                  </div>
                  <button type="button" onClick={onStartCall}>再拨</button>
                </article>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
