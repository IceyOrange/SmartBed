# Smart Care Bed Voice Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing bedside voice page into a polished 16:9 demonstration that turns speech into structured Agent actions and realistic service components.

**Architecture:** Keep the existing Vite/React frontend and Python Agent. Add a bounded page-session conversation context to the existing message contract, replace the unused frontend keyword engine with a typed presentation mapper, and render a stable voice console beside a code-driven service stage. All actions remain deterministic simulations after GLM intent recognition.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Vitest, Testing Library, Python 3.12 standard library, `unittest`, existing GLM Chat Completion adapter.

**Spec:** `docs/superpowers/specs/2026-09-01-smart-care-bed-voice-showcase-design.md`

## Global Constraints

- Target computer-browser projection at 1440×900 and 1920×1080, with the primary interaction available without page scrolling.
- Preserve click-to-talk and add Space-to-talk; text entry remains a fallback.
- Use a bright, restrained medical-tech visual system with low-saturation teal and warm gray-white surfaces.
- Do not draw a bed illustration; express bed control through posture names, values, progress, and safety state.
- Do not expose model confidence, chain-of-thought, tool calls, or persistent “AI” decoration in the primary UI.
- Do not add SQL, `localStorage`, voiceprint identification, long-term memory, RAG, or multi-agent behavior.
- Create a fresh page session on every load and retain no more than eight recent turns in memory.
- Keep all hardware, calls, weather, media, and care-system effects explicitly simulated.
- Use backend result `code` and structured `data` as the presentation source of truth; do not add a second keyword intent engine.

---

### Task 1: Add Bounded Page-Session Context

**Files:**
- Modify: `agent/src/care_bed_agent/intents.py`
- Modify: `agent/src/care_bed_agent/model_interpreter.py`
- Modify: `agent/src/care_bed_agent/orchestrator.py`
- Modify: `agent/src/care_bed_agent/system.py`
- Modify: `agent/src/care_bed_agent/api.py`
- Modify: `agent/tests/test_api.py`
- Modify: `agent/tests/test_model_integration.py`
- Modify: `app/src/api/types.ts`
- Modify: `app/src/api/client.ts`
- Modify: `app/src/api/client.test.ts`

**Interfaces:**
- Consumes: existing `POST /api/v1/bedside/messages` and `ChatModel.complete(messages, response_format=...)`.
- Produces: optional `history: Array<{ role: "user" | "assistant"; content: string }>` accepted by bedside messages and forwarded to `IntentInterpreter.interpret(text, history)`.
- Produces: `agentApi.sendBedsideMessage(text, actorId, history)` with history omitted when empty.

- [x] **Step 1: Write failing API validation tests**

Add tests proving that valid history is accepted, malformed roles/content are rejected with `invalid_request`, and history is capped at sixteen messages with bounded content length.

- [x] **Step 2: Run the focused backend tests**

Run: `cd agent; $env:PYTHONDONTWRITEBYTECODE="1"; $env:PYTHONPATH="src"; python -B -m unittest tests.test_api tests.test_model_integration -v`

Expected: FAIL because message history is neither validated nor forwarded.

- [x] **Step 3: Extend the interpreter contract**

Update `IntentInterpreter.interpret` and `AiIntentInterpreter.interpret` to accept a sequence of prior chat messages. Build the model request as system prompt, sanitized prior messages in chronological order, then the current user message. Add an explicit system rule that prior turns are context only and only the final user message may trigger an action.

- [x] **Step 4: Forward validated history through the Agent path**

Validate role/content at `AgentApi`, copy normalized history into `IncomingEvent.payload`, then pass it through `CareBedSystem` and `AgentOrchestrator`. Confirmation/cancellation remains deterministic and must not call the model.

- [x] **Step 5: Extend and test the frontend client contract**

Add `ConversationMessageDto`; update the client request body; assert request JSON contains `actor_id`, current `text`, and bounded `history` without changing family-app calls.

- [x] **Step 6: Run focused tests and commit**

Run: backend command from Step 2, then `npm --prefix app run test:run -- src/api/client.test.ts`.

Expected: PASS.

Commit: `feat: add page-scoped conversation context`

### Task 2: Replace Keyword Rules With Presentation Models

**Files:**
- Create: `app/src/voice-demo/model.ts`
- Create: `app/src/voice-demo/servicePresentation.ts`
- Create: `app/src/voice-demo/servicePresentation.test.ts`
- Modify: `app/src/api/adapters.ts`
- Modify: `app/src/api/adapters.test.ts`
- Delete: `app/src/voice-demo/intentEngine.ts`
- Delete: `app/src/voice-demo/intentEngine.test.ts`

