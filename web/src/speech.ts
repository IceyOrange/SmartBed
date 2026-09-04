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
function isFinalResult(r: SpeechRecognitionResult): boolean {
  // 只有 isFinal=true 才是定稿。长按场景里，中间结果每来一个字就触发一次 onresult，
  // 若把“有文本”当成定稿，第一个字（如“帮”）就被当成整句发出去了。
  // 真正的收尾由“松手 stop”驱动：stop 后浏览器会把累积的话作为最终结果回吐。
  return r.isFinal === true;
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
const LISTENING_TIMEOUT_MS = 8000; // 进入 listening 后无任何识别结果就自动收尾并提示
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
  /** 进入 listening 后无结果即收尾，防“一直卡在识别样式”。 */
  private listeningTimer: number | null = null;
  /** 长按收音时，松手会主动 stop；期间每段中间结果都记进这里供回显。 */
  private interimBuf = "";

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
    this.interimBuf = "";
    return this.arm();
  }

  stop(): void {
    this.stopping = true;
    this.recognition?.stop();
  }

  /** 松手后把最后一段中间结果也保留，避免 final 短暂丢失。 */
  pendingInterim(): string {
    return this.interimBuf;
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
      this.listenTimer();
    };

    recognition.onresult = (event) => {
      this.clearStartTimer();
      this.clearListenTimer();
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (isFinalResult(result)) {
          // 拼出本次最终稿：把 event.results 里所有定稿段（含最终那个）串起来，
          // 多段连续模式下结果可能分片，需合并而非只取第一段。
          const pieces: string[] = [];
          for (let j = 0; j < event.results.length; j += 1) {
            const r = event.results[j];
            const t = r[0]?.transcript ?? "";
            if (t) pieces.push(t);
          }
          const finalText = pieces.join("").trim();
          if (finalText && !this.gotFinal) {
            this.gotFinal = true;
            this.stopping = true;
            this.callbacks?.onFinal(finalText);
            this.finish();
            return;
          }
        }
      }
      // 中间结果：合并当前这一段的 interim，回显给 UI，并留档供松手兜底。
      const interim = event.results[event.results.length - 1]?.[0]?.transcript ?? "";
      if (interim.trim()) {
        this.interimBuf = interim.trim();
        this.callbacks?.onInterim(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error] ?? "语音识别出错了，请改用文字输入。";
      if (message) this.callbacks?.onError(message);
    };

    // 兜底：如果识别器一直既不 onstart 也不 onend，可能卡在未知状态。
    recognition.onend = () => {
      this.clearStartTimer();
      this.clearListenTimer();
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
    this.clearListenTimer();
    this.active = false;
    this.recognition = null;
    const cb = this.callbacks;
    this.callbacks = null;
    const buf = this.interimBuf;
    this.interimBuf = "";
    cb?.onEnd();
    // 松手收尾时，若浏览器最终稿没回吐完整，用已记下的中间稿兜底，
    // 避免把整句吞掉。这里在 onEnd 之后补发，保证 gotFinal 状态已定。
    if (buf && !this.gotFinal) {
      cb?.onFinal?.(buf);
    }
  }

  private clearStartTimer(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  /** 进入 listening 后开一个“无结果即收尾”的看门狗；有任何结果/结束/出错都会被清除。 */
  private listenTimer(): void {
    this.clearListenTimer();
    this.listeningTimer = window.setTimeout(() => {
      this.listeningTimer = null;
      // 只在真正「在听却一个字都没收到」时收尾，不打断正常识别。
      if (this.active && !this.gotFinal) {
        this.stopping = true;
        try {
          this.recognition?.stop();
        } catch {
          /* 忽略 */
        }
        this.callbacks?.onError("没有听到声音，请再试一次。");
        this.finish();
      }
    }, LISTENING_TIMEOUT_MS);
  }

  private clearListenTimer(): void {
    if (this.listeningTimer !== null) {
      window.clearTimeout(this.listeningTimer);
      this.listeningTimer = null;
    }
  }
}