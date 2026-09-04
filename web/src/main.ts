import "./styles.css";
import { MODULES, FEATURE_CATALOG, mapIntentWithFallback, parseModelJson, resolveAction, type ModuleId } from "./modules";
import {
  completeIntent,
  GlmNotConfiguredError,
  GlmRequestError,
} from "./glm";
import { Session, type DialogueTurn } from "./session";
import { isSpeechSupported, SpeechInput } from "./speech";
import { Speaker } from "./tts";
import { registerServiceWorker } from "./sw";

const app = document.querySelector<HTMLDivElement>("#app")!;
const session = new Session();
const speech = new SpeechInput();
const speechSupported = isSpeechSupported();
const speaker = new Speaker();

app.innerHTML = `
  <div class="aurora" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand">
      <span class="brand__mark" aria-hidden="true"><img src="/jd_icon.webp" alt="" /></span>
      <span class="brand__text">
        <strong>京东京造 · 智能护理床</strong>
        <span>AI 中控系统</span>
      </span>
    </div>
    <div class="topbar__meta">
      <span class="pill pill--memory" id="memory-count">本次对话 0 条</span>
      <button type="button" class="pill pill--tts" id="tts-toggle" aria-pressed="true" hidden>
        <span class="pill--tts__glyph" aria-hidden="true">🔊</span>
        <span class="pill--tts__label">朗读</span>
      </button>
      <span class="pill pill--mode" id="input-mode"></span>
    </div>
  </header>

  <main class="stage">
    <section class="chat" aria-label="对话">
      <div class="chat__head">
        <strong>对话</strong>
        <span>刷新保留预置对话，清除本次输入</span>
      </div>
      <div class="chat__thread-wrap">
        <div class="chat__thread" id="thread" aria-live="polite"></div>
        <button type="button" class="chat__jump" id="jump-bottom" aria-label="回到最新消息" hidden>
          <span class="chat__jump-glyph" aria-hidden="true">↓</span>
          <span class="chat__jump-label">最新</span>
        </button>
      </div>
      <div class="quick" id="quick-row" aria-label="试着这样说"></div>
      <form class="composer" id="entry-form" autocomplete="off">
        <button type="button" class="mic" id="mic" aria-pressed="false"
          aria-label="点按开始说话，再点一次发送">
          <span class="mic__glyph" aria-hidden="true">🎙</span>
          <span class="mic__wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        </button>
        <input id="entry-input" type="text" aria-label="输入想说的话"
          placeholder="跟我说一句，或在这儿打字" />
        <button type="submit" class="composer__send" id="entry-send">发送</button>
      </form>
      <p class="composer__hint" id="composer-hint" aria-live="polite"></p>
      <p class="composer__scope">可帮您调体位、做照护提醒、联系家人、打理生活琐事；其他需求会请您换个说法。</p>
    </section>

    <section class="pipeline" aria-label="识别与调用流程">
      <div class="pipeline__head">
        <strong>识别与调用</strong>
        <span>语音 → 意图 → 功能 → 组件</span>
      </div>
      <ol class="flow" id="flow"></ol>
      <div class="pipeline__head board__head">
        <strong>床边状态</strong>
        <span>四个子系统的当前状态</span>
      </div>
      <div class="board" id="board" aria-label="床边状态"></div>
    </section>
  </main>
`;

const thread = app.querySelector<HTMLDivElement>("#thread")!;
const jumpBottom = app.querySelector<HTMLButtonElement>("#jump-bottom")!;
const quickRow = app.querySelector<HTMLDivElement>("#quick-row")!;
const flow = app.querySelector<HTMLOListElement>("#flow")!;
const board = app.querySelector<HTMLDivElement>("#board")!;
const entryForm = app.querySelector<HTMLFormElement>("#entry-form")!;
const entryInput = app.querySelector<HTMLInputElement>("#entry-input")!;
const entrySend = app.querySelector<HTMLButtonElement>("#entry-send")!;
const mic = app.querySelector<HTMLButtonElement>("#mic")!;
const composerHint = app.querySelector<HTMLParagraphElement>("#composer-hint")!;
const memoryCount = app.querySelector<HTMLElement>("#memory-count")!;
const inputMode = app.querySelector<HTMLElement>("#input-mode")!;
const ttsToggle = app.querySelector<HTMLButtonElement>("#tts-toggle")!;

// —— 快捷话术：覆盖四个子系统，短语从简，让示例多而不孤零 ——
const QUICK = [
  "把靠背升高一点",
  "帮我把腿抬高",
  "帮我翻个身",
  "十分钟后提醒我吃药",
  "给儿子留个言",
  "上次我留言了什么",
  "今天天气怎么样",
  "播放一段京剧",
];
for (const phrase of QUICK) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "quick__chip";
  chip.textContent = phrase;
  chip.addEventListener("click", () => {
    entryInput.value = phrase;
    entryInput.focus();
  });
  quickRow.appendChild(chip);
}

