# 护理床端侧语音交互演示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有家属端旁新增一个独立、高保真的床侧语音交互演示页，支持浏览器麦克风识别、文本兜底、四类能力意图识别、上下文承接、安全确认和模拟执行反馈。

**Architecture:** 使用 Vite 多页面构建：家属端继续由 `index.html` 启动，床侧演示由 `voice-demo.html` 独立启动。浏览器输入统一转换为文本，再交给无浏览器依赖的纯 TypeScript 意图引擎与会话编排器；React 页面只负责展示状态、触发输入和呈现结构化结果。

**Tech Stack:** React 19、TypeScript 5.7、Vite 6、Vitest、Testing Library、Web Speech Recognition API、Lucide React。

**Spec:** `app/docs/superpowers/specs/2026-08-31-bedside-voice-demo-design.md`

## Global Constraints

- 页面只模拟执行，不连接真实护理床、联系人、护理系统、天气或媒体服务。
- 家属端只提供新标签页链接，不增加第四个底部导航，不开放远程床控。
- 所有麦克风转写、文本输入和示例话术必须经过同一个意图引擎。
- “停止”优先级最高，“应急呼叫”次高，二者不得被普通意图覆盖。
- 床体复位和明显大幅动作必须二次确认，小幅微调可直接模拟执行。
- 医疗诊断、药量和医嘱判断必须拒绝，不伪装成医疗建议。
- 浏览器不支持或拒绝麦克风权限时，文本输入和示例话术必须继续可用。
- 所有成功状态必须带“模拟”语义，不得显示为真实设备已执行。
- 不新增后端、路由库、状态管理库或语音依赖。
- 当前目录不是 Git 仓库，不执行提交操作。

## File Structure

- Create `app/src/voice-demo/types.ts`: 意图、槽位、会话状态和 Agent 结果的公共类型。
- Create `app/src/voice-demo/intentCatalog.ts`: 四大功能域、意图元数据、示例话术和匹配词典。
- Create `app/src/voice-demo/intentEngine.ts`: 文本标准化、优先级判定、意图评分和槽位抽取。
- Create `app/src/voice-demo/intentEngine.test.ts`: 意图覆盖、优先级、参数和低置信度测试。
- Create `app/src/voice-demo/demoAgent.ts`: 上下文承接、确认、拒绝与模拟响应编排。
- Create `app/src/voice-demo/demoAgent.test.ts`: 连续指令、确认、应急、通话和媒体状态测试。
- Create `app/src/voice-demo/useSpeechRecognition.ts`: Web Speech API 能力检测、监听生命周期与错误降级。
- Create `app/src/voice-demo/VoiceDemoApp.tsx`: 床侧演示页主界面和交互状态。
- Create `app/src/voice-demo/VoiceDemoApp.test.tsx`: 文本兜底、示例、确认和不支持麦克风测试。
- Create `app/src/voice-demo/main.tsx`: 独立 React 入口。
- Create `app/src/voice-demo/voice-demo.css`: 床旁终端视觉和响应式样式。
- Create `app/voice-demo.html`: 独立页面 HTML 与元信息。
- Modify `app/src/screens/ProfileScreen.tsx`: 增加新标签页演示链接。
- Modify `app/src/App.test.tsx`: 验证演示链接的地址和打开方式。
- Modify `app/vite.config.ts`: 将两个 HTML 页面加入生产构建入口。
- Modify `app/README.md`: 增加演示页地址、浏览器权限与部署说明。

---

### Task 0: 生成并确认完整视觉概念

**Files:**
- Create outside repo: one desktop concept at `1440×1000` and one narrow-screen concept at `390×844` in the configured visualization directory.
- Reference: `app/src/styles.css` and the existing family-app screenshots for palette, radii and icon weight.

**Interfaces:**
- Produces: the accepted visual reference used by Task 4.
- Consumes: the approved written spec and the existing family-app design language.

- [ ] **Step 1: Generate the complete desktop concept**

Use Image Gen to render the full bedside page, not an isolated hero. Require the top status bar, voice orb and microphone, text fallback, four-domain capability map, current conversation, expandable Agent understanding, processing rail, recent turns and simulation disclaimer. Use the exact palette and layout constraints from Task 4.

- [ ] **Step 2: Generate the narrow-screen companion concept**

Create a separate native `390×844` composition showing the first viewport and interaction hierarchy after the two-column desktop layout collapses. Keep microphone, text input and current response visible without overlapping fixed controls.

