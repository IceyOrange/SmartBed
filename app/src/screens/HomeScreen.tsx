import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  MessageCircleHeart,
  Pause,
  Phone,
  Play,
  Sparkles,
  Wifi,
} from "lucide-react";
import { useState } from "react";

import type { CareTask, RecentUpdate } from "../types";

interface HomeScreenProps {
  careTasks: CareTask[];
  recentUpdates: RecentUpdate[];
  connectionStatus: "connecting" | "online" | "offline";
  onManageCare: () => void;
  onOpenContact: () => void;
  onStartCall: () => void;
  onToast: (message: string) => void;
}

export function HomeScreen({
  careTasks,
  recentUpdates,
  connectionStatus,
  onManageCare,
  onOpenContact,
  onStartCall,
  onToast,
}: HomeScreenProps) {
  const [playing, setPlaying] = useState(false);
  const enabledTasks = careTasks.filter((task) => task.enabled);
  const completedTasks = enabledTasks.filter((task) => task.status === "done");
  const attentionTasks = enabledTasks.filter((task) => task.status === "attention");
  const nextTask = enabledTasks.find((task) => task.status === "upcoming");
  const completion = enabledTasks.length
    ? Math.round((completedTasks.length / enabledTasks.length) * 100)
    : 0;

  return (
    <main className="screen-content home-screen">
      <header className="screen-header">
        <div>
          <p className="date-line">8月31日 · 星期一</p>
          <h1>妈妈的今日关爱</h1>
        </div>
        <button
          type="button"
          className="icon-button notification-button"
          aria-label="查看通知"
          onClick={() => onToast("目前没有新的系统通知")}
        >
          <Bell size={21} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
      </header>

      <section className="person-overview" aria-label="妈妈与护理床信息">
        <div className="person-avatar" aria-hidden="true">妈</div>
        <div className="person-copy">
          <div className="person-name-row">
            <strong>妈妈</strong>
            <span className={`online-status${connectionStatus === "online" ? "" : " is-offline"}`}>
              <Wifi size={13} />
              {connectionStatus === "online" ? "Agent 在线" : connectionStatus === "connecting" ? "正在连接 Agent" : "Agent 未连接"}
            </span>
          </div>
          <p>最近一条有效记录 · 今天 14:08</p>
        </div>
        <button
          type="button"
          className="soft-icon-button"
          aria-label="打开联系页面"
          onClick={onOpenContact}
        >
          <MessageCircleHeart size={20} aria-hidden="true" />
        </button>
      </section>

      <section className="summary-card" aria-labelledby="daily-summary-title">
        <div className="section-heading compact-heading">
          <div className="heading-icon ai-icon"><Sparkles size={18} aria-hidden="true" /></div>
          <div>
            <h2 id="daily-summary-title">AI 今日摘要</h2>
            <p>根据 3 条有来源的信息整理</p>
          </div>
        </div>
        <ul className="summary-points">
          <li><Check size={15} aria-hidden="true" />午饭已吃，现场记录胃口不错</li>
          <li><Check size={15} aria-hidden="true" />下午翻身护理已完成</li>
          <li><Clock3 size={15} aria-hidden="true" />妈妈希望晚上八点与你通话</li>
        </ul>
        <button type="button" className="text-button" onClick={onOpenContact}>
          查看信息来源 <ArrowRight size={15} aria-hidden="true" />
        </button>
      </section>

      <section className="message-highlight" aria-labelledby="new-message-title">
        <div className="message-card-topline">
          <div>
            <span className="new-label">新留言</span>
            <h2 id="new-message-title">妈妈给你留了一段话</h2>
          </div>
          <span className="message-time">10:20</span>
        </div>

        <button
          type="button"
          className={`voice-player${playing ? " is-playing" : ""}`}
          aria-label={playing ? "暂停妈妈的语音留言" : "播放妈妈的语音留言"}
          onClick={() => setPlaying((value) => !value)}
        >
          <span className="voice-play-icon">
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </span>
          <span className="waveform" aria-hidden="true">
            {[8, 14, 20, 12, 24, 17, 10, 22, 15, 9, 18, 12].map((height, index) => (
              <span key={`${height}-${index}`} style={{ height }} />
            ))}
          </span>
          <strong>38″</strong>
        </button>

        <div className="inline-ai-summary">
          <Sparkles size={15} aria-hidden="true" />
          <p><strong>AI 摘要：</strong>午饭已经吃过，希望你晚上八点打电话。</p>
        </div>

        <div className="dual-actions">
          <button type="button" onClick={onOpenContact}>回复留言</button>
          <button type="button" className="primary-action" onClick={onStartCall}>
            <Phone size={16} aria-hidden="true" />现在打电话
          </button>
        </div>
      </section>

      <section className="care-card" aria-labelledby="care-title">
        <div className="section-title-row">
          <div>
            <p className="section-kicker">关爱计划</p>
            <h2 id="care-title">今日护理事项</h2>
          </div>
          <button type="button" aria-label="管理护理事项" onClick={onManageCare}>
            管理 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="care-progress-row">
          <div className="progress-ring">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle className="progress-ring-track" cx="36" cy="36" r="30" />
              <circle
                className="progress-ring-value"
                cx="36"
                cy="36"
                r="30"
                pathLength="100"
                strokeDasharray={`${completion} 100`}
              />
            </svg>
            <div><strong>{completedTasks.length}</strong><span>/{enabledTasks.length}</span></div>
          </div>
          <div className="care-progress-copy">
            <strong>今天已完成 {completedTasks.length} 项</strong>
            <p>{attentionTasks.length ? `${attentionTasks.length} 项需要关注` : "目前没有待关注事项"}</p>
            <div className="linear-progress"><span style={{ width: `${completion}%` }} /></div>
          </div>
        </div>

        {nextTask ? (
          <div className="next-care-item">
            <div className="next-care-icon"><Clock3 size={18} aria-hidden="true" /></div>
            <div>
              <span>下一项 · {nextTask.time}</span>
              <strong>{nextTask.title}</strong>
            </div>
            <span className="care-status">待进行</span>
          </div>
        ) : null}
      </section>

      <section className="updates-section" aria-labelledby="updates-title">
        <div className="section-title-row simple-row">
          <div>
            <p className="section-kicker">来自现场和系统的事实记录</p>
            <h2 id="updates-title">今日近况</h2>
          </div>
          <button type="button" onClick={() => onToast("已展示今天的全部记录")}>全部</button>
        </div>
        <div className="update-list">
          {recentUpdates.map((update) => (
            <article className="update-item" key={update.id}>
              <span className={`update-marker tone-${update.tone}`} aria-hidden="true" />
              <div className="update-content">
                <div className="update-meta"><span>{update.source}</span><time>{update.time}</time></div>
                <strong>{update.title}</strong>
                <p>{update.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="privacy-note">
        <Heart size={15} aria-hidden="true" />
        <span>仅展示有明确来源和时间的信息，不推断健康或安全状态。</span>
      </div>
    </main>
  );
}