// —— 右侧流程管道：四段常驻，信号自上而下流过 ——
interface StageDef {
  key: "hear" | "intent" | "match" | "call";
  no: string;
  label: string;
  hint: string;
}
const STAGES: StageDef[] = [
  { key: "hear", no: "1", label: "听清", hint: "捕捉这句话" },
  { key: "intent", no: "2", label: "理解意图", hint: "判断场景与意图" },
  { key: "match", no: "3", label: "匹配功能", hint: "对应到具体功能" },
  { key: "call", no: "4", label: "调用组件", hint: "驱动对应子系统" },
];

const stageEl: Record<StageDef["key"], HTMLLIElement> = {} as never;
const valEl: Record<StageDef["key"], HTMLElement> = {} as never;
const noteEl: Record<StageDef["key"], HTMLElement> = {} as never;

for (const s of STAGES) {
  const li = document.createElement("li");
  li.className = "flow__stage";
  li.dataset.state = "idle";
  li.innerHTML = `
    <span class="flow__no" aria-hidden="true">${s.no}</span>
    <div class="flow__body">
      <span class="flow__label">${s.label}</span>
      <span class="flow__val"></span>
      <span class="flow__note"></span>
    </div>
  `;
  flow.appendChild(li);
  stageEl[s.key] = li;
  valEl[s.key] = li.querySelector<HTMLElement>(".flow__val")!;
  noteEl[s.key] = li.querySelector<HTMLElement>(".flow__note")!;
}

type StageState = "idle" | "loading" | "active" | "muted";
function fillStage(key: StageDef["key"], state: StageState, val: string, note = "") {
  stageEl[key].dataset.state = state;
  valEl[key].textContent = val;
  noteEl[key].textContent = note;
}

// —— 床边状态板：四个子系统的当前状态，命中即更新且长期留存 ——
type BoardModule = Exclude<ModuleId, "unknown">;
interface BoardDef {
  id: BoardModule;
  label: string;
}
const BOARD_CELLS: BoardDef[] = [
  { id: "body", label: "体位" },
  { id: "care", label: "照护" },
  { id: "relationship", label: "家人" },
  { id: "daily", label: "生活" },
];

const boardCell: Record<BoardModule, HTMLDivElement> = {} as never;
const boardVal: Record<BoardModule, HTMLElement> = {} as never;

for (const c of BOARD_CELLS) {
  const cell = document.createElement("div");
  cell.className = "board__cell";
  cell.dataset.module = c.id;
  cell.dataset.state = "idle";
  cell.innerHTML = `
    <span class="board__label">${c.label}</span>
    <span class="board__val"></span>
  `;
  const val = cell.querySelector<HTMLElement>(".board__val")!;
  val.textContent = FEATURE_CATALOG[c.id].idleState;
  board.appendChild(cell);
  boardCell[c.id] = cell;
  boardVal[c.id] = val;
}

function updateBoard(module: BoardModule, state: string) {
  const cell = boardCell[module];
  boardVal[module].textContent = state;
  cell.dataset.state = "filled";
  for (const c of BOARD_CELLS) {
    if (c.id === module) boardCell[c.id].dataset.fresh = "true";
    else delete boardCell[c.id].dataset.fresh;
  }
  if (!prefersReducedMotion()) {
    cell.classList.remove("board__cell--pulse");
    void cell.offsetWidth; // 重启动画
    cell.classList.add("board__cell--pulse");
  }
}

function pipelineReset() {
  delete flow.dataset.module;
  for (const s of STAGES) fillStage(s.key, "idle", s.hint);
}

function pipelineHear(text: string) {
  delete flow.dataset.module;
  fillStage("hear", "active", text);
  fillStage("intent", "loading", "正在理解…");
  fillStage("match", "idle", STAGES[2].hint);
  fillStage("call", "idle", STAGES[3].hint);
}

function pipelineError() {
  fillStage("intent", "muted", "这次没识别成功");
  fillStage("match", "muted", "请再说一次或改用文字");
  fillStage("call", "muted", "组件未调用");
}

// —— 会话线程：微信式一问一答，本身即“存下来的聊天记录” ——
let pendingUser: string | null = null;

function assistantText(turn: DialogueTurn): string {
  if (turn.module === "unknown") return turn.reply || turn.detail;
  const { action } = resolveAction(turn.module, turn.intent, turn.userText);
  return turn.reply || action;
}

