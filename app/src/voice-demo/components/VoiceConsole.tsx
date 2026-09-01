import { AudioLines, BookOpenText, Keyboard, Mic, MicOff, RotateCcw, SendHorizontal } from "lucide-react";
import type { FormEvent, RefObject } from "react";

import type { DemoTurn } from "../model";

interface VoiceConsoleProps {
  draft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  interimTranscript: string;
  latestTurn?: DemoTurn;
  listening: boolean;
  speechMessage: string;
  speechStarting: boolean;
  submitting: boolean;
  failedRequest: string | null;
  onDraftChange: (value: string) => void;
  onFillExample: (value: string) => void;
  onOpenGuide: () => void;
  onRetry: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleListening: () => void;
}

const QUICK_EXAMPLES = ["把靠背升高一点", "听听女儿的留言"];

function stateTitle({
  latestTurn,
  listening,
  speechStarting,
  submitting,
}: Pick<VoiceConsoleProps, "latestTurn" | "listening" | "speechStarting" | "submitting">) {
  if (submitting) return "正在理解您的需要";
  if (speechStarting) return "正在准备聆听";
  if (listening) return "我在听，请继续说";
  if (latestTurn) return "已经为您处理好了";
  return "点击麦克风开始说话";
}

export default function VoiceConsole(props: VoiceConsoleProps) {
  const {
    draft,
    inputRef,
    interimTranscript,
    latestTurn,
    listening,
    speechMessage,
    speechStarting,
    submitting,
    failedRequest,
    onDraftChange,
    onFillExample,
    onOpenGuide,
    onRetry,
    onSubmit,
    onToggleListening,
  } = props;
  const busy = speechStarting || submitting;

  return (
    <section className="voice-console" aria-labelledby="voice-console-title">
      <div className="voice-console__header">
        <div>
          <span className="section-kicker">床侧语音</span>
          <h1 id="voice-console-title">需要什么帮助？</h1>
          <p>直接说出需要，不必记住固定口令</p>
        </div>
        <button
          type="button"
          className="guide-trigger"
          aria-label="打开演示指南"
          onClick={onOpenGuide}
        >
          <BookOpenText size={18} />
          演示指南
        </button>
      </div>

      <div className={`voice-listener${listening ? " is-listening" : ""}${speechStarting ? " is-starting" : ""}`}>
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
        </div>
        <button
          type="button"
          className="voice-mic-button"
          aria-label={speechStarting ? "正在识别语音" : listening ? "停止语音识别" : "开始语音识别"}
          aria-pressed={listening}
          disabled={busy}
          onClick={onToggleListening}
        >
          {listening ? <MicOff size={34} /> : <Mic size={34} />}
        </button>
      </div>

      <div className={`speech-state${failedRequest ? " is-error" : ""}`} aria-live="polite">
        <strong>{failedRequest ? "这次请求没有发送成功" : stateTitle({ latestTurn, listening, speechStarting, submitting })}</strong>
        <p>{interimTranscript ? `“${interimTranscript}”` : speechMessage}</p>
        {failedRequest && !submitting ? (
          <button type="button" className="speech-retry" aria-label="重新发送刚才的请求" onClick={onRetry}>
            <RotateCcw size={15} />
            重新发送
          </button>
        ) : null}
      </div>

      {submitting ? (
        <div className="processing-steps" aria-label="正在处理">
          <span className="is-complete">已听见</span>
          <span className="is-active">理解需要</span>
          <span>安全处理</span>
        </div>
      ) : latestTurn ? (
        <div className="voice-response">
          <AudioLines size={18} aria-hidden="true" />
          <p>“{latestTurn.userText}”</p>
        </div>
      ) : null}

      <form className="voice-text-form" onSubmit={onSubmit}>
        <Keyboard size={19} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label="输入想对护理床说的话"
          placeholder="也可以在这里输入"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button type="submit" aria-label="发送文字指令" disabled={!draft.trim() || submitting}>
          <SendHorizontal size={19} />
          <span>{submitting ? "处理中" : "发送"}</span>
        </button>
      </form>

      <div className="voice-console__footer">
        <span>空格键也可以开始或结束语音</span>
        <div className="quick-phrases" aria-label="快捷示例">
          {QUICK_EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => onFillExample(example)}>
              “{example}”
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