- [ ] **Step 3: Inspect both concepts at native size**

Use `view_image` on each output. Reject and regenerate any concept with illegible Chinese, missing text fallback, hidden disclaimer, generic dashboard styling, excessive pills, clipped content or a visual implication that real hardware is connected.

- [ ] **Step 4: Present the concept for approval**

Show both concepts and describe the extracted design tokens, layout hierarchy and any deliberate differences from the family App. Do not begin Task 1 production code until the user approves the visual direction.

---

### Task 1: 定义意图模型与规则识别

**Files:**
- Create: `app/src/voice-demo/types.ts`
- Create: `app/src/voice-demo/intentCatalog.ts`
- Create: `app/src/voice-demo/intentEngine.ts`
- Test: `app/src/voice-demo/intentEngine.test.ts`

**Interfaces:**
- Produces: `recognizeIntent(text: string, context?: RecognitionContext): IntentMatch`
- Produces: `VOICE_DOMAINS: VoiceDomainDefinition[]`
- Produces: `VOICE_EXAMPLES: VoiceExample[]`
- Consumes: no React or browser globals.

- [ ] **Step 1: Write failing tests for safety priority and all four domains**

```ts
import { describe, expect, it } from "vitest";
import { recognizeIntent } from "./intentEngine";

describe("recognizeIntent", () => {
  it.each([
    ["把靠背升高一点", "body", "bed.back.adjust"],
    ["晚上八点提醒我吃药", "care", "care.reminder.create"],
    ["给女儿打个电话", "relationship", "relation.call.start"],
    ["播放一段京剧", "daily", "daily.media.play"],
  ])("recognizes %s", (text, domain, intent) => {
    const result = recognizeIntent(text);
    expect(result.domain).toBe(domain);
    expect(result.intent).toBe(intent);
    expect(result.confidence).not.toBe("low");
  });

  it("prioritizes emergency stop over a normal bed command", () => {
    const result = recognizeIntent("靠背升起来，不对，马上停下");
    expect(result.intent).toBe("bed.stop");
  });

  it("prioritizes emergency help over ordinary conversation", () => {
    const result = recognizeIntent("别讲故事了，救命，快叫护理员");
    expect(result.intent).toBe("care.emergency");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:run -- src/voice-demo/intentEngine.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `./intentEngine` does not exist.

- [ ] **Step 3: Define stable public types**

Create the exact unions and result shape in `types.ts`:

```ts
export type VoiceDomain = "body" | "care" | "relationship" | "daily" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type SafetyLevel = "immediate" | "confirm" | "standard" | "restricted";

export type IntentId =
  | "bed.stop"
  | "bed.back.adjust"
  | "bed.legs.adjust"
  | "bed.height.adjust"
  | "bed.scene"
  | "bed.reset"
  | "bed.continue"
  | "care.reminder.create"
  | "care.record.create"
  | "care.record.query"
  | "care.emergency"
  | "care.todo.query"
  | "care.todo.update"
  | "relation.call.start"
  | "relation.call.answer"
  | "relation.call.end"
  | "relation.message.play"
  | "relation.message.create"
  | "relation.anniversary.query"
  | "relation.anniversary.greet"
  | "daily.schedule.query"
  | "daily.weather.query"
  | "daily.note.create"
  | "daily.note.query"
  | "daily.chat"
  | "daily.media.play"
  | "daily.media.control"
  | "medical.restricted"
  | "conversation.confirm"
  | "conversation.cancel"
  | "unknown";

export interface IntentSlots {
  bodyPart?: "back" | "legs" | "bed";
  direction?: "up" | "down" | "flat" | "stop";
  amount?: "small" | "large";
  angle?: number;
  scene?: "meal" | "watch-tv" | "sleep";
  contact?: string;
  timeExpression?: string;
  item?: string;
  content?: string;
  mediaAction?: "play" | "pause" | "resume" | "next" | "volume-up" | "volume-down";
}

export interface RecognitionContext {
  lastBedIntent?: IntentId;
  pendingIntent?: IntentId;
  activeCall?: boolean;
  activeMedia?: boolean;
}

