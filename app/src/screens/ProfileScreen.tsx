import {
  AudioLines,
  BellRing,
  ChevronRight,
  Clock3,
  FileHeart,
  ExternalLink,
  Headphones,
  LockKeyhole,
  MoonStar,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wifi,
} from "lucide-react";
import { useState } from "react";

interface ProfileScreenProps {
  deviceOnline: boolean;
  onToast: (message: string) => void;
}

interface SettingRowProps {
  icon: typeof UserRound;
  title: string;
  detail: string;
  onClick: () => void;
}

function SettingRow({ icon: Icon, title, detail, onClick }: SettingRowProps) {
  return (
    <button type="button" className="setting-row" onClick={onClick}>
      <span className="setting-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="setting-copy"><strong>{title}</strong><small>{detail}</small></span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}

export function ProfileScreen({ deviceOnline, onToast }: ProfileScreenProps) {
  const [quietHours, setQuietHours] = useState(true);
  const [aiSummary, setAiSummary] = useState(true);

  return (
    <main className="screen-content profile-screen">
      <header className="screen-header">
        <div>
          <p className="date-line">账号、设备与 Agent 偏好</p>
          <h1>我的关爱设置</h1>
        </div>
      </header>

      <section className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">黄</div>
        <div>
          <strong>天成</strong>
          <p>主要联系人 · 关爱妈妈</p>
        </div>
        <span className="role-tag">家属端</span>
      </section>

      <section className="settings-section" aria-labelledby="care-profile-title">
        <h2 id="care-profile-title">关爱档案</h2>
        <div className="settings-card">
          <SettingRow
            icon={FileHeart}
            title="妈妈的关爱档案"
            detail="称呼、作息、听力与生活习惯"
            onClick={() => onToast("关爱档案编辑将在下一版本接入")}
          />
          <SettingRow
            icon={UserRound}
            title="联系人"
            detail="妈妈 · 床端设备已绑定"
            onClick={() => onToast("当前仅配置一位主要联系人")}
          />
          <SettingRow
            icon={Headphones}
            title="内容偏好"
            detail="戏曲、有声书、舒缓音乐"
            onClick={() => onToast("内容偏好已保存")}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="agent-settings-title">
        <h2 id="agent-settings-title">Agent 偏好</h2>
        <div className="settings-card">
          <label className="toggle-row">
            <span className="setting-icon"><BellRing size={19} aria-hidden="true" /></span>
            <span className="setting-copy"><strong>AI 留言摘要</strong><small>自动提炼长留言和连续留言</small></span>
            <input
              type="checkbox"
              checked={aiSummary}
              onChange={(event) => setAiSummary(event.target.checked)}
            />
            <span className="toggle-control" aria-hidden="true" />
          </label>
          <label className="toggle-row">
            <span className="setting-icon"><MoonStar size={19} aria-hidden="true" /></span>
            <span className="setting-copy"><strong>免打扰时段</strong><small>22:00 至次日 07:00</small></span>
            <input
              type="checkbox"
              checked={quietHours}
              onChange={(event) => setQuietHours(event.target.checked)}
            />
            <span className="toggle-control" aria-hidden="true" />
          </label>
          <SettingRow
            icon={Clock3}
            title="提醒与通知"
            detail="未确认提醒、设备异常和留言通知"
            onClick={() => onToast("通知规则已打开")}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="device-settings-title">
        <h2 id="device-settings-title">设备与隐私</h2>
        <div className="settings-card">
          <SettingRow
            icon={Smartphone}
            title="护理床设备"
            detail={`卧室护理床 · ${deviceOnline ? "Agent 在线" : "Agent 未连接"}`}
            onClick={() => onToast(deviceOnline ? "设备运行正常，已连接 Agent" : "Agent 当前未连接")}
          />
          <a
            className="setting-row demo-link-row"
            href="/voice-demo.html"
            target="_blank"
            rel="noreferrer"
          >
            <span className="setting-icon"><AudioLines size={19} aria-hidden="true" /></span>
            <span className="setting-copy">
              <strong>床侧语音交互演示</strong>
              <small>独立页面 · Agent 识别与安全确认</small>
            </span>
            <ExternalLink size={17} aria-hidden="true" />
          </a>
          <SettingRow
            icon={Wifi}
            title="连接状态"
            detail="家庭网络稳定 · 云端已同步"
            onClick={() => onToast("网络与同步状态正常")}
          />
          <SettingRow
            icon={LockKeyhole}
            title="隐私与数据"
            detail="留言、转写与摘要数据管理"
            onClick={() => onToast("隐私设置将在正式版中完整提供")}
          />
        </div>
      </section>

      <div className="security-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <p>App 不提供远程床体运动控制；实体手柄、急停与机械保护始终独立运行。</p>
      </div>
    </main>
  );
}
