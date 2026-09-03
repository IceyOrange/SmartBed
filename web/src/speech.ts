// Web Speech API 的最小类型声明（TS DOM lib 未内置）。
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface SpeechCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "麦克风被拒绝了，请在浏览器地址栏允许麦克风后重试。",
  "service-not-allowed": "这个浏览器用不了语音识别，直接打字就行，效果一样。",
  "no-speech": "没有听到声音，请再试一次。",
  // network：多见于 Arc 等屏蔽了语音识别中转服务的 Chromium 浏览器，重试也无效，
  // 直接引导到打字（文字输入始终可用）。
  network: "这个浏览器用不了语音识别，直接打字就行，效果一样。",
  aborted: "",
};

const START_TIMEOUT_MS = 5000; // 守护 start() 到 onstart 之间的静默卡死
const SILENCE_TIMEOUT_MS = 6000; // onstart 后一直没收到话：先静默重启，仍无声才收尾
const MAX_RESTARTS = 2; // 累计静默/提前收尾后允许的无感重启次数，防无限循环

/**
 * 浏览器中文语音识别的轻封装。连续监听以更稳地接住声音，
 * 拿到最终结果后主动 stop（应用每次只认一句）；中间与最终结果分别回传。
 * 不支持时由调用方回退到文字输入。
 */
export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private callbacks: SpeechCallbacks | null = null;
  private gotFinal = false;
  /** 用户主动 stop（区别于浏览器自行收尾），此时 onend 应直接收尾、不再重启。 */
  private stopping = false;
  private restarts = 0;
  private startTimer: number | null = null;
  private silenceTimer: number | null = null;

  get listening(): boolean {
    return this.active;
  }

  start(callbacks: SpeechCallbacks): boolean {
    if (!getRecognitionCtor()) return false;
    if (this.active) return true;
    this.callbacks = callbacks;
    this.gotFinal = false;
    this.stopping = false;
    this.restarts = 0;
    return this.arm();
  }

  stop(): void {
    this.stopping = true;
    this.recognition?.stop();
  }

  private arm(): boolean {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    // 连续监听：单次(non-continuous)在部分 Chromium 下会“明明在听却收不到”或提前收尾；
    // 改成连续后由我们拿到最终结果再主动 stop，更可靠。
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.active = true;
      this.clearStartTimer();
      this.armSilenceTimer();
    };

    recognition.onresult = (event) => {
      this.resetSilenceTimer();
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          // 只认第一次最终结果，避免连续模式下多段 final 重复回调。
          if (finalText && !this.gotFinal) {
            this.gotFinal = true;
            this.callbacks?.onFinal(finalText);
          }
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) this.callbacks?.onInterim(interim.trim());
      if (this.gotFinal) this.stop();
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error] ?? "语音识别出错了，请改用文字输入。";
      if (message) this.callbacks?.onError(message);
    };

    // 所有终止路径都汇聚到此：拿到话、用户主动停、或重启次数耗尽后收尾。
    // 仍在听、又没拿到话时，浏览器可能自行收尾——静默重启一次把声音接住。
    recognition.onend = () => {
      this.clearStartTimer();
      this.clearSilenceTimer();
      if (this.gotFinal || this.stopping || !this.active) {
        this.finish();
        return;
      }
      this.restarts += 1;
      if (this.restarts > MAX_RESTARTS) {
        this.callbacks?.onError("没有听到声音，请再试一次。");
        this.finish();
        return;
      }
      this.arm();
    };

    this.recognition = recognition;
    try {
      recognition.start();
      this.startTimer = window.setTimeout(() => {
        this.startTimer = null;
        if (this.active) return; // 已正常 onstart
        try {
          recognition.abort();
        } catch {
          /* 忽略：abort 失败不影响状态复位 */
        }
        this.callbacks?.onError("麦克风没有响应，请检查权限或改用文字输入。");
        this.finish();
      }, START_TIMEOUT_MS);
      return true;
    } catch {
      this.finish();
      this.callbacks?.onError("无法启动语音识别，请改用文字输入。");
      return false;
    }
  }

  private finish(): void {
    this.clearStartTimer();
    this.clearSilenceTimer();
    this.active = false;
    this.recognition = null;
    const cb = this.callbacks;
    this.callbacks = null;
    cb?.onEnd();
  }

  /** onstart 后一直收不到话的兜底：清掉当前识别，交给 onend 决定重启或收尾。 */
  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null;
      if (this.gotFinal || this.stopping) return;
      try {
        this.recognition?.abort();
      } catch {
        /* 忽略 */
      }
    }, SILENCE_TIMEOUT_MS);
  }

  /** 每收到一次结果就重新计静默时长，给说话中的自然停顿留出余量。 */
  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.active) this.armSilenceTimer();
  }

  private clearStartTimer(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}