export interface IntentMatch {
  rawText: string;
  normalizedText: string;
  domain: VoiceDomain;
  intent: IntentId;
  label: string;
  confidence: Confidence;
  score: number;
  slots: IntentSlots;
  safety: SafetyLevel;
  route: "rules" | "skill" | "dialogue";
  alternatives: IntentId[];
}
```

- [ ] **Step 4: Implement catalog-driven scoring and slot extraction**

Implement `intentCatalog.ts` with one metadata entry per `IntentId`. Each entry contains `domain`, `label`, `strongPatterns`, `keywords`, `safety`, `route`, and two or more `examples` for visible features. Hoist all regular expressions to module scope.

Implement `recognizeIntent` with this exact order:

```ts
const stopMatch = matchEmergencyStop(normalizedText);
if (stopMatch) return stopMatch;

const emergencyMatch = matchEmergencyHelp(normalizedText);
if (emergencyMatch) return emergencyMatch;

const confirmationMatch = matchPendingConfirmation(normalizedText, context);
if (confirmationMatch) return confirmationMatch;

const activeControlMatch = matchActiveControl(normalizedText, context);
if (activeControlMatch) return activeControlMatch;

const scored = scoreCatalog(normalizedText, context);
return resolveScoredMatch(scored, normalizedText);
```

Extract angles from `30度`, relative time from `十分钟后`, clock time from `晚上八点`, contacts following `给/联系/找`, and direction/amount from `一点/一些/大幅/最高/最低/放平`.

- [ ] **Step 5: Add synonym, ambiguity and restricted-medical tests**

Add table tests covering at least two phrasings for every visible capability. Include these assertions:

```ts
expect(recognizeIntent("我该吃几片降压药").intent).toBe("medical.restricted");
expect(recognizeIntent("帮我打电话").confidence).toBe("low");
expect(recognizeIntent("再高一点", { lastBedIntent: "bed.back.adjust" }).slots.bodyPart).toBe("back");
expect(recognizeIntent("声音小一点", { activeMedia: true }).intent).toBe("daily.media.control");
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: all `intentEngine` tests pass with no warnings.

---

### Task 2: 编排上下文、安全确认与模拟响应

**Files:**
- Create: `app/src/voice-demo/demoAgent.ts`
- Test: `app/src/voice-demo/demoAgent.test.ts`
- Modify: `app/src/voice-demo/types.ts`

**Interfaces:**
- Consumes: `recognizeIntent(text, context)` from Task 1.
- Produces: `createDemoSession(): DemoSessionState`
- Produces: `processDemoInput(state: DemoSessionState, text: string, now?: Date): DemoAgentResult`

- [ ] **Step 1: Write failing tests for conversation state**

```ts
it("asks for confirmation before resetting and executes after confirmation", () => {
  const first = processDemoInput(createDemoSession(), "把床全部放平");
  expect(first.turn.status).toBe("awaiting-confirmation");
  expect(first.state.pendingAction?.intent).toBe("bed.reset");

  const second = processDemoInput(first.state, "确认");
  expect(second.turn.status).toBe("simulated-complete");
  expect(second.state.pendingAction).toBeUndefined();
});

it("inherits the latest bed-control context", () => {
  const first = processDemoInput(createDemoSession(), "靠背升高一点");
  const second = processDemoInput(first.state, "再高一点");
  expect(second.turn.match.intent).toBe("bed.back.adjust");
  expect(second.turn.match.slots.bodyPart).toBe("back");
});

it("lets stop interrupt a pending confirmation", () => {
  const pending = processDemoInput(createDemoSession(), "把床全部放平");
  const stopped = processDemoInput(pending.state, "马上停下");
  expect(stopped.turn.match.intent).toBe("bed.stop");
  expect(stopped.state.pendingAction).toBeUndefined();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm run test:run -- src/voice-demo/demoAgent.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the conversation module does not exist.

- [ ] **Step 3: Add the session and turn contracts**

```ts
export type TurnStatus =
  | "clarifying"
  | "awaiting-confirmation"
  | "simulating"
  | "simulated-complete"
  | "information"
  | "restricted";

export interface PendingAction {
  intent: IntentId;
  match: IntentMatch;
  prompt: string;
}

export interface DemoSessionState {
  lastBedIntent?: IntentId;
  pendingAction?: PendingAction;
  activeCall: boolean;
  activeMedia: boolean;
  turns: DemoTurn[];
}

