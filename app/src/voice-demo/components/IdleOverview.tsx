import { CalendarClock, CheckCircle2, Gauge, LoaderCircle, MessageCircle, SunMedium } from "lucide-react";

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

export default function IdleOverview({ loading = false, overview, systemState }: IdleOverviewProps) {
  if (loading) {
    return (
      <section className="idle-overview is-loading" aria-busy="true" aria-labelledby="idle-overview-title">
        <div className="stage-heading">
          <div>
            <span className="section-kicker">今日照护概览</span>
            <h2 id="idle-overview-title">正在准备今天的照护信息</h2>
            <p>床体状态与今日安排正在同步。</p>
          </div>
          <span className="overview-sync" role="status" aria-label="正在同步床侧状态">
            <LoaderCircle size={17} />
            正在同步
          </span>
        </div>
        <div className="overview-loading-block" aria-hidden="true">
          <span />
          <div><i /><i /><i /></div>
        </div>
        <div className="overview-loading-cards" aria-hidden="true">
          <span /><span /><span />
        </div>
      </section>
    );
  }

  const reminder = firstEnabledReminder(overview);
  const message = overview?.relationship.voice_messages[0];
  const weather = overview?.daily_life.weather;
  const bed = systemState?.bed;
  const safetyText = bed?.fault
    ? "床体需要检查"
    : bed?.moving ? "床体正在平稳调节" : "床体静止 · 安全状态正常";

  return (
    <section className="idle-overview" aria-labelledby="idle-overview-title">
      <div className="stage-heading">
        <div>
          <span className="section-kicker">今日照护概览</span>
          <h2 id="idle-overview-title">今天，一切都安排好了</h2>
          <p>重要状态集中在这里，需要时直接开口即可。</p>
        </div>
        <span className={`safety-chip${bed?.fault ? " is-warning" : ""}`}>
          <CheckCircle2 size={16} />
          {safetyText}
        </span>
      </div>

      <div className="posture-summary">
        <div className="posture-copy">
          <span className="posture-icon"><Gauge size={24} /></span>
          <div>
            <span>当前姿态</span>
            <strong>{bed?.moving ? "正在调节" : "舒适平躺"}</strong>
          </div>
        </div>
        <dl className="posture-metrics">
          <div><dt>靠背</dt><dd>{bed?.backrest_degrees ?? "--"}°</dd></div>
          <div><dt>腿板</dt><dd>{bed?.legrest_degrees ?? "--"}°</dd></div>
          <div><dt>床高</dt><dd>{bed?.height_cm ?? "--"}<small>cm</small></dd></div>
        </dl>
      </div>

      <div className="overview-cards">
        <article>
          <span className="overview-card__icon"><CalendarClock size={21} /></span>
          <div><span>下一项照护</span><strong>{reminder ? `${reminder.scheduled_for} · ${reminder.message}` : "今天暂无待办"}</strong></div>
        </article>
        <article>
          <span className="overview-card__icon is-family"><MessageCircle size={21} /></span>
          <div><span>家人联系</span><strong>{message ? `${message.sender}的新留言` : "暂无新留言"}</strong></div>
        </article>
        <article>
          <span className="overview-card__icon is-weather"><SunMedium size={21} /></span>
          <div><span>日常信息</span><strong>{weather ? `${weather.city} · ${weather.condition} ${weather.temperature_c}℃` : "天气正在更新"}</strong></div>
        </article>
      </div>
    </section>
  );
}