function userBubble(text: string): string {
  return `<div class="msg msg--user"><div class="msg__bubble">${escapeHtml(text)}</div></div>`;
}
function botBubble(text: string, module: ModuleId | "welcome"): string {
  return `<div class="msg msg--bot" data-module="${module}">
    <span class="msg__avatar" aria-hidden="true"><img src="/jd_icon.webp" alt="" /></span>
    <div class="msg__bubble">${escapeHtml(text)}</div>
  </div>`;
}
function typingBubble(): string {
  return `<div class="msg msg--bot">
    <span class="msg__avatar" aria-hidden="true"><img src="/jd_icon.webp" alt="" /></span>
    <div class="msg__bubble msg__bubble--typing"><i></i><i></i><i></i></div>
  </div>`;
}
function timeDivider(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `<div class="msg-time" role="separator">${hh}:${mm}</div>`;
}

/** 微信式时间条：首条前显示一次，之后每隔 ≥3 分钟再显示一次。 */
const TIME_DIVIDER_GAP_MS = 3 * 60 * 1000;

function renderThread() {
  const turns = session.history;
  const userTurns = turns.filter((t) => !t.id.startsWith("seed-"));
  memoryCount.textContent = `本次对话 ${userTurns.length} 条`;
  const parts: string[] = [];
  if (!turns.length && !pendingUser) {
    parts.push(`<div class="chat__empty">
      <span class="chat__empty-mark" aria-hidden="true"><img src="/jd_icon.webp" alt="" /></span>
      <p class="chat__empty-title">您好，我在这儿</p>
      <p class="chat__empty-sub">说一句，或直接打字都行<br/>调体位、做提醒、联系家人、打理生活琐事<br/>都可以交给我</p>
    </div>`);
  }
  let lastShownAt = 0;
  for (const turn of turns) {
    if (turn.at - lastShownAt >= TIME_DIVIDER_GAP_MS) {
      parts.push(timeDivider(turn.at));
      lastShownAt = turn.at;
    }
    parts.push(userBubble(turn.userText));
    parts.push(botBubble(assistantText(turn), turn.module));
  }
  if (pendingUser) {
    const now = Date.now();
    if (now - lastShownAt >= TIME_DIVIDER_GAP_MS) parts.push(timeDivider(now));
    parts.push(userBubble(pendingUser));
    parts.push(typingBubble());
  }
  // 用户刚发话（pendingUser）或本就贴着底部时，跟到最新；否则保持用户当前阅读位置。
  const stick = pendingUser !== null || isNearBottom();
  thread.innerHTML = parts.join("");
  if (stick) scrollToBottom(false);
  else syncJumpButton();
}

// —— 滚动到底按钮：读旧消息时不打扰，有新消息在上方时提示回到最新 ——
const NEAR_BOTTOM_PX = 80;
function isNearBottom(): boolean {
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight <= NEAR_BOTTOM_PX;
}
function syncJumpButton(): void {
  jumpBottom.hidden = isNearBottom();
}
function scrollToBottom(smooth: boolean): void {
  thread.scrollTo({
    top: thread.scrollHeight,
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
  });
  jumpBottom.hidden = true;
}
thread.addEventListener("scroll", syncJumpButton, { passive: true });
jumpBottom.addEventListener("click", () => scrollToBottom(true));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// beat2 归类 → beat3 匹配功能 → 调用组件
async function renderResult(turn: DialogueTurn) {
  if (turn.module === "unknown") {
    fillStage("intent", "muted", "未识别", "换个说法试试");
    fillStage("match", "muted", "未匹配到具体功能");
    fillStage("call", "muted", "请换个说法");
    return;
  }

  const title = MODULES.find((m) => m.id === turn.module)?.title ?? "";
  flow.dataset.module = turn.module;
  fillStage("intent", "active", title, turn.intent);
  await delay(prefersReducedMotion() ? 0 : 400);

  const { feature, action, component, state } = resolveAction(turn.module, turn.intent, turn.userText);
  fillStage("match", "active", feature || "综合调度");
  await delay(prefersReducedMotion() ? 0 : 220);
  fillStage("call", "active", component, `✓ ${action}`);
  updateBoard(turn.module, state);
}

// —— 主流程：一句话 → 一次大模型 → 路由到模块 + 预写反馈 ——
let busy = false;

