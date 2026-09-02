// 浏览器语音合成（TTS）的轻封装：把助手在对话气泡里的那句口语回复读出来。
// 只读“回复本身”，不读右侧管道阶段、部件名、床边状态或欢迎语——那些是看的，不是听的。
// 设计取向面向卧床/长者：语速略慢、中文嗓音优先；开关常驻顶栏、状态本地持久化。
// 不支持语音合成时全程静默降级，绝不报错打扰。

const STORAGE_KEY = "care-bed-lite.tts-enabled";

export function isTtsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/**
 * 朗读器：读一句、可打断、可静音。
 * 只在开启且浏览器支持时发声；每次 speak 先取消上一段，避免叠读。
 * 首次发声发生在用户提交/说话之后（属于用户手势），因此不受浏览器自动播放限制。
 */
export class Speaker {
  private readonly synth: SpeechSynthesis | null;
  private enabled: boolean;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synth = isTtsSupported() ? window.speechSynthesis : null;
    this.enabled = readEnabled();
    if (this.synth) {
      this.pickVoice();
      // 部分浏览器的嗓音列表是异步就绪的，就绪后再挑一次中文嗓音。
      this.synth.addEventListener?.("voiceschanged", () => this.pickVoice());
    }
  }

  get available(): boolean {
    return this.synth !== null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    writeEnabled(on);
    if (!on) this.cancel();
  }

  /** 读一句话。先取消上一段；空串、静音或不支持时直接跳过。 */
  speak(text: string): void {
    if (!this.synth || !this.enabled) return;
    const clean = text.trim();
    if (!clean) return;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (this.voice) utterance.voice = this.voice;
    this.synth.speak(utterance);
  }

  /** 打断当前朗读：用户开始说话、切到静音、或新一句到来时都会调用。 */
  cancel(): void {
    this.synth?.cancel();
  }

  private pickVoice(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices.length) return;
    // 优先 zh-CN，其次任意中文；都没有则不指定，交给引擎按 lang 选。
    this.voice =
      voices.find((v) => /zh[-_]?cn/i.test(v.lang)) ??
      voices.find((v) => /^zh/i.test(v.lang)) ??
      null;
  }
}

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function writeEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* 忽略：隐私模式下 localStorage 可能不可写 */
  }
}
