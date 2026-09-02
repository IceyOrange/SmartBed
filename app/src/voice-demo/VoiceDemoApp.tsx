import { AudioLines, CircleAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { toDemoTurn } from "../api/adapters";
import { agentApi, ApiError } from "../api/client";
import type { ConversationMessageDto, DemoOverviewDto, SystemStateDto } from "../api/types";
import DemoGuide from "./components/DemoGuide";
import IdleOverview from "./components/IdleOverview";
import ServiceStage from "./components/ServiceStage";
import VoiceConsole from "./components/VoiceConsole";
import { createDemoSession, type DemoSessionState } from "./model";
import { toServicePresentation } from "./servicePresentation";

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

function speak(text: string) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function isSpeechSupported() {
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
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

function bedsideRequestError(error: unknown) {
  if (error instanceof ApiError && error.code === "network_error") {
    return "暂时无法连接床侧服务，请稍后重试。";
  }
  if (error instanceof ApiError && error.code === "timeout") {
    return "床侧服务响应较慢，请再试一次。";
  }
  return error instanceof ApiError ? error.message : "床侧服务请求失败，请稍后重试。";
}

function toConversationHistory(session: DemoSessionState): ConversationMessageDto[] {
  return [...session.turns]
    .slice(0, 8)
    .reverse()
    .flatMap((turn) => [
      { role: "user" as const, content: turn.userText },
      { role: "assistant" as const, content: turn.response },
    ]);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

export default function VoiceDemoApp() {
  const [actorId] = useState(() => `voice-session-${crypto.randomUUID()}`);
  const [session, setSession] = useState<DemoSessionState>(() => createDemoSession());
  const [overview, setOverview] = useState<DemoOverviewDto | null>(null);
  const [systemState, setSystemState] = useState<SystemStateDto | null>(null);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechMessage, setSpeechMessage] = useState(() => isSpeechSupported()
    ? "点击麦克风或按空格键开始说话"
    : "当前浏览器不支持语音识别，可使用文字输入");
  const [speechStarting, setSpeechStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [localSpeechAvailable, setLocalSpeechAvailable] = useState<boolean | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [lastFailedRequest, setLastFailedRequest] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechErrorRef = useRef(false);
  const pendingSpeechRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(session);
  const toggleListeningRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    const requests = [
      agentApi.health(),
      agentApi.getOverview(),
      agentApi.getState(),
      agentApi.getSpeechStatus(),
    ] as const;

    void Promise.allSettled(requests).then(([health, overviewResult, stateResult, speech]) => {
      if (!active) return;
      setAgentConnected(health.status === "fulfilled");
      if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      if (stateResult.status === "fulfilled") setSystemState(stateResult.value);
      if (speech.status === "fulfilled") {
        setLocalSpeechAvailable(speech.value.available);
        setSpeechMessage(speech.value.available
          ? "本机中文语音识别已就绪，点击麦克风或按空格键开始说话"
          : isSpeechSupported()
            ? "点击麦克风或按空格键开始说话"
            : `${speech.value.message}，可使用文字输入`);
      } else {
        setLocalSpeechAvailable(false);
        setSpeechMessage(isSpeechSupported()
          ? "本机识别不可用，将使用浏览器语音识别"
          : "当前设备没有可用的语音识别，可使用文字输入");
      }
      setInitialSyncComplete(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const fillDraft = useCallback((text: string) => {
    setDraft(text.trim());
    setInterimTranscript("");
    inputRef.current?.focus();
  }, []);

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  const selectGuideExample = useCallback((text: string) => {
    setGuideOpen(false);
    fillDraft(text);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [fillDraft]);

  const submitInput = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || submitting) return;
    setSubmitting(true);
    setShowOverview(false);
    setLastFailedRequest(null);
    setSpeechMessage("正在处理…");
    try {
      const history = toConversationHistory(sessionRef.current);
      const result = await agentApi.sendBedsideMessage(cleanText, actorId, history);
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
      setSpeechMessage("已经处理好，可以继续说");
      setAgentConnected(true);
      setLastFailedRequest(null);
      speak(turn.response);
    } catch (error) {
      setSpeechMessage(bedsideRequestError(error));
      setAgentConnected(false);
      setLastFailedRequest(cleanText);
    } finally {
      setSubmitting(false);
    }
  }, [actorId, submitting]);

  const startBrowserListening = useCallback(async () => {
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
        setSpeechMessage("已经听清，正在为您处理…");
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
  }, [submitInput]);

  const recognizeWithLocalAgent = useCallback(async () => {
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
      setSpeechMessage("已经听清，正在为您处理…");
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
  }, [submitInput]);

  const startOrStopListening = useCallback(async () => {
    if (submitting || speechStarting) return;
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
  }, [listening, localSpeechAvailable, recognizeWithLocalAgent, speechStarting, startBrowserListening, submitting]);

  useEffect(() => {
    toggleListeningRef.current = () => {
      void startOrStopListening();
    };
  }, [startOrStopListening]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
      event.preventDefault();
      toggleListeningRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitInput(draft);
  };

  const latestTurn = session.turns[0];
  const presentation = latestTurn ? toServicePresentation(latestTurn) : null;
  const currentTime = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  return (
    <div className="voice-demo-root">
      <header className="voice-demo-header">
        <div className="voice-brand">
          <span className="voice-brand-mark"><AudioLines size={22} /></span>
          <div><strong>安心护理床</strong><span>床侧生活服务</span></div>
        </div>
        <div className="voice-header-meta">
          <span className="header-time">{currentTime}</span>
          <span className="room-state">卧室 · {overview?.daily_life.weather.temperature_c ?? "--"}℃</span>
          <span className={`service-state${agentConnected === false ? " is-disconnected" : ""}`}>
            <ShieldCheck size={16} />
            {agentConnected === null ? "正在连接" : agentConnected ? "设备运行正常" : "服务未连接"}
          </span>
        </div>
      </header>

      <main className="voice-demo-main">
        <div className="voice-workspace">
          <VoiceConsole
            draft={draft}
            inputRef={inputRef}
            interimTranscript={interimTranscript}
            latestTurn={latestTurn}
            turns={session.turns}
            listening={listening}
            speechMessage={speechMessage}
            speechStarting={speechStarting}
            submitting={submitting}
            failedRequest={lastFailedRequest}
            onDraftChange={setDraft}
            onFillExample={fillDraft}
            onOpenGuide={openGuide}
            onRetry={() => void submitInput(lastFailedRequest ?? "")}
            onSubmit={handleSubmit}
            onToggleListening={() => void startOrStopListening()}
          />

          {presentation && !showOverview && !submitting && !lastFailedRequest ? (
            <ServiceStage
              key={latestTurn.id}
              presentation={presentation}
              onConfirm={() => void submitInput("确认")}
              onCancel={() => void submitInput("取消")}
              onReturnToOverview={() => setShowOverview(true)}
            />
          ) : (
            <IdleOverview
              loading={!initialSyncComplete}
              overview={overview}
              systemState={systemState}
            />
          )}
        </div>

      </main>

      <footer className="voice-demo-footer">
        <span><CircleAlert size={15} />这是护理床的演示界面，不替代专业医疗判断</span>
        <span>语音仅在主动开启后使用 · 记忆仅保留在本次页面</span>
      </footer>

      <DemoGuide
        open={guideOpen}
        onClose={closeGuide}
        onSelect={selectGuideExample}
      />
    </div>
  );
}