**Interfaces:**
- Consumes: `AgentResultDto.code`, `AgentResultDto.status`, `AgentResultDto.data`, and optional `interpretation`.
- Produces: `DemoTurn` retaining `code`, structured result data, user text, response, domain, label, and status.
- Produces: `toServicePresentation(turn): ServicePresentation`, a discriminated union for `bed`, `reminder`, `record`, `emergency`, `todo`, `call`, `message`, `anniversary`, `agenda`, `weather`, `note`, `companion`, `media`, `confirmation`, `clarification`, and `restricted` states.

- [ ] **Step 1: Write failing presentation-mapping tests**

Cover representative backend codes from every requested function, plus confirmation, unknown intent, medical restriction, and missing optional data.

- [ ] **Step 2: Run the mapper tests**

Run: `npm --prefix app run test:run -- src/voice-demo/servicePresentation.test.ts src/api/adapters.test.ts`

Expected: FAIL because the presentation model does not exist.

- [ ] **Step 3: Introduce focused view-model types**

Move only shared domain, turn, session, and demonstration-example types into `model.ts`. Define the presentation union with display-ready values and no React elements.

- [ ] **Step 4: Implement code-driven mapping**

Map backend codes and structured payloads to user-facing component state. Use safe fallback values for incomplete demo payloads; never infer actions from the original Chinese text.

- [ ] **Step 5: Remove the unused keyword engine**

Update imports in the adapter and app, remove local recognition and simulated execution functions, and preserve only the curated demonstration utterances in `model.ts`.

- [ ] **Step 6: Run focused tests and commit**

Run the command from Step 2.

Expected: PASS.

Commit: `refactor: drive voice demo from agent results`

### Task 3: Build the Double-Stage Application Shell

**Files:**
- Create: `app/src/voice-demo/components/VoiceConsole.tsx`
- Create: `app/src/voice-demo/components/IdleOverview.tsx`
- Create: `app/src/voice-demo/components/DemoGuide.tsx`
- Create: `app/src/voice-demo/components/ConversationStrip.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.test.tsx`
- Modify: `app/voice-demo.html`

**Interfaces:**
- Consumes: speech state, draft text, recent turns, `DemoOverviewDto`, `SystemStateDto`, and callbacks owned by `VoiceDemoApp`.
- Produces: stable left-side voice console, idle overview without a bed illustration, hidden demonstration guide, and a compact recent-conversation strip.
- Produces: one `voice-session-${crypto.randomUUID()}` actor identifier initialized once per page load.

- [ ] **Step 1: Replace shell expectations with failing tests**

Test the new accessible headings, idle overview cards, guide open/close behavior, session-specific actor ID, eight-turn cap, and absence of the old capability grid.

- [ ] **Step 2: Add failing keyboard interaction tests**

Verify Space starts listening when focus is outside editable controls, stops an active browser recognition session, and does nothing while the text input or a button has focus.

- [ ] **Step 3: Run the focused app test**

Run: `npm --prefix app run test:run -- src/voice-demo/VoiceDemoApp.test.tsx`

Expected: FAIL against the current capability-grid page.

- [ ] **Step 4: Extract the shell components**

Keep microphone lifecycle and API coordination in `VoiceDemoApp`. Move pure rendering into the four focused components. Load health, overview, state, and speech status in parallel where independent.

- [ ] **Step 5: Add session-only conversation behavior**

Initialize the actor ID once, derive chronological context from at most eight in-memory turns, send it with each new message, and clear everything naturally on a page reload. Do not touch browser storage.

- [ ] **Step 6: Add Space-to-talk safely**

Install one deduplicated `keydown` listener, ignore repeat events and editable targets, prevent page scrolling only when handling the microphone shortcut, and clean up the listener on unmount.

- [ ] **Step 7: Run focused tests and commit**

Run the command from Step 3.

Expected: PASS.

Commit: `feat: build voice showcase shell`

### Task 4: Implement Realistic Dynamic Service Components

**Files:**
- Create: `app/src/voice-demo/components/ServiceStage.tsx`
- Create: `app/src/voice-demo/components/stages/BedControlStage.tsx`
- Create: `app/src/voice-demo/components/stages/CareStage.tsx`
- Create: `app/src/voice-demo/components/stages/RelationshipStage.tsx`
- Create: `app/src/voice-demo/components/stages/DailyLifeStage.tsx`
- Create: `app/src/voice-demo/components/stages/FeedbackStage.tsx`
- Create: `app/src/voice-demo/components/ServiceStage.test.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.tsx`

**Interfaces:**
- Consumes: `ServicePresentation` and confirmation/cancellation callbacks.
- Produces: one right-side stage for every requested capability and safety outcome.

- [ ] **Step 1: Write failing component-state tests**

Render representative presentations and assert visible business details: bed target/current value without bed artwork, reminder time/content, record content, emergency contact state, Todo items, call controls, message progress, anniversary recipient, agenda timeline, weather values, note content, companion reply, media progress, confirmation, and restricted guidance.

- [ ] **Step 2: Run the focused component tests**

Run: `npm --prefix app run test:run -- src/voice-demo/components/ServiceStage.test.tsx`

