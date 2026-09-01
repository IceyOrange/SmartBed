import {
  Accessibility,
  ArrowLeft,
  AudioLines,
  BookOpenText,
  Bot,
  Check,
  CircleAlert,
  CloudSun,
  HeartHandshake,
  Info,
  Keyboard,
  Mic,
  MicOff,
  Phone,
  Play,
  SendHorizontal,
  ShieldCheck,
  SquareActivity,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { toDemoTurn } from "../api/adapters";
import { agentApi, ApiError } from "../api/client";
import {
  createDemoSession,
  VOICE_DOMAINS,
  type DemoSessionState,
  type DemoTurn,
  type VoiceDomain,
} from "./model";

interface SpeechAlternativeLike {
  transcript: string;
}

interface SpeechResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternativeLike;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onnomatch: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const DOMAIN_ICONS = {
  body: Accessibility,
  care: HeartHandshake,
  relationship: UsersRound,
  daily: CloudSun,
};

const STATUS_LABELS: Record<DemoTurn["status"], string> = {
  clarifying: "还需说明",
  "awaiting-confirmation": "等你确认",
  "simulated-complete": "已经完成",
  information: "已经答复",
  restricted: "没有执行",
};

function speak(text: string) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function isSpeechSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

async function requestMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

function microphoneAccessError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "麦克风权限未开启，请在浏览器地址栏允许麦克风";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有检测到可用麦克风，请检查设备连接";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风暂时无法使用，可能正被其他程序占用";
  }
  return "无法打开麦克风，请检查浏览器和系统权限";
}

function recognitionError(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "麦克风权限未开启，请在浏览器地址栏允许麦克风";
  }
  if (error === "no-speech") return "没有听清，请靠近麦克风再说一次";
  if (error === "audio-capture") return "没有检测到可用麦克风，请检查设备连接";
  if (error === "network") return "语音识别服务连接失败，请检查网络后重试";
  if (error === "aborted") return "语音输入已停止";
  return "语音识别暂时不可用，请重试或使用文字输入";
}

function adjustmentDescription(turn: DemoTurn) {
  const part = turn.match.slots.bodyPart ?? "护理床";
  const direction = turn.match.slots.direction ?? "调整";
  const amount = turn.match.slots.angle !== undefined
    ? `到 ${turn.match.slots.angle} 度`
    : turn.match.slots.amount === "小幅"
      ? "一点"
      : turn.match.slots.amount === "大幅" ? "较大幅度" : "";
  return `你想把护理床${part}${direction}${amount}。`;
}

function understandingFor(turn: DemoTurn) {
  const { intent, slots } = turn.match;
  if (/^(确认|可以|好的|继续执行|执行吧)$/.test(turn.userText.trim())) return "你确认执行刚才的操作。";
  if (/^(取消|不用了?|算了|不要了?)$/.test(turn.userText.trim())) return "你想取消刚才的操作。";
  if (intent === "bed.stop") return "你想让护理床立即停止。";
  if (["bed.back.adjust", "bed.legs.adjust", "bed.height.adjust"].includes(intent)) return adjustmentDescription(turn);
  if (intent === "bed.scene") return `你想把护理床调整到${slots.scene ?? "合适的"}姿势。`;
  if (intent === "bed.reset") return "你想让护理床恢复到平躺位置。";
  if (intent === "care.reminder.create") return `你想让护理床${slots.time ? `在${slots.time}` : "稍后"}提醒你${slots.content ? `：${slots.content}` : "一件事"}。`;
  if (intent === "care.record.create") return `你想记下${slots.content ? `“${slots.content}”` : "一条护理记录"}。`;
  if (intent === "care.record.query") return "你想查看最近的护理记录。";
  if (intent === "care.emergency") return "你需要立即联系护理人员。";
  if (intent === "care.todo.query") return "你想知道还有哪些护理事项。";
  if (intent === "care.todo.update") return "你想更新一项护理事项。";
  if (intent === "relation.call.start") return `你想给${slots.contact ?? "家人"}打电话。`;
  if (intent === "relation.call.answer") return "你想接听来电。";
  if (intent === "relation.call.end") return "你想结束当前通话。";
  if (intent === "relation.message.play") return `你想听${slots.contact ?? "家人"}发来的语音留言。`;
  if (intent === "relation.message.create") return `你想给${slots.contact ?? "家人"}留一段语音。`;
  if (intent === "relation.anniversary.query") return "你想查询家人的生日或纪念日。";
  if (intent === "relation.anniversary.greet") return `你想给${slots.contact ?? "家人"}送一段祝福。`;
  if (intent === "daily.schedule.query") return "你想知道今天有哪些安排。";
  if (intent === "daily.weather.query") return "你想了解今天的天气。";
  if (intent === "daily.note.create") return `你想记下${slots.content ? `“${slots.content}”` : "一件事"}。`;
  if (intent === "daily.note.query") return "你想查看之前记下的内容。";
  if (intent === "daily.chat") return "你想和护理床聊一会儿。";
  if (intent === "daily.media.play") return `你想播放${slots.content ?? "一段内容"}。`;
  if (intent === "daily.media.control") return "你想调整正在播放的内容。";
  if (intent === "medical.restricted") return "你提出了需要由医护人员判断的医疗问题。";
  return "我还没有完全听懂，需要你再说具体一点。";
}