export interface DemoTurn {
  id: string;
  userText: string;
  response: string;
  status: TurnStatus;
  match: IntentMatch;
  simulatedAction?: string;
  stages: Array<{ label: string; detail: string; state: "done" | "active" | "blocked" }>;
  createdAt: string;
}
```

- [ ] **Step 4: Implement deterministic response handlers**

Use a handler map keyed by `IntentId`, not a large React-side switch. Each handler returns a concise spoken response and optional state patch. Include concrete demo data:

- 今日护理：`08:30 早餐后服药（已确认）`、`14:00 翻身护理（待确认）`、`16:30 腿部康复训练`；
- 天气：`杭州，今天多云，23 至 29 摄氏度`，始终附“演示天气”；
- 纪念日：`本周六是外孙女安安的生日`；
- 留言：`女儿今天 10:20 留下一条 38 秒语音`；
- 媒体：`京剧精选`、`昨天的有声书`；
- 通话联系人：从槽位读取，缺少联系人时返回澄清而不执行。

Confirmation and cancel handling must consume `pendingAction`. Emergency stop and emergency help must clear pending state. Medical requests must return `restricted` and no `simulatedAction`.

- [ ] **Step 5: Add tests for reminders, calls, media, ambiguity and refusal**

Verify these behaviors:

```ts
expect(processDemoInput(state, "十分钟后提醒我喝水").turn.match.slots.timeExpression).toBe("十分钟后");
expect(processDemoInput(state, "给女儿打电话").state.activeCall).toBe(true);
expect(processDemoInput(callingState, "挂断").state.activeCall).toBe(false);
expect(processDemoInput(state, "播放京剧").state.activeMedia).toBe(true);
expect(processDemoInput(state, "帮我打电话").turn.status).toBe("clarifying");
expect(processDemoInput(state, "把药量加一倍").turn.status).toBe("restricted");
```

- [ ] **Step 6: Run Task 1 and Task 2 tests together**

Run:

```powershell
npm run test:run -- src/voice-demo/intentEngine.test.ts src/voice-demo/demoAgent.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all focused tests pass.

---

### Task 3: 封装浏览器语音识别与文本降级

**Files:**
- Create: `app/src/voice-demo/useSpeechRecognition.ts`
- Modify: `app/src/voice-demo/types.ts`
- Test through: `app/src/voice-demo/VoiceDemoApp.test.tsx` in Task 4.

**Interfaces:**
- Produces: `useSpeechRecognition(options): SpeechRecognitionController`
- Produces: `SpeechStatus = "unsupported" | "idle" | "requesting" | "listening" | "processing" | "error"`
- Consumes: callback `onFinalTranscript(text: string)`.

- [ ] **Step 1: Define minimal browser interfaces locally**

Do not add a package for browser speech types. Define only fields used by the hook:

```ts
interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
```

Resolve `window.SpeechRecognition ?? window.webkitSpeechRecognition` inside a lazy initializer so tests and SSR-like environments do not fail at module import.

- [ ] **Step 2: Implement lifecycle and error mapping**

The hook must:

- set `lang = "zh-CN"`, `continuous = false`, `interimResults = true`;
- expose final and interim transcript separately;
- map `not-allowed` and `service-not-allowed` to “麦克风权限未开启，请使用文字输入或在浏览器设置中允许麦克风”；
- map `no-speech` to “没有听清，请再说一次或使用文字输入”；
- preserve the latest transcript when an error occurs;
- abort the recognition instance on component unmount;
- expose `focusTextFallback` so the component can focus its textarea after an error.

- [ ] **Step 3: Keep speech output optional and non-blocking**

Add a small `speakResponse(text: string)` helper using `window.speechSynthesis` when available. Cancel previous demo speech before speaking a new response. Missing speech synthesis must not affect visual responses or tests.

---

### Task 4: 构建床侧语音演示 React 页面

**Files:**
- Create: `app/src/voice-demo/VoiceDemoApp.tsx`
- Create: `app/src/voice-demo/VoiceDemoApp.test.tsx`
- Create: `app/src/voice-demo/voice-demo.css`

**Interfaces:**
- Consumes: `processDemoInput`, `createDemoSession`, `VOICE_DOMAINS`, `VOICE_EXAMPLES`, `useSpeechRecognition`.
- Produces: default `VoiceDemoApp` component.

- [ ] **Step 1: Write failing component tests**

