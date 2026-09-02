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
  "service-not-allowed": "麦克风被系统拒绝了，请检查隐私设置。",
  "no-speech": "没有听到声音，请再试一次。",
  network: "语音识别网络异常，请稍后再试。",
  aborted: "",
};

/**
 * 浏览器中文语音识别的轻封装。识别一句（非连续），
 * 把中间结果与最终结果分别回传；不支持时由调用方回退到文字输入。
 */
export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  /** 启动看门狗计时器句柄；仅守护 start() 到 onstart 之间的静默卡死。 */
  private startTimer: number | null = null;

  get listening(): boolean {
    return this.active;
  }

  start(callbacks: SpeechCallbacks): boolean {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    if (this.active) return true;

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // 三条终止路径（onend / 启动超时 / 未来任何清理）都汇聚到这里，只执行一次，
    // 避免重复回调，也确保界面永远能从“正在听”里退出来。
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (this.startTimer !== null) {
        window.clearTimeout(this.startTimer);
        this.startTimer = null;
      }
      this.active = false;
      this.recognition = null;
      callbacks.onEnd();
    };

    recognition.onstart = () => {
      this.active = true;
      // 已真正进入监听，撤掉启动看门狗；此后静默由 no-speech 等原生事件收尾。
      if (this.startTimer !== null) {
        window.clearTimeout(this.startTimer);
        this.startTimer = null;
      }
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) callbacks.onFinal(finalText);
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) callbacks.onInterim(interim.trim());
    };
    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error] ?? "语音识别出错了，请改用文字输入。";
      if (message) callbacks.onError(message);
    };
    recognition.onend = () => {
      finish();
    };

    this.recognition = recognition;
    try {
      recognition.start();
      // 启动看门狗：某些环境下 start() 既不触发 onstart 也不报错、不结束，
      // 界面会永远卡在“正在听”。给 5 秒兜底：还没进入监听就强制收尾并提示。
      this.startTimer = window.setTimeout(() => {
        this.startTimer = null;
        if (this.active) return; // 已正常 onstart，无需兜底
        try {
          recognition.abort();
        } catch {
          /* 忽略：abort 失败不影响下面的状态复位 */
        }
        callbacks.onError("麦克风没有响应，请检查权限或改用文字输入。");
        finish();
      }, 5000);
      return true;
    } catch {
      finish();
      callbacks.onError("无法启动语音识别，请改用文字输入。");
      return false;
    }
  }

  stop(): void {
    this.recognition?.stop();
  }
}
