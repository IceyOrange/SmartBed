import { BookOpenText, Keyboard, Mic, MicOff, RotateCcw, SendHorizontal } from "lucide-react";
import { type FormEvent, type RefObject } from "react";

import type { DemoTurn } from "../model";

interface VoiceConsoleProps {
  draft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  interimTranscript: string;
  latestTurn?: DemoTurn;
  turns?: DemoTurn[];
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

function statusTitle({
  latestTurn,
  listening,
  speechStarting,
  submitting,
  failedRequest,
}: Pick<VoiceConsoleProps, "latestTurn" | "listening" | "speechStarting" | "submitting" | "failedRequest">) {
  if (failedRequest) return "这次没有发送成功";
  if (submitting) return "正在处理";
  if (speechStarting) return "正在打开麦克风";
  if (listening) return "正在听";
  if (latestTurn) return "可以继续说";
  return "点击开始说话";
}

export default function VoiceConsole(props: VoiceConsoleProps) {
  const {
    draft,
    inputRef,
    interimTranscript,
    latestTurn,
    turns = latestTurn ? [latestTurn] : [],
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
  const stateClass = failedRequest
    ? "is-error"
    : submitting
      ? "is-processing"
      : speechStarting
        ? "is-starting"
        : listening
          ? "is-listening"
          : "is-idle";
  const detail = interimTranscript
    ? `“${interimTranscript}”`
    : speechMessage;

  return (
    <section className="voice-console" aria-busy={busy} aria-labelledby="voice-console-title">
      <div className="voice-console__header">
        <div>
          <span className="section-kicker">早上好，王阿姨</span>
          <h1 id="voice-console-title">现在需要什么帮助？</h1>
          <p>说出您想做的事，床体、照护和家人联系都可以。</p>
        </div>
        <button type="button" className="guide-trigger" aria-label="打开演示指南" onClick={onOpenGuide}>
          <BookOpenText size={16} />
          怎么说
        </button>
      </div>

      <div className="voice-console__center">
        <div className="voice-intro">
          <strong>我在这里，随时可以开始</strong>
          <span>不会自动录音，只有主动开启后才会听取指令</span>
        </div>

        <div className={`voice-control ${stateClass}`}>
          <button
            type="button"
            className="voice-control__button"
            aria-label={busy ? "正在识别语音" : listening ? "停止语音识别" : "开始语音识别"}
            aria-describedby="voice-speech-message"
            aria-pressed={listening}
            disabled={busy}
            onClick={onToggleListening}
          >
            {listening ? <MicOff size={27} /> : <Mic size={27} />}
          </button>
          <div id="voice-speech-message" className="voice-control__copy" aria-live="polite">
            <strong>{statusTitle({ latestTurn, listening, speechStarting, submitting, failedRequest })}</strong>
            <span>{detail}</span>
          </div>
          <div className="voice-control__shortcut">
            <span>也可以按空格键</span>
            <kbd>空格</kbd>
          </div>
          {listening ? (
            <div className="voice-level" aria-hidden="true">
              <i /><i /><i /><i />
            </div>
          ) : null}
        </div>

        {failedRequest && !submitting ? (
          <button type="button" className="speech-retry" aria-label="重新发送刚才的请求" onClick={onRetry}>
            <RotateCcw size={15} />重新发送
          </button>
        ) : latestTurn ? (
          <p className="last-utterance">“{latestTurn.userText}”</p>
        ) : null}

        <form className="voice-text-form" onSubmit={onSubmit}>
          <Keyboard size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="输入想对护理床说的话"
            placeholder="也可以直接输入一句话"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button type="submit" aria-label="发送文字指令" disabled={!draft.trim() || submitting}>
            <SendHorizontal size={17} />
            <span>{submitting ? "处理中" : "发送"}</span>
          </button>
        </form>

        {!turns.length ? (
          <div className="quick-phrases" aria-label="试着这样说">
            <span>试着说</span>
            {QUICK_EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => onFillExample(example)}>{example}</button>
            ))}
          </div>
        ) : null}
      </div>

      <section className="recent-usage" aria-label="本次对话" aria-live="polite">
        <div className="recent-usage__heading">
          <strong>刚刚使用</strong>
          <span>刷新页面后清空</span>
        </div>
        {turns.length ? (
          <ol>
            {turns.slice(0, 3).map((turn, index) => (
              <li key={turn.id}>
                <em>{String(index + 1).padStart(2, "0")}</em>
                <span>{turn.userText}</span>
                <time>{turn.match.label}</time>
              </li>
            ))}
          </ol>
        ) : <p>本次页面还没有使用记录</p>}
      </section>
    </section>
  );
}