```tsx
it("uses text input when speech recognition is unavailable", async () => {
  const user = userEvent.setup();
  render(<VoiceDemoApp />);
  expect(screen.getByText("当前浏览器不支持语音识别，可使用文字输入")).toBeInTheDocument();
  await user.type(screen.getByLabelText("输入想对护理床说的话"), "把靠背升高一点");
  await user.click(screen.getByRole("button", { name: "发送文字指令" }));
  expect(screen.getByText("靠背调节")).toBeInTheDocument();
  expect(screen.getByText(/模拟/)).toBeInTheDocument();
});

it("runs a clickable example through the same intent engine", async () => {
  const user = userEvent.setup();
  render(<VoiceDemoApp />);
  await user.click(screen.getByRole("button", { name: "示例：给女儿打电话" }));
  expect(screen.getByText("实时通话")).toBeInTheDocument();
});

it("confirms a protected bed action", async () => {
  const user = userEvent.setup();
  render(<VoiceDemoApp />);
  await submitText(user, "把床全部放平");
  expect(screen.getByRole("button", { name: "确认模拟执行" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认模拟执行" }));
  expect(screen.getByText(/已模拟完成/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
npm run test:run -- src/voice-demo/VoiceDemoApp.test.tsx --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the page component does not exist.

- [ ] **Step 3: Implement page state and interaction flow**

Use one `DemoSessionState` state object and derive visible status from its latest turn. Avoid copying derived values into effects. Submit handlers must use functional state updates:

```ts
const submitText = useCallback((text: string) => {
  const cleanText = text.trim();
  if (!cleanText) return;
  setSession((current) => {
    const result = processDemoInput(current, cleanText, new Date());
    queueMicrotask(() => speakResponse(result.turn.response));
    return result.state;
  });
  setDraft("");
}, []);
```

Do not recreate the domain catalog or example arrays inside the component.

- [ ] **Step 4: Implement the complete visible surface**

Build these regions in this order:

1. top bar with “安伴床侧 Agent 演示”, device/voice status, time and “返回家属端”;
2. hero interaction panel with animated voice orb, microphone button, status copy, interim transcript and simulation badge;
3. always-visible text fallback textarea and “发送” button;
4. four domain tabs/cards with capability chips and clickable sample phrases;
5. current conversation card with user text, Agent reply, status, confirm/cancel buttons;
6. expandable “Agent 如何理解” panel with domain, intent, slots, confidence, route and safety;
7. five-stage processing rail: 听见、理解、安全检查、任务编排、反馈;
8. recent turns list capped visually to the latest six items;
9. persistent footer disclaimer.

- [ ] **Step 5: Apply the existing design language with a distinct bedside layout**

Use CSS custom properties local to `.voice-demo-root`. Required visual rules:

- background `#eef2ed` with a subtle radial green wash;
- primary ink `#0c2d2b`, action green `#267f70`, warm surface `#fbfaf5`, AI violet `#756da8`;
- desktop content width between `1120px` and `1280px`, two-column main layout;
- primary voice orb at least `220px` desktop and `172px` narrow screens;
- body text at least `16px`, primary status at least `24px`;
- microphone target at least `64px` square;
- visible focus rings and `prefers-reduced-motion` handling;
- no fixed element may cover the text fallback or confirmation buttons;
- collapse to one column below `860px` without horizontal scrolling.

- [ ] **Step 6: Run component tests and verify GREEN**

Run the Task 4 command again. Expected: all component tests pass with no React warnings.

---

### Task 5: 增加独立 HTML 入口与家属端超链接

**Files:**
- Create: `app/src/voice-demo/main.tsx`
- Create: `app/voice-demo.html`
- Modify: `app/vite.config.ts`
- Modify: `app/src/screens/ProfileScreen.tsx:1-145`
- Modify: `app/src/App.test.tsx`
- Modify: `app/README.md`

**Interfaces:**
- Produces: `/voice-demo.html` in development and `dist/voice-demo.html` in production.
- Consumes: default `VoiceDemoApp` from Task 4.

- [ ] **Step 1: Add a failing family-app link test**

```tsx
it("links to the independent bedside voice demo", async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "我的" }));
  const link = screen.getByRole("link", { name: /床侧语音交互演示/ });
  expect(link).toHaveAttribute("href", "/voice-demo.html");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});
```

- [ ] **Step 2: Run the App test and verify RED**

Run:

```powershell
npm run test:run -- src/App.test.tsx --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the link is not present.

- [ ] **Step 3: Add the profile link without changing navigation**

Add a styled anchor in the “设备与隐私” card after “护理床设备”:

```tsx
<a
  className="setting-row demo-link-row"
  href="/voice-demo.html"
  target="_blank"
  rel="noreferrer"