function capabilityFor(turn: DemoTurn) {
  const { intent, slots } = turn.match;
  if (turn.status === "clarifying") return "暂不执行，先向你问清楚。";
  if (turn.status === "restricted") return "未调用功能，避免执行不安全或无权限的操作。";
  if (intent === "bed.stop") return "立即停止护理床当前动作。";
  if (intent === "bed.back.adjust") return "调节护理床靠背。";
  if (intent === "bed.legs.adjust") return "调节护理床腿板。";
  if (intent === "bed.height.adjust") return "调节护理床整体高度。";
  if (intent === "bed.scene" || intent === "bed.reset") return "切换护理床姿势。";
  if (intent === "care.reminder.create") return "创建床侧语音提醒。";
  if (intent === "care.record.create") return "保存护理记录。";
  if (intent === "care.record.query") return "读取护理记录。";
  if (intent === "care.emergency") return "向预设护理人员发出紧急求助。";
  if (intent.startsWith("care.todo")) return "读取或更新护理事项。";
  if (intent.startsWith("relation.call")) return `连接${slots.contact ?? "家人"}的通话。`;
  if (intent === "relation.message.play") return `查找并播放${slots.contact ?? "家人"}最新的语音留言。`;
  if (intent === "relation.message.create") return `录制并发送给${slots.contact ?? "家人"}的语音留言。`;
  if (intent.startsWith("relation.anniversary")) return "查询纪念日并发送祝福。";
  if (intent === "daily.schedule.query") return "读取今天的日程安排。";
  if (intent === "daily.weather.query") return "查询天气信息。";
  if (intent.startsWith("daily.note")) return "读取或保存生活记事。";
  if (intent === "daily.chat") return "生成陪伴回复。";
  if (intent.startsWith("daily.media")) return `播放或控制${slots.content ?? "媒体内容"}。`;
  return "根据你的说明选择对应功能。";
}