async function handleUtterance(text: string) {
  const clean = text.trim();
  if (!clean || busy) return;
  busy = true;
  entrySend.disabled = true;
  composerHint.textContent = "";

  pendingUser = clean;
  renderThread();
  pipelineHear(clean);

  try {
    const messages = session.buildMessages(clean);
    const content = await completeIntent(messages);
    const mapped = mapIntentWithFallback(parseModelJson(content), clean);
    const turn = session.record(clean, mapped);
    await renderResult(turn);
    pendingUser = null;
    renderThread();
    // 成功才清空输入框。
    entryInput.value = "";
    // 只读对话气泡里的这句口语回复；管道阶段、部件名、床边状态不朗读。
    speaker.speak(assistantText(turn));
  } catch (error) {
    pendingUser = null;
    renderThread();
    pipelineError();
    // 出错不吞话：把这句原样放回输入框，长者/护理者按一下发送即可重试，不必重打。
    // 聚焦会呼起移动端软键盘，故不 focus，交由用户自行点输入框重试。
    entryInput.value = clean;
    if (error instanceof GlmNotConfiguredError) {
      composerHint.textContent = "还没有配置 Gemini API Key，请联系部署者通过环境变量注入。";
    } else if (error instanceof GlmRequestError) {
      composerHint.textContent = error.message;
    } else {
      composerHint.textContent = "出了点问题，请再试一次。";
    }
  } finally {
    busy = false;
    entrySend.disabled = false;
  }
}

// —— 语音开关（融入输入条的按键，而非悬浮光球）——
function setListening(on: boolean) {
  mic.dataset.listening = String(on);
  mic.setAttribute("aria-pressed", String(on));
  composerHint.textContent = on ? "正在听…再点一次发送" : "";
}

function toggleListening() {
  if (busy) return;
  if (!speechSupported) {
    composerHint.textContent = "当前浏览器不支持语音，请直接打字";
    return;
  }
  if (speech.listening) {
    speech.stop();
    return;
  }
  jsMicStart();
}

// —— 麦克风点按收音（移动端核心交互）——
// 点一下＝开始收音（进入 listening），再点一下＝结束并发送。相比长按，
// 点按在触屏上不易脱手，也不会在识别尚未出最终稿时就被松手截断。
// 桌面与移动端统一走 click，不再引用 touch/mouse 长按序列。
function jsMicStart() {
  if (busy || speech.listening) return;
  speaker.cancel();
  const started = speech.start({
    onInterim: (t) => {
      if (t) composerHint.textContent = `“${t}”`;
    },
    onFinal: (t) => {
      setListening(false);
      void handleUtterance(t);
    },
    onError: (message) => {
      setListening(false);
      if (message) {
        composerHint.textContent = message;
      }
    },
    onEnd: () => setListening(false),
  });
  if (started) setListening(true);
}

function jsMicStop() {
  if (speech.listening) speech.stop();
}

// 点按切换：未在听时点＝开始收音；正在听时点＝结束并发送。
// 单击即触发，绝不调用输入框 focus，避免移动端呼起软键盘打断收音。
mic.addEventListener("click", () => {
  if (busy) return;
  if (speech.listening) {
    jsMicStop();
    return;
  }
  if (!speechSupported) {
    composerHint.textContent = "当前浏览器不支持语音，请直接打字";
    return;
  }
  jsMicStart();
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleUtterance(entryInput.value);
});

// 空格键 = 点按收音：按下开始（走 toggleListening），再按一次结束并发送。
// 焦点在输入类控件时不拦截，避免打字时空格被抢。
let spacePressed = false;
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
    return;
  }
  event.preventDefault();
  if (spacePressed) return;
  spacePressed = true;
  toggleListening(); // 开始收音（内部会走 jsMicStart）
});
document.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  if (!spacePressed) return;
  spacePressed = false;
  toggleListening(); // 再按一次＝结束并发送
});


// —— 朗读开关：顶栏常驻，状态本地持久化，不支持时整枚隐藏 ——
const ttsGlyph = ttsToggle.querySelector<HTMLElement>(".pill--tts__glyph")!;
const ttsLabel = ttsToggle.querySelector<HTMLElement>(".pill--tts__label")!;
function syncTts() {
  const on = speaker.isEnabled;
  ttsToggle.setAttribute("aria-pressed", String(on));
  ttsGlyph.textContent = on ? "🔊" : "🔇";
  ttsLabel.textContent = on ? "朗读" : "静音";
  ttsToggle.title = on ? "正在朗读回复，点此静音" : "已静音，点此恢复朗读";
}
ttsToggle.addEventListener("click", () => {
  speaker.setEnabled(!speaker.isEnabled);
  syncTts();
});

// —— 初始化 ——
inputMode.textContent = speechSupported ? "语音 + 文字" : "仅文字输入";
if (speaker.available) {
  ttsToggle.hidden = false;
  syncTts();
}
pipelineReset();
renderThread();
registerServiceWorker();