>
  <span className="setting-icon"><AudioLines size={19} aria-hidden="true" /></span>
  <span className="setting-copy">
    <strong>床侧语音交互演示</strong>
    <small>打开独立页面 · 体验意图识别与模拟执行</small>
  </span>
  <ExternalLink size={17} aria-hidden="true" />
</a>
```

Do not add the link to `BottomNavigation` and do not render `ContactLauncher` on the demo page.

- [ ] **Step 4: Add the standalone entry**

`voice-demo.html` must set title `安伴 · 护理床端侧语音演示`, description `智能护理床端侧语音 Agent 交互模拟器`, theme color `#eef2ed`, and script `/src/voice-demo/main.tsx`.

Configure Vite exactly as a two-page build:

```ts
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        voiceDemo: "voice-demo.html",
      },
    },
  },
});
```

- [ ] **Step 5: Update README with direct URLs and browser requirements**

Document:

- family app: `http://127.0.0.1:5173/`;
- bedside demo: `http://127.0.0.1:5173/voice-demo.html`;
- Chrome/Edge recommended for Web Speech Recognition;
- microphone permission is optional because text input remains available;
- both HTML files are emitted by `npm run build`.

- [ ] **Step 6: Run App and voice-demo component tests**

Run:

```powershell
npm run test:run -- src/App.test.tsx src/voice-demo/VoiceDemoApp.test.tsx --maxWorkers=1 --minWorkers=1
```

Expected: all tests pass.

---

### Task 6: 全量验证与浏览器交互 QA

**Files:**
- Verify: all files above.
- Store screenshots outside the repository under the configured visualization directory.

**Interfaces:**
- Verifies both Vite entries and all existing family-app behavior.

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm run test:run -- --maxWorkers=1 --minWorkers=1
```

Expected: all existing and new tests pass; no unhandled React warnings.

- [ ] **Step 2: Run the production build**

```powershell
npm run build
```

Expected: build exits `0` and produces both `dist/index.html` and `dist/voice-demo.html`.

- [ ] **Step 3: Start the exact local target**

```powershell
npm run dev -- --port 5173 --strictPort
```

Verify both URLs return HTTP 200.

- [ ] **Step 4: Verify the family-app entry flow**

The flow under test is: `/` → “我的” → “床侧语音交互演示” → `/voice-demo.html` opens in a new tab.

Check page identity, non-blank DOM, absence of framework overlay, console errors, and that the original three-tab navigation remains unchanged.

- [ ] **Step 5: Verify text and intent flows**

Run these exact phrases through the page and check the visible intent, parameters, safety decision and response:

1. `把靠背升高一点` → 靠背调节 → direct simulated action;
2. `再高一点` → inherits back context;
3. `把床全部放平` → confirmation → click confirm → simulated completion;
4. `马上停下` → emergency stop regardless of current state;
5. `十分钟后提醒我喝水` → reminder with time and item slots;
6. `救命，快叫护理员` → immediate emergency simulation;
7. `给女儿打电话` → call active → `挂断` ends it;
8. `播放京剧` → media active → `声音小一点` controls it;
9. `我该吃几片药` → restricted medical response;
10. `帮我打电话` → clarification, no simulated call.

- [ ] **Step 6: Verify microphone and fallback states**

In a browser supporting Web Speech Recognition:

- click microphone and verify listening state appears;
- deny permission once and verify the text input is focused with a clear fallback message;
- restore permission and speak one supported phrase;
- confirm the final transcript travels through the same visible intent flow as typed input.

If headless automation cannot grant real microphone input, manually verify the permission/listening transition and use a mocked transcript only for automated coverage; report this limitation explicitly.

- [ ] **Step 7: Verify responsive layout and visual quality**

Check at `390×844`, `820×1180`, and `1440×1000`. Confirm:

- no horizontal overflow;
- microphone, textarea and confirmation controls remain visible;
- main two-column layout collapses cleanly below `860px`;
- four domain cards remain readable;
- status labels and simulation disclaimer are never obscured;
- focus states work by keyboard;
- reduced-motion preference removes pulsing animation;
- screenshots show no clipping, accidental wrapping or low-contrast text.

- [ ] **Step 8: Stop local services and report evidence**

Stop only the Vite process started for QA. Report test count, build status, browser/viewport coverage, microphone limitation if any, screenshots, and the two local URLs. Do not leave temporary QA scripts inside the repository.
