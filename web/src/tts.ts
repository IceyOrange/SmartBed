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
    // 按句末标点切成小句，逐句排队朗读：句与句之间自带一个自然停顿，
    // 比把整段塞进一个 utterance 更有“断句”的呼吸感（用户反馈原声偏“呆”）。
    for (const sentence of splitSentences(clean)) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "zh-CN";
      // 面向长者：语速略慢显得从容；音高持平，避免 SAPI 老嗓音拔高发尖。
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (this.voice) utterance.voice = this.voice;
      this.synth.speak(utterance);
    }
  }

  /** 打断当前朗读：用户开始说话、切到静音、或新一句到来时都会调用。 */
  cancel(): void {
    this.synth?.cancel();
  }

  private pickVoice(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices().filter((v) => /^zh/i.test(v.lang));
    if (!voices.length) return;
    // 只在中文嗓音里择优：真机 Chrome 常有“Google 普通话（中国大陆）”这类网络神经嗓音，
    // 明显比本地 SAPI 老嗓音自然；本自动化环境只有微软本地嗓音时则退而求其次挑较不生硬的。
    this.voice = voices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
  }
}

/** 给中文嗓音打分：分越高越自然。用于在设备实际可用的嗓音里择优。 */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  let score = 0;
  // 网络/神经嗓音最自然：Google 普通话、Edge 的 Xiaoxiao/Yunxi 等。
  if (name.includes("google")) score += 100;
  if (/(xiaoxiao|xiaoyi|yunxi|yunyang|yunjian|晓晓|云希)/i.test(v.name)) score += 90;
  // Apple 的中文嗓音（Tingting/Meijia/Sinji）也较自然。
  if (/(tingting|ting-ting|meijia|mei-jia|sinji|婷婷|美佳)/i.test(v.name)) score += 60;
  // 微软本地三支里，Yaoyao 比默认的 Huihui/Kangkang 略柔和。
  if (/(yaoyao|遥遥)/i.test(v.name)) score += 20;
  // 网络嗓音（非本地）通常更新更自然，作次要加权。
  if (!v.localService) score += 30;
  // 简中优先。
  if (/zh[-_]?cn/i.test(v.lang)) score += 10;
  return score;
}

/**
 * 按句末标点（。！？；及换行）切句，保留短句完整、去掉空白片段。
 * 没有句末标点时原样返回单句，绝不吞字。
 */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？；!?;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
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
