import { Mic, Phone, SendHorizontal } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  createContactGestureState,
  reduceContactGesture,
} from "../lib/contactGesture";

interface ContactLauncherProps {
  deviceOnline: boolean;
  onSendVoice: (duration: number) => void;
  onStartCall: () => void;
  onHint: (message: string) => void;
}

const LONG_PRESS_MS = 320;

function vibrate(duration = 16) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

export function ContactLauncher({
  deviceOnline,
  onSendVoice,
  onStartCall,
  onHint,
}: ContactLauncherProps) {
  const [gesture, dispatch] = useReducer(
    reduceContactGesture,
    undefined,
    createContactGestureState,
  );
  const [elapsed, setElapsed] = useState(0);
  const startXRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (gesture.phase !== "recording") {
      return undefined;
    }

    if (recordingStartedAtRef.current === null) {
      recordingStartedAtRef.current = Date.now();
    }

    const interval = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current ?? Date.now();
      setElapsed(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    }, 250);

    return () => window.clearInterval(interval);
  }, [gesture.phase]);

  const clearLongPress = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const reset = () => {
    clearLongPress();
    recordingStartedAtRef.current = null;
    setElapsed(0);
    dispatch({ type: "RESET" });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    timerRef.current = window.setTimeout(() => {
      dispatch({ type: "LONG_PRESS_RECOGNIZED" });
      vibrate();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.phase === "idle") {
      return;
    }

    const previousSelection = gesture.selection;
    const deltaX = event.clientX - startXRef.current;
    const nextState = reduceContactGesture(gesture, { type: "MOVE", deltaX });

    if (nextState.selection !== previousSelection && nextState.selection !== "none") {
      vibrate(22);
    }

    if (nextState.phase === "recording" && recordingStartedAtRef.current === null) {
      recordingStartedAtRef.current = Date.now();
    }

    dispatch({ type: "MOVE", deltaX });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearLongPress();
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (gesture.phase === "idle") {
      onHint("请按住按钮，再向左或向右滑动选择");
      return;
    }

    if (gesture.phase === "recording") {
      const duration = Math.max(2, elapsed || 2);
      onSendVoice(duration);
      reset();
      return;
    }

    if (gesture.phase === "call-ready") {
      if (deviceOnline) {
        onStartCall();
      } else {
        onHint("护理床当前离线，暂时无法通话");
      }
      reset();
      return;
    }

    reset();
  };

  const interactionActive = gesture.phase !== "idle";

  return (
    <>
      {interactionActive ? <div className="gesture-scrim" aria-hidden="true" /> : null}
      <div className={`contact-launcher-zone phase-${gesture.phase}`}>
        {interactionActive ? (
          <div className="contact-choices" aria-live="polite">
            <div
              className={`contact-choice message-choice${
                gesture.selection === "message" ? " is-selected" : ""
              }`}
            >
              <SendHorizontal size={22} aria-hidden="true" />
              <span>录制留言</span>
            </div>
            <div
              className={`contact-choice call-choice${
                gesture.selection === "call" ? " is-selected" : ""
              }${deviceOnline ? "" : " is-disabled"}`}
            >
              <Phone size={22} aria-hidden="true" />
              <span>打电话</span>
              {deviceOnline ? null : <small>设备离线</small>}
            </div>
          </div>
        ) : null}

        {gesture.phase === "recording" ? (
          <div className="recording-status" aria-live="polite">
            <span className="recording-dot" />
            <strong>正在录制 {elapsed.toString().padStart(2, "0")}秒</strong>
            <span>松开发送 · 滑回中央取消</span>
          </div>
        ) : null}

        <button
          type="button"
          className={`contact-launcher${interactionActive ? " is-active" : ""}`}
          aria-label="按住联系妈妈"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={reset}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="launcher-icon">
            <Mic size={27} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="launcher-copy">
            <strong>{gesture.phase === "recording" ? "松开发送" : "按住联系妈妈"}</strong>
            <small>{interactionActive ? "左右滑动选择" : "留言或通话"}</small>
          </span>
        </button>
      </div>
    </>
  );
}