export default function VoiceDemoApp() {
  const [session, setSession] = useState<DemoSessionState>(() => createDemoSession());
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechMessage, setSpeechMessage] = useState(() =>
    isSpeechSupported() ? "点击麦克风开始说话" : "当前浏览器不支持语音识别，可使用文字输入",
  );
  const [speechStarting, setSpeechStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [localSpeechAvailable, setLocalSpeechAvailable] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechErrorRef = useRef(false);
  const pendingSpeechRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    agentApi.health().then(
      () => {
        if (active) setAgentConnected(true);
      },
      () => {
        if (active) setAgentConnected(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    agentApi.getSpeechStatus().then(
      (status) => {
        if (!active) return;
        setLocalSpeechAvailable(status.available);
        setSpeechMessage(status.available
          ? "本机中文语音识别已就绪，点击麦克风开始说话"
          : isSpeechSupported()
            ? "点击麦克风开始说话"
            : `${status.message}，可使用文字输入`);
      },
      () => {
        if (!active) return;
        setLocalSpeechAvailable(false);
        setSpeechMessage(isSpeechSupported()
          ? "本机识别不可用，将使用浏览器语音识别"
          : "当前设备没有可用的语音识别，可使用文字输入");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const fillDraft = useCallback((text: string) => {
    setDraft(text.trim());
    setInterimTranscript("");
    inputRef.current?.focus();
  }, []);

  const submitInput = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || submitting) return;
    setSubmitting(true);
    setSpeechMessage("Agent 正在理解并执行安全检查…");
    try {
      const result = await agentApi.sendBedsideMessage(cleanText, "elder-1");
      const turn = toDemoTurn(cleanText, result);
      const nextState: DemoSessionState = {
        ...sessionRef.current,
        turns: [turn, ...sessionRef.current.turns].slice(0, 8),
        activeCall: result.code === "call_started" || sessionRef.current.activeCall,
        activeMedia: result.code === "media_playing" || sessionRef.current.activeMedia,
      };
      sessionRef.current = nextState;
      setSession(nextState);
      setDraft("");
      setInterimTranscript("");
      setSpeechMessage("指令已由 Agent 处理");
      setAgentConnected(true);
      speak(turn.response);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Agent 请求失败，请稍后重试。";
      setSpeechMessage(message);
      setAgentConnected(false);
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const startBrowserListening = async () => {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) {
      setSpeechMessage("当前浏览器不支持语音识别，可使用文字输入");
      inputRef.current?.focus();
      return;
    }

    setSpeechStarting(true);
    setSpeechMessage("正在检查麦克风权限…");
    try {
      await requestMicrophoneAccess();
    } catch (error) {
      setSpeechStarting(false);
      setSpeechMessage(microphoneAccessError(error));
      inputRef.current?.focus();
      return;
    }

    const recognition = new Constructor();
    speechErrorRef.current = false;
    pendingSpeechRef.current = "";
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setSpeechStarting(false);
      setListening(true);
      setSpeechMessage("麦克风已打开，请开始说话");
    };
    recognition.onaudiostart = () => setSpeechMessage("麦克风已打开，请开始说话");
    recognition.onsoundstart = () => setSpeechMessage("已经听到声音，正在识别…");
    recognition.onspeechstart = () => setSpeechMessage("已经听到声音，正在识别…");
    recognition.onresult = (event) => {
      let interim = "";
      let finalTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setInterimTranscript(interim || finalTranscript);
      if (finalTranscript.trim()) {
        pendingSpeechRef.current = finalTranscript.trim();
        setDraft(finalTranscript.trim());
        setSpeechMessage("已经听清，正在交给中控 Agent…");
        recognition.stop();
      }
    };
    recognition.onnomatch = () => {
      speechErrorRef.current = true;
      setSpeechMessage("没有听清，请靠近麦克风再说一次");
    };
    recognition.onerror = (event) => {
      speechErrorRef.current = true;
      pendingSpeechRef.current = "";
      setSpeechStarting(false);
      setListening(false);
      setSpeechMessage(recognitionError(event.error));
      inputRef.current?.focus();
    };
    recognition.onend = () => {
      setSpeechStarting(false);
      setListening(false);
      recognitionRef.current = null;
      const transcript = pendingSpeechRef.current;
      pendingSpeechRef.current = "";
      if (transcript && !speechErrorRef.current) {
        void submitInput(transcript);
      } else if (!speechErrorRef.current) {
        setSpeechMessage("没有识别到内容，请再试一次");
      }
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      speechErrorRef.current = true;
      setSpeechStarting(false);
      setListening(false);
      setSpeechMessage("语音识别未能启动，请使用文字输入");
      inputRef.current?.focus();
    }
  };

  const recognizeWithLocalAgent = async () => {
    setSpeechStarting(true);
    setInterimTranscript("");
    setSpeechMessage("正在使用本机中文语音识别，请现在说话（约 8 秒后自动结束）");
    try {
      const result = await agentApi.recognizeSpeech();
      const transcript = result.text.trim();
      if (!transcript) {
        setSpeechMessage("没有听清，请靠近麦克风再说一次");
        return true;
      }
      setDraft(transcript);
      setInterimTranscript(transcript);
      setSpeechMessage("已经听清，正在交给中控 Agent…");
      await submitInput(transcript);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "speech_timeout") {
        setSpeechMessage(error.message);
        inputRef.current?.focus();
        return true;
      }
      setLocalSpeechAvailable(false);
      setSpeechMessage("本机识别暂不可用，正在改用浏览器语音识别…");
      return false;
    } finally {
      setSpeechStarting(false);
    }
  };

  const startOrStopListening = async () => {
    if (listening) {
      setSpeechMessage("正在结束语音输入…");
      recognitionRef.current?.stop();
      return;
    }

    let canUseLocalSpeech = localSpeechAvailable;
    if (canUseLocalSpeech === null) {
      setSpeechStarting(true);
      setSpeechMessage("正在检查本机中文语音识别…");
      try {
        const status = await agentApi.getSpeechStatus();
        canUseLocalSpeech = status.available;
        setLocalSpeechAvailable(status.available);
      } catch {
        canUseLocalSpeech = false;
        setLocalSpeechAvailable(false);
      } finally {
        setSpeechStarting(false);
      }
    }

    if (canUseLocalSpeech && await recognizeWithLocalAgent()) return;
    await startBrowserListening();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitInput(draft);
  };

  const latestTurn = session.turns[0];
  const activeDomain: VoiceDomain = latestTurn?.match.domain ?? "body";

  return (
    <div className="voice-demo-root">
      <header className="voice-demo-header">
        <div className="voice-header-inner">
          <div className="voice-brand">
            <span className="voice-brand-mark"><AudioLines size={24} /></span>
            <div><strong>智能护理床中控 Agent</strong><span>护理床语音控制与服务调度</span></div>
          </div>
          <div className="voice-header-actions">
            <span className="demo-state"><span />演示环境 · 不驱动真实设备</span>
            <span className={`offline-state${agentConnected === false ? " is-disconnected" : ""}`}>
              <ShieldCheck size={16} />
              {agentConnected === null ? "正在连接 Agent" : agentConnected ? "Agent 已连接" : "Agent 未连接"}
            </span>
            <a href="/"><ArrowLeft size={17} />返回家属端</a>
          </div>
        </div>
      </header>

      <main className="voice-demo-main">
        <section className="voice-hero-grid" aria-label="语音交互演示">
          <div className="voice-console-card">
            <div className="console-heading">
              <div><h1>说出你想做的事</h1><p>中控 Agent 会理解你的话，并调用对应功能</p></div>
              <span><AudioLines size={16} />语音或文字</span>
            </div>

            <div className={`voice-orb${listening ? " is-listening" : ""}${speechStarting ? " is-starting" : ""}`}>
              <span className="orb-ring ring-one" />
              <span className="orb-ring ring-two" />
              <button
                type="button"
                className="voice-mic-button"
                aria-label={speechStarting ? "正在识别语音" : listening ? "停止语音识别" : "开始语音识别"}
                aria-pressed={listening}
                disabled={speechStarting || submitting}
                onClick={() => void startOrStopListening()}
              >
                {listening ? <MicOff size={34} /> : <Mic size={34} />}
              </button>
            </div>

            <div className="speech-state" aria-live="polite">
              <strong>{speechStarting ? localSpeechAvailable ? "本机正在听你说" : "正在打开麦克风" : listening ? "正在听你说" : submitting ? "中控 Agent 正在处理" : latestTurn ? STATUS_LABELS[latestTurn.status] : "点击麦克风开始说话"}</strong>
              <p>{interimTranscript ? `“${interimTranscript}”` : speechMessage}</p>
            </div>

            <form className="voice-text-form" onSubmit={handleSubmit}>
              <Keyboard size={20} aria-hidden="true" />
              <input
                ref={inputRef}
                aria-label="输入想对护理床说的话"
                placeholder="例如：把靠背升高一点"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" aria-label="发送文字指令" disabled={!draft.trim() || submitting}>
                <SendHorizontal size={20} /><span>{submitting ? "处理中" : "发送"}</span>
              </button>
            </form>

            <div className="quick-examples" aria-label="快捷示例">
              {VOICE_DOMAINS.map((domain) => (
                <button key={domain.id} type="button" aria-label={`示例：${domain.examples[0]}`} onClick={() => fillDraft(domain.examples[0])}>
                  “{domain.examples[0]}”
                </button>
              ))}
            </div>
          </div>

          <aside className="agent-result-card" aria-live="polite">
            <div className="result-heading">
              <div><span>本次处理</span><h2>{latestTurn ? "中控 Agent 做了什么" : "等待用户指令"}</h2></div>
              <span className={`result-status status-${latestTurn?.status ?? "idle"}`}>
                {latestTurn ? STATUS_LABELS[latestTurn.status] : "尚无指令"}
              </span>
            </div>

            {latestTurn ? (
              <>
                <div className="plain-result-list">
                  <section className="plain-result-step user-turn">
                    <span className="plain-result-icon"><AudioLines size={18} /></span>
                    <div><strong>用户说了什么</strong><p>“{latestTurn.userText}”</p></div>
                  </section>
                  <section className="plain-result-step understood-turn">
                    <span className="plain-result-icon"><Bot size={18} /></span>
                    <div><strong>Agent 听懂了</strong><p>{understandingFor(latestTurn)}</p></div>
                  </section>
                  <section className="plain-result-step capability-turn">
                    <span className="plain-result-icon"><SquareActivity size={18} /></span>
                    <div><strong>调用的功能</strong><p>{capabilityFor(latestTurn)}</p></div>
                  </section>
                  <section className={`plain-result-step outcome-turn status-${latestTurn.status}`}>
                    <span className="plain-result-icon"><Check size={18} /></span>
                    <div><strong>处理结果</strong><p>{latestTurn.response}</p></div>
                  </section>
                </div>

                {latestTurn.status === "awaiting-confirmation" ? (
                  <div className="confirmation-actions">
                    <button type="button" onClick={() => void submitInput("取消")} disabled={submitting}><X size={18} />取消</button>
                    <button type="button" className="confirm-button" onClick={() => void submitInput("确认")} disabled={submitting}><Check size={18} />确认执行</button>
                  </div>
                ) : null}

              </>
            ) : (
              <div className="result-empty">
                <Bot size={38} />
                <strong>等待你的第一句话</strong>
                <p>可以调节护理床、设置提醒、联系家人或查询日程。</p>
              </div>
            )}
          </aside>
        </section>

        <section className="capability-section" aria-labelledby="capability-title">
          <div className="section-heading"><div><h2 id="capability-title">中控 Agent 能做什么</h2><p>点击一句示例，再发送给中控 Agent</p></div></div>
          <div className="domain-grid">
            {VOICE_DOMAINS.map((domain) => {
              const Icon = DOMAIN_ICONS[domain.id];
              return (
                <article className={`domain-card${activeDomain === domain.id ? " is-active" : ""}`} key={domain.id}>
                  <div className="domain-title"><span><Icon size={22} /></span><div><h3>{domain.title}</h3><p>{domain.subtitle}</p></div></div>
                  <div className="capability-chips">{domain.capabilities.map((item) => <span key={item}>{item}</span>)}</div>
                  <div className="domain-examples">
                    {domain.examples.slice(0, 3).map((example) => (
                      <button key={example} type="button" aria-label={`示例：${example}`} onClick={() => fillDraft(example)}>
                        <Play size={13} />{example}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {session.turns.length ? (
          <section className="history-section" aria-labelledby="history-title">
            <div className="section-heading"><div><h2 id="history-title">本次演示记录</h2><p>仅保留在当前浏览器内，刷新后清空</p></div></div>
            <div className="history-list">
              {session.turns.slice(0, 4).map((turn) => (
                <article key={turn.id}>
                  <span className={`history-icon domain-${turn.match.domain}`}>{turn.match.domain === "relationship" ? <Phone size={16} /> : turn.match.domain === "daily" ? <BookOpenText size={16} /> : turn.match.domain === "care" ? <HeartHandshake size={16} /> : <Accessibility size={16} />}</span>
                  <div><strong>{turn.match.label}</strong><p>{turn.userText}</p></div>
                  <span>{STATUS_LABELS[turn.status]}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="voice-demo-footer">
        <Info size={17} />
        <span>本页面已连接本机 Agent；床控硬件、联系人与护理系统仍为演示实现。</span>
        <CircleAlert size={17} />
        <span>医疗判断和药量调整必须咨询医护人员。</span>
      </footer>
    </div>
  );
}
