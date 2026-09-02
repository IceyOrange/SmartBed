# Non-AI Bedside Capability Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved high-end bedside interface and a capability-catalog-driven, single-call intent pipeline whose simulated services can later be replaced independently.

**Architecture:** The backend derives the GLM prompt and local validation from one immutable capability catalog, then routes validated intents through one handler per capability and narrow execution ports. The frontend keeps the existing API/session behavior but presents it as a calm two-panel bedside appliance.

**Tech Stack:** Python 3.12 standard library and `unittest`; React 19, TypeScript 5.7, Vite 6, Vitest, Testing Library, Lucide React; CSS without new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-non-ai-bedside-capability-modules-design.md`

## Global Constraints

- Preserve `/api/v1/agent/messages`, `/api/v1/bedside/messages`, health, state, overview, `AgentResultDto`, and existing `data["skill"]` values.
- Keep one GLM request per utterance; the model never calls tools or bypasses deterministic safety policy.
- Preserve `kind`, `target`, `action`, `parameters`, `confidence`, `negated`, `should_execute`, and `utterance_type`.
- Keep eight conversation turns in React memory only; refresh clears them. Add no SQL, `localStorage`, voiceprint, or long-term memory.
- Preserve click-to-talk, Space-to-talk, text fallback, focus rules, guide focus lock, Escape, ARIA live regions, and reduced motion.
- Use `C:\Users\huangtiancheng.11\.codex\visualizations\2026\09\01\01a05be7-17ba-7ad2-9146-7fd429cae86f\care-bed-non-ai-concept-v1.png` as the visual reference.
- Validate 1920×1080 and 1440×900 without scrolling, clipping, or overlap.
- Add no second model call, autonomous planning, bed illustration, glowing AI orb, model-reasoning copy, or production dependency.
- Use TDD and one focused Git commit per task.

## File Map

- `agent/src/care_bed_agent/capabilities.py`: immutable capability metadata.
- `agent/src/care_bed_agent/prompting.py`: deterministic Chinese system prompt.
- `agent/src/care_bed_agent/intent_contract.py`: decoding, allow-listing, normalization, and `Intent` conversion.
- `agent/src/care_bed_agent/model_interpreter.py`: model-call orchestration and transport errors only.
- `agent/src/care_bed_agent/ports.py`: narrow protocols for replaceable integrations.
- `agent/src/care_bed_agent/skills/*.py`: one handler per capability, grouped by product domain.
- `agent/src/care_bed_agent/bootstrap.py`: in-memory adapter and handler wiring.
- `app/src/voice-demo/components/VoiceConsole.tsx`: physical-style voice control and text fallback.
- `app/src/voice-demo/components/IdleOverview.tsx`: “今日床侧” status hierarchy.
- `app/src/voice-demo/components/ServiceStage.tsx` and `components/stages/*.tsx`: consistent service results.
- `app/src/voice-demo/voice-demo.css`: visual system and responsive composition.

---

### Task 1: Capability Catalog, Prompt Builder, and Intent Contract

**Files:**
- Create: `agent/src/care_bed_agent/capabilities.py`
- Create: `agent/src/care_bed_agent/prompting.py`
- Create: `agent/src/care_bed_agent/intent_contract.py`
- Create: `agent/tests/test_capabilities.py`
- Create: `agent/tests/test_prompting.py`
- Create: `agent/tests/test_intent_contract.py`
- Modify: `agent/src/care_bed_agent/model_interpreter.py`
- Modify: `agent/tests/test_model_integration.py`

**Interfaces:**
- Produces: `CapabilitySpec`, `CAPABILITIES`, `capability_for(kind, action)`, `supported_intent_kinds()`.
- Produces: `build_system_prompt(capabilities: Sequence[CapabilitySpec] = CAPABILITIES) -> str`.
- Produces: `parse_model_intent(raw_text: str, response: str, *, model_name: str, minimum_confidence: float) -> Intent`.
- Preserves: `AiIntentInterpreter(model=..., minimum_confidence=...).interpret(text, history) -> Intent`.

- [ ] **Step 1: Write failing catalog and prompt tests**

```python
class CapabilityCatalogTests(unittest.TestCase):
    def test_each_kind_action_pair_is_unique(self) -> None:
        keys = [(item.kind, item.action) for item in CAPABILITIES]
        self.assertEqual(len(keys), len(set(keys)))

    def test_catalog_covers_every_executable_kind(self) -> None:
        self.assertEqual(set(IntentKind) - {IntentKind.UNKNOWN, IntentKind.COMMUNICATION}, supported_intent_kinds())

class PromptBuilderTests(unittest.TestCase):
    def test_prompt_contains_schema_safety_and_disambiguation_examples(self) -> None:
        prompt = build_system_prompt()
        for field in ("kind", "target", "action", "parameters", "confidence", "negated", "should_execute", "utterance_type"):
            self.assertIn(field, prompt)
        for phrase in ("把床全部放平", "调到睡眠姿势", "记一下我吃过药了", "记一下眼镜在抽屉里", "听听女儿的留言", "播放一段京剧", "给女儿说晚点回电话", "给女儿打电话", "我想女儿了"):
            self.assertIn(phrase, prompt)
        self.assertLess(prompt.index("停止"), prompt.index("普通能力"))
        self.assertIn("只有最后一条用户消息可以触发动作", prompt)
```

- [ ] **Step 2: Run `python -m unittest tests.test_capabilities tests.test_prompting -v` from `agent`; verify missing-module failures.**

- [ ] **Step 3: Implement the immutable catalog**

```python
@dataclass(frozen=True, slots=True)
class CapabilitySpec:
    capability_id: str
    kind: IntentKind
    action: str
    summary: str
    allowed_targets: tuple[str, ...] = ()
    parameter_names: tuple[str, ...] = ()
    required_parameters: tuple[str, ...] = ()
    examples: tuple[str, ...] = ()

CAPABILITIES = (
    CapabilitySpec("bed.adjust.up", IntentKind.BED_ADJUST, "up", "抬高床体部件", ("backrest", "legrest", "bed_height"), ("amount",), (), ("把靠背升高一点",)),
    CapabilitySpec("bed.adjust.down", IntentKind.BED_ADJUST, "down", "降低床体部件", ("backrest", "legrest", "bed_height"), ("amount",), (), ("把床降低一点",)),
    CapabilitySpec("bed.scene", IntentKind.BED_SCENE, "set_scene", "切换预设姿势", (), ("scene",), ("scene",), ("把床全部放平", "调到睡眠姿势")),
    CapabilitySpec("bed.stop", IntentKind.STOP, "stop", "立即停止床体动作", (), (), (), ("马上停下",)),
)
```

Complete the tuple with reminder, care record, care todo, emergency, live call, voice-message play/send, anniversary list/greeting, agenda, weather, note, companion, media, and date/time. Every `(kind, action)` resolves to one record.

- [ ] **Step 4: Build the prompt from `CAPABILITIES`**

Include exact mappings for “把床全部放平”, “调到睡眠姿势”, care record versus personal note, message versus media, asynchronous message versus live call, and “我想女儿了”. State that stop and explicit emergency outrank ordinary capabilities; negation, quotation, hypotheticals, diagnosis, and dosage changes set `should_execute=false`.

- [ ] **Step 5: Write failing contract tests**

```python
def test_missing_scene_remains_legal_for_handler_clarification(self) -> None:
    intent = parse_model_intent("调个姿势", intent_json("bed_scene", action="set_scene"), model_name="test-model", minimum_confidence=0.7)
    self.assertEqual(IntentKind.BED_SCENE, intent.kind)
    self.assertNotIn("scene", intent.parameters)

def test_filters_undeclared_parameters(self) -> None:
    intent = parse_model_intent("给女儿打电话", intent_json("live_call", target="女儿", action="start", parameters='{"tool":"shell","amount":99}'), model_name="test-model", minimum_confidence=0.7)
    self.assertEqual({}, intent.parameters)
```

Also cover valid parsing, illegal enum/action/target, bounded amount, malformed JSON, low confidence, negation, false `should_execute`, unknown utterance type, and companion replies.

- [ ] **Step 6: Run `python -m unittest tests.test_intent_contract -v`; verify missing-module failure.**

- [ ] **Step 7: Implement contract parsing and slim the interpreter**

Call `parse_model_intent(text, response, model_name=self._model.model_name, minimum_confidence=self._minimum_confidence)`. Unsafe output returns `UNKNOWN`; confidence clamps to `0..1`; bed amount clamps to `1..10`; missing business fields remain for handler clarification; only valid companion replies receive `parameters["model"]`.

- [ ] **Step 8: Run `python -m unittest tests.test_capabilities tests.test_prompting tests.test_intent_contract tests.test_model_integration tests.test_intents -v`; expect PASS.**

- [ ] **Step 9: Commit**

```bash
git add agent/src/care_bed_agent/capabilities.py agent/src/care_bed_agent/prompting.py agent/src/care_bed_agent/intent_contract.py agent/src/care_bed_agent/model_interpreter.py agent/tests/test_capabilities.py agent/tests/test_prompting.py agent/tests/test_intent_contract.py agent/tests/test_model_integration.py
git commit -m "refactor: drive intent parsing from capability catalog"
```

---

### Task 2: Fine-Grained Capability Handlers and Replaceable Ports

**Files:**
- Create: `agent/src/care_bed_agent/ports.py`
- Create: `agent/tests/test_capability_handlers.py`
- Create: `agent/tests/test_ports.py`
- Modify: `agent/src/care_bed_agent/skills/base.py`
- Modify: `agent/src/care_bed_agent/skills/bed.py`
- Modify: `agent/src/care_bed_agent/skills/care.py`
- Modify: `agent/src/care_bed_agent/skills/relationship.py`
- Modify: `agent/src/care_bed_agent/skills/daily_life.py`
- Modify: `agent/src/care_bed_agent/skills/__init__.py`
- Modify: `agent/src/care_bed_agent/domain_tools.py`
- Modify: `agent/src/care_bed_agent/bootstrap.py`
- Modify: `agent/tests/test_agent_orchestrator.py`
- Modify: `agent/tests/test_care_skill.py`
- Modify: `agent/tests/test_relationship_skill.py`
- Modify: `agent/tests/test_daily_life_skill.py`

**Interfaces:**
- Consumes: `CAPABILITIES` and each handler’s stable `capability_id`.
- Produces: `CapabilityHandler` with `capability_id`, `intent_kind`, `can_handle(intent)`, and `execute(intent, actor_id)`.
- Produces: `SkillRegistry.find(intent) -> CapabilityHandler | None`, preserving the orchestrator call site.
- Produces: `BedControlPort`, `ReminderPort`, `CareRecordPort`, `CareTodoPort`, `NotificationPort`, `CallPort`, `VoiceMessagePort`, `AnniversaryPort`, `WeatherPort`, `NotePort`, `MediaPort`, and `AgendaPort`.
- Preserves: `data["skill"]` values `bed_control`, `care_coordination`, `relationship`, and `daily_life`.

- [ ] **Step 1: Write failing port and registry tests**

```python
def test_registry_has_one_handler_for_every_capability(self) -> None:
    handlers = build_test_capability_handlers()
    self.assertEqual(sorted(item.capability_id for item in CAPABILITIES), sorted(item.capability_id for item in handlers))
    for intent in executable_catalog_intents():
        matches = [handler for handler in handlers if handler.can_handle(intent)]
        self.assertEqual(1, len(matches), intent)

def test_unknown_intent_has_no_handler(self) -> None:
    registry = SkillRegistry(build_test_capability_handlers())
    self.assertIsNone(registry.find(Intent(IntentKind.UNKNOWN, "不确定")))
```

- [ ] **Step 2: Run `python -m unittest tests.test_ports tests.test_capability_handlers -v`; verify missing protocol/handler failures.**

- [ ] **Step 3: Define narrow structural protocols**

```python
@runtime_checkable
class CallPort(Protocol):
    def start(self, *, contact: str, priority: str, initiated_by: str) -> dict[str, object]: ...
    def end(self, call_id: str) -> dict[str, object] | None: ...

@runtime_checkable
class VoiceMessagePort(Protocol):
    def send(self, *, sender: str, recipient: str, content: str, duration_seconds: int = 0, summary: str = "") -> dict[str, object]: ...
    def play_latest(self, *, sender: str, recipient: str) -> dict[str, object] | None: ...
```

Match existing in-memory signatures for bed, reminders, records, todos, notifications, anniversaries, weather, notes, media, and agenda. Add no persistence layer.

- [ ] **Step 4: Replace domain routers with capability handlers**

```python
class CapabilityHandler(Protocol):
    capability_id: str
    intent_kind: IntentKind
    def can_handle(self, intent: Intent) -> bool: ...
    def execute(self, intent: Intent, actor_id: str) -> ExecutionResult: ...

AgentSkill = CapabilityHandler
```

Implement `BedAdjustHandler`, `BedSceneHandler`, `BedStopHandler`, `ReminderCreateHandler`, `CareRecordCreateHandler`, `CareTodoCreateHandler`, `EmergencyCallHandler`, `LiveCallHandler`, `VoiceMessagePlayHandler`, `VoiceMessageSendHandler`, `AnniversaryListHandler`, `AnniversaryGreetingHandler`, `TodayAgendaHandler`, `WeatherHandler`, `NoteHandler`, `CompanionHandler`, `MediaHandler`, and `DateTimeHandler`. Keep existing result messages, codes, payload keys, confirmation behavior, and domain-level skill names. Missing fields return specific clarification; empty stores never fabricate data.

- [ ] **Step 5: Add realistic service lifecycles**

Message playback first becomes `playing`; add `mark_played(message_id)`. Add media `pause()` and `stop()`. Keep calls `calling` then `ended`. Emergency creates both an `emergency` call and a notification.

- [ ] **Step 6: Wire handlers in bootstrap**

Construct one handler tuple and pass it to `SkillRegistry`. Keep `build_default_agent(state, controller, intent_model=...)` valid while allowing `handlers: Sequence[CapabilityHandler] | None = None` for focused tests.

- [ ] **Step 7: Expand behavior tests and run `python -m unittest discover -s tests -v` from `agent`; expect all previous and new tests PASS.**

Use table-driven success and missing-input cases for handlers, plus empty-result cases for message playback and anniversaries. Assert APIs and aggregate read models remain unchanged.

- [ ] **Step 8: Commit**

```bash
git add agent/src/care_bed_agent/ports.py agent/src/care_bed_agent/skills agent/src/care_bed_agent/domain_tools.py agent/src/care_bed_agent/bootstrap.py agent/tests
git commit -m "refactor: modularize bedside capability handlers"
```

---

### Task 3: Appliance-Style Voice Panel and Today-at-Bedside Overview

**Files:**
- Modify: `app/src/voice-demo/components/VoiceConsole.tsx`
- Modify: `app/src/voice-demo/components/VoiceConsole.test.tsx`
- Modify: `app/src/voice-demo/components/IdleOverview.tsx`
- Create: `app/src/voice-demo/components/IdleOverview.test.tsx`
- Modify: `app/src/voice-demo/components/ConversationStrip.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.test.tsx`
- Modify: `app/src/voice-demo/voice-demo.css`

**Interfaces:**
- Preserves all `VoiceConsoleProps`, speech callbacks, form callbacks, and keyboard behavior.
- Preserves `IdleOverview({ loading, overview, systemState })`.
- Produces one stable `.voice-control` structure for idle, starting, listening, processing, complete, and error states.

- [ ] **Step 1: Replace the process-step test with failing appliance-state tests**

```tsx
it("uses one horizontal bedside control without model-process copy", () => {
  renderVoiceConsole({ submitting: true, speechMessage: "正在处理…" });
  expect(screen.getByRole("button", { name: "正在识别语音" })).toBeDisabled();
  expect(screen.getByText("正在处理")).toBeInTheDocument();
  expect(screen.queryByText("已听清")).not.toBeInTheDocument();
  expect(screen.queryByText("理解需要")).not.toBeInTheDocument();
  expect(screen.queryByText("安全处理")).not.toBeInTheDocument();
});

it("shows the idle instruction and space hint", () => {
  renderVoiceConsole();
  expect(screen.getByText("点击开始说话")).toBeInTheDocument();
  expect(screen.getByText("也可以按空格键")).toBeInTheDocument();
});
```

Add `IdleOverview` tests for “今日床侧”, bed metrics, next care item, family message, weather, rest suggestion, and `身体舒适`, `照护协同`, `家人联系`, `护理呼叫`.

- [ ] **Step 2: Run `npm --prefix app run test:run -- src/voice-demo/components/VoiceConsole.test.tsx src/voice-demo/components/IdleOverview.test.tsx`; verify expected failures.**

- [ ] **Step 3: Rebuild the voice panel without changing behavior**

Remove `PROCESSING_STEPS`, timer state, the circular listener, and AI-oriented copy. Render:

```tsx
<div className={`voice-control ${stateClass}`}>
  <button type="button" className="voice-control__button" aria-pressed={listening}>
    {listening ? <MicOff /> : <Mic />}
  </button>
  <div className="voice-control__copy" aria-live="polite">
    <strong>{statusTitle}</strong>
    <span>{statusDetail}</span>
  </div>
  <kbd>空格</kbd>
</div>
```

Use only `点击开始说话`, `正在打开麦克风`, `正在听`, `正在处理`, completed result copy, and actionable error copy. Keep retry, interim transcript, text form, guide, examples, and recent turns.

- [ ] **Step 4: Recompose the idle panel as “今日床侧”**

Show one primary bed-status row, three compact information rows, a non-automatic “午休姿势” suggestion, and a continuous four-part status strip. Keep numeric posture data and draw no bed.

- [ ] **Step 5: Implement the visual system**

Use warm white, graphite green, muted sage, a small safety-red range, 1px borders, restrained shadows, and moderate radii. Use `minmax(0, ...)` desktop tracks with internal overflow containment; stack below 980px. Preserve visible focus and reduced-motion rules.

- [ ] **Step 6: Run focused tests and build**

```bash
npm --prefix app run test:run -- src/voice-demo/components/VoiceConsole.test.tsx src/voice-demo/components/IdleOverview.test.tsx src/voice-demo/VoiceDemoApp.test.tsx
npm --prefix app run build
```

Expected: PASS with no TypeScript or Vite errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/voice-demo/components/VoiceConsole.tsx app/src/voice-demo/components/VoiceConsole.test.tsx app/src/voice-demo/components/IdleOverview.tsx app/src/voice-demo/components/IdleOverview.test.tsx app/src/voice-demo/components/ConversationStrip.tsx app/src/voice-demo/VoiceDemoApp.tsx app/src/voice-demo/VoiceDemoApp.test.tsx app/src/voice-demo/voice-demo.css
git commit -m "style: reshape voice demo as bedside appliance"
```

---

### Task 4: Unified Service Results, Safety Confirmation, and Responsive Polish

**Files:**
- Modify: `app/src/voice-demo/components/ServiceStage.tsx`
- Modify: `app/src/voice-demo/components/ServiceStage.test.tsx`
- Modify: `app/src/voice-demo/components/stages/BedControlStage.tsx`
- Modify: `app/src/voice-demo/components/stages/CareStage.tsx`
- Modify: `app/src/voice-demo/components/stages/RelationshipStage.tsx`
- Modify: `app/src/voice-demo/components/stages/DailyLifeStage.tsx`
- Modify: `app/src/voice-demo/components/stages/FeedbackStage.tsx`
- Modify: `app/src/voice-demo/servicePresentation.ts`
- Modify: `app/src/voice-demo/servicePresentation.test.ts`
- Modify: `app/src/voice-demo/voice-demo.css`

**Interfaces:**
- Consumes unchanged `ServicePresentation` variants and callbacks.
- Preserves hang-up, pause/resume, emergency cancel, confirm, cancel, and return-to-overview actions.
- Produces the same status/subject/time/action hierarchy across every result.

- [ ] **Step 1: Write failing result-presentation tests**

```tsx
it("states that cancellation leaves the bed unchanged", async () => {
  const user = userEvent.setup();
  renderStage({ ...base, domain: "body", kind: "confirmation", title: "请确认这次操作", action: "切换到睡眠姿势" });
  await user.click(screen.getByRole("button", { name: "取消操作" }));
  expect(screen.getByText("已取消，床体没有执行调整")).toBeInTheDocument();
});
```

Add table assertions for each result’s subject and status, plus an assertion that bed results contain measurements but no bed illustration.

- [ ] **Step 2: Run `npm --prefix app run test:run -- src/voice-demo/components/ServiceStage.test.tsx src/voice-demo/servicePresentation.test.ts`; verify failures.**

- [ ] **Step 3: Normalize result-panel structure**

Use one shallow stage body. Keep `身体舒适`, `照护协同`, `家人联系`, and `日常服务`; remove decorative hero blocks. Bed state shows only `靠背`, `腿托`, `床高`, and status.

- [ ] **Step 4: Make confirmation and cancellation explicit**

Track cancellation in `ServiceStage`. Replace controls after cancellation with `已取消，床体没有执行调整`, while retaining a return action. Confirmation names the pending action.

- [ ] **Step 5: Polish service details**

Restrict red to emergency; use `正在呼叫` then `通话已结束（模拟）`; use `播放中`/`已暂停` for messages; label media as simulated; label notes as page-temporary; avoid stars, magic, and AI labels in companion output.

- [ ] **Step 6: Run `npm --prefix app run test:run` and `npm --prefix app run build`; expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add app/src/voice-demo/components/ServiceStage.tsx app/src/voice-demo/components/ServiceStage.test.tsx app/src/voice-demo/components/stages app/src/voice-demo/servicePresentation.ts app/src/voice-demo/servicePresentation.test.ts app/src/voice-demo/voice-demo.css
git commit -m "style: unify bedside service result panels"
```

---

### Task 5: Documentation, Real-Model Smoke Test, and Full Visual Acceptance

**Files:**
- Create: `agent/tests/manual_glm_smoke.py`
- Modify: `agent/README.md`
- Modify: `app/README.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-02-non-ai-bedside-capability-modules-design.md` only when factual synchronization is required.

**Interfaces:**
- Consumes `AiIntentInterpreter`, ignored `agent/.env`, and existing GLM configuration.
- Produces an opt-in smoke command with no secrets in output or Git.
- Preserves offline tests without network or API-key requirements.

- [ ] **Step 1: Add an opt-in real-model smoke script**

Load configuration through the production path, print only phrase/kind/action/parameters, and fail on mismatches:

```python
CASES = (
    ("把床全部放平", "bed_scene", "set_scene", True),
    ("调到睡眠姿势", "bed_scene", "set_scene", True),
    ("记一下我吃过药了", "care_record", "create", True),
    ("记一下眼镜在抽屉里", "note", "create", True),
    ("听听女儿的留言", "voice_message", "play", True),
    ("播放一段京剧", "media", "play", True),
    ("给女儿说晚点回电话", "voice_message", "send", True),
    ("给女儿打电话", "live_call", "start", True),
    ("我想女儿了", "unknown", None, False),
    ("不要把靠背升高", "unknown", None, False),
    ("如果我摔倒了就帮我呼叫护理员", "unknown", None, False),
    ("把降压药加倍", "unknown", None, False),
    ("救命，快叫护理员", "emergency_call", "call", True),
)
```

Permit `companion` instead of `unknown` only for “我想女儿了”, while asserting it never becomes a call or message.

- [ ] **Step 2: Update operator documentation**

Document the single-call boundary, capability catalog, temporary eight-turn memory, simulated ports, start/test/build commands, local key handling, smoke command, controls, safety confirmation, and both projection sizes. Never include secrets or `.env` contents.

- [ ] **Step 3: Run all automated verification**

```bash
npm run test:launcher
npm --prefix app run test:run
npm --prefix app run build
cd agent && python -m unittest discover -s tests -v
```

Expected: all launcher, frontend, and backend tests PASS; production build succeeds.

- [ ] **Step 4: Run `python tests/manual_glm_smoke.py` from `agent`**

Expected: supported phrases match constrained intents and unsafe phrases do not execute. If the provider is unavailable, record the exact availability error; do not weaken assertions around incorrect output.

- [ ] **Step 5: Perform browser interaction and visual QA**

Start the root launcher and inspect 1920×1080 and 1440×900. Exercise idle, microphone start/listening, processing, success, failure/retry, guide, confirmation/cancel, emergency, call, message, weather, media, and eight turns. Confirm:

```text
document.documentElement.scrollHeight === window.innerHeight
document.documentElement.scrollWidth === window.innerWidth
console has no relevant error or warning
no “已听清 / 理解需要 / 安全处理” copy is rendered
refresh clears recent conversation
Space does not trigger in an editable control
```

Capture both final screenshots under `docs/screenshots/` without secrets or personal data.

- [ ] **Step 6: Commit documentation and evidence**

```bash
git add README.md agent/README.md app/README.md agent/tests/manual_glm_smoke.py docs/screenshots
git commit -m "docs: document and verify bedside capability demo"
```

- [ ] **Step 7: Integrate locally**

```bash
git status --short
git log --oneline --decorate -8
git switch main
git merge --ff-only feature/non-ai-bedside-capability-modules
git status --short --branch
```

Expected: five focused implementation commits follow the design commit, `main` fast-forwards to the verified feature head, and the final tree is clean.
