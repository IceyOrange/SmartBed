import { MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

interface CallOverlayProps {
  open: boolean;
  onClose: () => void;
}

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function CallOverlay({ open, onClose }: CallOverlayProps) {
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    if (!open) {
      setConnected(false);
      setSeconds(0);
      return undefined;
    }

    const connectTimer = window.setTimeout(() => setConnected(true), 1400);
    return () => window.clearTimeout(connectTimer);
  }, [open]);

  useEffect(() => {
    if (!connected) {
      return undefined;
    }

    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  if (!open) {
    return null;
  }

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label="与妈妈通话">
      <div className="call-ambient" aria-hidden="true" />
      <div className="call-avatar" aria-hidden="true">妈</div>
      <h2>妈妈</h2>
      <p>{connected ? formatSeconds(seconds) : "正在呼叫，护理床端正在响铃…"}</p>

      <div className="call-actions">
        <button
          type="button"
          className={muted ? "is-active" : ""}
          aria-label={muted ? "取消静音" : "静音"}
          onClick={() => setMuted((value) => !value)}
        >
          <MicOff size={24} aria-hidden="true" />
          <span>静音</span>
        </button>
        <button
          type="button"
          className={speaker ? "is-active" : ""}
          aria-label={speaker ? "关闭扬声器" : "打开扬声器"}
          onClick={() => setSpeaker((value) => !value)}
        >
          <Volume2 size={24} aria-hidden="true" />
          <span>扬声器</span>
        </button>
      </div>

      <button type="button" className="end-call-button" onClick={onClose}>
        <PhoneOff size={27} aria-hidden="true" />
        <span>结束通话</span>
      </button>
    </div>
  );
}