Expected: FAIL because the stage components do not exist.

- [ ] **Step 3: Implement domain stage components**

Use the existing Lucide icon set, CSS-driven progress and waveform treatments, initials for contacts, and deterministic display values. Keep components pure and avoid timers except the existing call/media display behavior required for visible simulation.

- [ ] **Step 4: Wire confirmation and follow-up actions**

Confirmation and cancellation buttons submit the same natural-language commands as speech. Secondary controls such as hang up or pause remain clearly marked as simulated and update only through existing Agent or local presentation state as appropriate.

- [ ] **Step 5: Run focused tests and commit**

Run the command from Step 2 and `npm --prefix app run test:run -- src/voice-demo/VoiceDemoApp.test.tsx`.

Expected: PASS.

Commit: `feat: add dynamic care service stages`

### Task 5: Apply the Approved Medical-Tech Visual System

**Files:**
- Modify: `app/src/voice-demo/voice-demo.css`
- Modify: `app/src/voice-demo/components/VoiceConsole.tsx`
- Modify: `app/src/voice-demo/components/IdleOverview.tsx`
- Modify: `app/src/voice-demo/components/DemoGuide.tsx`
- Modify: `app/src/voice-demo/components/ConversationStrip.tsx`
- Modify: `app/src/voice-demo/components/ServiceStage.tsx`
- Modify: `app/src/voice-demo/components/stages/*.tsx`

**Interfaces:**
- Consumes: approved browser concept from the brainstorming session and semantic class names from Tasks 3–4.
- Produces: 16:9 double-stage composition, restrained teal tokens, warm-white surfaces, readable projection typography, and state transitions that respect `prefers-reduced-motion`.

- [ ] **Step 1: Define design tokens and layout rules**

Create CSS custom properties for palette, spacing, radii, shadows, type scale, status colors, and transition durations. Use system Chinese fonts with `JINGDONG朗正体` as an optional local preference; do not bundle the 78MB installer package.

- [ ] **Step 2: Style the first viewport at 1920×1080**

Keep the header compact, allocate roughly 38% to the voice console and 62% to the service stage, prevent core controls from falling below the fold, and remove the old capability-card grid.

- [ ] **Step 3: Add restrained interaction states**

Implement listening waveform, processing steps, stage cross-fade, progress bars, focus-visible rings, hover states, and reduced-motion fallbacks. Avoid glassmorphism, neon, robot imagery, and decorative gradients.

- [ ] **Step 4: Add responsive projection support**

Verify 1440×900 and 1920×1080 as first-class layouts, then add a functional single-column fallback below tablet width without optimizing for a phone-first experience.

- [ ] **Step 5: Run frontend tests and build**

Run: `npm --prefix app run test:run`

Run: `npm --prefix app run build`

Expected: all tests pass and Vite emits both application entries.

- [ ] **Step 6: Commit**

Commit: `style: polish care bed voice showcase`

### Task 6: End-to-End Verification and Documentation

**Files:**
- Modify: `README.md`
- Modify: `app/README.md`
- Modify: `agent/contracts/openapi.json`
- Modify: `agent/contracts/README.md`
- Modify: tests only if verification exposes an in-scope regression

**Interfaces:**
- Consumes: completed UI and optional history contract.
- Produces: current startup/demo instructions, documented request schema, and verified demonstration paths.

- [ ] **Step 1: Update the public contract and usage docs**

Document optional bounded history, page-refresh reset behavior, Space-to-talk, text fallback, simulated integrations, and suggested demonstration phrases.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Run: `npm run build`

Run: `cd agent; $env:PYTHONDONTWRITEBYTECODE="1"; $env:PYTHONPATH="src"; python -B -m unittest discover -s tests -v`

Expected: all commands exit successfully.

- [ ] **Step 3: Run the local application and verify core flows**

Run: `npm run dev`

Verify at `http://127.0.0.1:5173/voice-demo.html`: text fallback, microphone state, Space shortcut, bed adjustment, large-action confirmation/cancel, emergency call, reminder, family call/message, weather, note, companion reply, media playback, unknown intent, and Agent-offline state.

- [ ] **Step 4: Perform visual QA at native viewport sizes**

Use the in-app browser if available; otherwise use the repository's existing Playwright Chromium. Capture 1920×1080 and 1440×900 screenshots for idle, listening/processing, bed control, reminder confirmation, live call, and weather/media states. Inspect the screenshots directly and fix clipping, wrapping, hierarchy, typography, icon, focus, or density defects.

- [ ] **Step 5: Confirm design fidelity**

Compare the latest screenshot against the approved medical-tech double-stage concept. Confirm the first viewport, voice/result balance, visible copy, palette, typography, card anatomy, lack of bed illustration, and restrained motion. Record any intentional deviations.

- [ ] **Step 6: Commit final verification changes**

Commit: `docs: finalize voice showcase demo`
