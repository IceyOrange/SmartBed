import {
  BedDouble,
  CalendarClock,
  HeartPulse,
  LoaderCircle,
  MessageCircle,
  PhoneCall,
  SunMedium,
  UsersRound,
} from "lucide-react";
import { useState } from "react";

import type { DemoOverviewDto, SystemStateDto } from "../../api/types";

interface IdleOverviewProps {
  loading?: boolean;
  overview: DemoOverviewDto | null;
  systemState: SystemStateDto | null;
}

function firstEnabledReminder(overview: DemoOverviewDto | null) {
  return overview?.care_coordination.reminders.find((reminder) => reminder.enabled)
    ?? overview?.care_coordination.reminders[0];
}

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date()).replace("星期", " · 星期");
}

export default function IdleOverview({ loading = false, overview, systemState }: IdleOverviewProps) {
  const [restReminderSet, setRestReminderSet] = useState(false);

  if (loading) {
    return (
      <section className="idle-overview is-loading" aria-busy="true" aria-labelledby="idle-overview-title">
        <div className="today-heading">
          <div>
            <span className="section-kicker">今日床侧</span>
            <h2 id="idle-overview-title">正在准备今天的信息</h2>
            <p>床体状态与照护安排正在同步。</p>
          </div>
          <span className="overview-sync" role="status" aria-label="正在同步床侧状态">
            <LoaderCircle size={16} />正在同步
          </span>
        </div>
        <div className="overview-loading-block" aria-hidden="true"><span /><span /><span /></div>
        <div className="overview-loading-list" aria-hidden="true"><i /><i /><i /></div>
      </section>
    );
  }

  const reminder = firstEnabledReminder(overview);
  const message = overview?.relationship.voice_messages.find((item) => item.status === "unread")
    ?? overview?.relationship.voice_messages[0];
  const weather = overview?.daily_life.weather;
  const bed = systemState?.bed;
  const pendingCare = overview?.care_coordination.todos.filter((item) => !["done", "completed", "已完成"].includes(item.status)).length ?? 0;
  const unreadMessages = overview?.relationship.voice_messages.filter((item) => item.status === "unread").length ?? 0;
  const posture = bed?.moving
    ? "正在调节"
    : (bed?.backrest_degrees ?? 0) >= 10 ? "舒适坐姿" : "舒适平躺";
  const safetyText = bed?.fault
    ? "床体需要检查"
    : bed?.moving ? "床体正在平稳调节" : "床体静止 · 安全状态正常";

  return (
    <section className="idle-overview" aria-labelledby="idle-overview-title">
      <div className="today-heading">
        <div>
          <span className="section-kicker">今日床侧</span>
          <h2 id="idle-overview-title">一切都安排好了</h2>
          <p>重要状态集中在这里，需要时直接开口即可。</p>
        </div>
        <div className="today-date"><strong>{todayLabel()}</strong><span>床侧日程</span></div>
      </div>

      <div className="bedside-overview-grid">
        <div className="bedside-posture">
          <div>
            <div className="posture-title">
              <span className="posture-icon"><BedDouble size={24} /></span>
              <div><span>当前床体</span><strong>{posture}</strong></div>
            </div>
            <dl className="posture-metrics">
              <div><dt>靠背</dt><dd>{bed?.backrest_degrees ?? "--"}°</dd></div>
              <div><dt>腿托</dt><dd>{bed?.legrest_degrees ?? "--"}°</dd></div>
              <div><dt>床高</dt><dd>{bed?.height_cm ?? "--"}<small>cm</small></dd></div>
            </dl>
          </div>

          <div className="rest-suggestion">
            <div><span>午休前建议</span><strong>调到睡眠姿势</strong></div>
            <button type="button" onClick={() => setRestReminderSet(true)} disabled={restReminderSet}>
              {restReminderSet ? "已记下" : "稍后提醒"}
            </button>
          </div>
        </div>

        <div className="bedside-day-list">
          <article>
            <span className="day-icon"><CalendarClock size={20} /></span>
            <div><span>下一项照护</span><strong>{reminder ? `${reminder.scheduled_for} · ${reminder.message}` : "今天暂无待办"}</strong></div>
            <small>{reminder ? "按时提醒" : "已安排"}</small>
          </article>
          <article>
            <span className="day-icon is-family"><MessageCircle size={20} /></span>
            <div><span>家人联系</span><strong>{message ? `${message.sender}留了一条语音` : "暂无新留言"}</strong></div>
            <small>{message?.duration_seconds ? `${message.duration_seconds} 秒` : "随时可联系"}</small>
          </article>
          <article>
            <span className="day-icon is-weather"><SunMedium size={20} /></span>
            <div><span>{weather ? `今天${weather.city}` : "今日天气"}</span><strong>{weather ? `${weather.condition}，最高 ${weather.high_c}℃` : "天气正在更新"}</strong></div>
            <small>适合通风</small>
          </article>
        </div>
      </div>

      <div className="bedside-status-dock">
        <div><BedDouble size={20} /><span><small>身体舒适</small><strong>{safetyText}</strong></span></div>
        <div><HeartPulse size={20} /><span><small>照护协同</small><strong>{pendingCare} 项待完成</strong></span></div>
        <div><UsersRound size={20} /><span><small>家人联系</small><strong>{unreadMessages} 条新留言</strong></span></div>
        <div className="is-call"><PhoneCall size={20} /><span><small>护理呼叫</small><strong>随时可用</strong></span></div>
      </div>

    </section>
  );
}
