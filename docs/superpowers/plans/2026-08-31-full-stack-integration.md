# Care Bed Full-Stack Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect both existing React entry points to the Python Agent and provide one root development command that starts the complete demo.

**Architecture:** The Python Agent remains an independent local HTTP service and owns all shared demo state. Vite proxies `/api` during development; a typed frontend client and pure adapters isolate transport DTOs from existing view models.

**Tech Stack:** Python 3.12 standard library, unittest, React 19, TypeScript 5.7, Vite 6, Vitest, Testing Library, Node.js process APIs.

**Spec:** `docs/superpowers/specs/2026-08-31-full-stack-integration-design.md`

## Global Constraints

- Keep Agent bound to `127.0.0.1:8765` and Vite bound to `127.0.0.1:5173`.
- Never expose `GLM_API_KEY` to frontend code or Vite environment variables.
- Family requests use `EventSource.APP`; bedside requests use `EventSource.VOICE` selected only by the backend route.
- Preserve the family remote-bed-control rejection.
- Keep storage in memory and seed production demo state on each Agent start.
- Do not add third-party dependencies.
- The supplied directory is not a Git repository, so replace commit checkpoints with test-and-diff checkpoints.

---

### Task 1: Bedside Agent Boundary and Confirmation

**Files:**
- Modify: `agent/tests/support.py`
- Modify: `agent/tests/test_api.py`
- Modify: `agent/tests/test_agent_orchestrator.py`
- Modify: `agent/src/care_bed_agent/intents.py`
- Modify: `agent/src/care_bed_agent/model_interpreter.py`
- Modify: `agent/src/care_bed_agent/orchestrator.py`
- Modify: `agent/src/care_bed_agent/api.py`

**Interfaces:**
- Consumes: `AgentApi.dispatch(method, path, body)` and `AgentOrchestrator.handle_text(text, actor_id, source)`.
- Produces: `POST /api/v1/bedside/messages` and `data.interpretation` on interpreted Agent results.

- [ ] Add failing API tests proving a bedside bed command succeeds while the same family command remains `403`.
- [ ] Add failing orchestrator tests proving a large/reset motion returns `needs_confirmation`, confirmation executes once, cancellation clears it, and stop clears pending work.
- [ ] Run `python -B -m unittest tests.test_api tests.test_agent_orchestrator -v` with `PYTHONPATH=src`; confirm failures are caused by missing routes and confirmation behavior.
- [ ] Extend intent/context types with confirmation and cancellation, keep pending intents per actor, and enrich results with normalized interpretation metadata.
- [ ] Add the bedside route with backend-selected `EventSource.VOICE`; keep the family route fixed to `EventSource.APP`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Family State and Structured Mutations

**Files:**
- Modify: `agent/tests/test_api.py`
- Modify: `agent/src/care_bed_agent/tools.py`
- Modify: `agent/src/care_bed_agent/domain_tools.py`
- Modify: `agent/src/care_bed_agent/rules.py`
- Modify: `agent/src/care_bed_agent/bootstrap.py`
- Modify: `agent/src/care_bed_agent/api.py`
- Modify: `agent/contracts/openapi.json`

**Interfaces:**
- Consumes: in-memory reminder, voice-message and call stores exposed by `CareBedSystem`.
- Produces: reminder PATCH/DELETE, voice-message POST, call POST/PATCH, health alias, and seeded overview DTOs.

- [ ] Add failing API tests for seeded overview data, reminder create/update/toggle/delete, voice-message creation, call start/end, malformed bodies, and unknown IDs.
- [ ] Run the focused API suite and confirm each new behavior fails for the intended missing capability.
- [ ] Extend `Reminder` with `note`, `status`, and `enabled`; add thread-safe update/delete methods without changing existing create callers.
- [ ] Extend voice messages with optional duration/summary and calls with an end transition; add family demo seeding enabled only by the production bootstrap path.
- [ ] Add route parsing and JSON handling for PATCH/DELETE, return stable JSON errors, and keep CORS methods synchronized.
- [ ] Update `openapi.json` with every route, request, response and new field.
- [ ] Run all Agent tests and confirm zero failures.

### Task 3: Typed Frontend API Layer

**Files:**
- Create: `app/src/api/types.ts`
- Create: `app/src/api/client.ts`
- Create: `app/src/api/client.test.ts`
- Create: `app/src/api/adapters.ts`
- Create: `app/src/api/adapters.test.ts`
- Modify: `app/src/types.ts`

**Interfaces:**
- Consumes: OpenAPI DTOs from `/api/v1/*`.
- Produces: `agentApi`, `ApiError`, `toCareTasks`, `toTimelineItems`, `toRecentUpdates`, and `toDemoTurn`.

- [ ] Write failing adapter tests with complete literal DTO fixtures for care-task status/time mapping, contact direction, and backend interpretation mapping.
- [ ] Write failing client tests proving JSON headers, relative base URL, semantic Agent errors, network failures and timeout errors are normalized.
- [ ] Run `npm run test:run -- src/api` and confirm failures are due to missing modules.
- [ ] Implement transport types, a single request helper with `AbortSignal.timeout`, and focused endpoint methods.
- [ ] Implement pure DTO adapters without React or browser dependencies.
- [ ] Re-run the API-layer tests and confirm they pass.

### Task 4: Family App Integration

**Files:**
- Modify: `app/src/App.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/screens/HomeScreen.tsx`
- Modify: `app/src/screens/CarePlanScreen.tsx`
- Modify: `app/src/screens/ContactScreen.tsx`
- Modify: `app/src/screens/ProfileScreen.tsx`
- Modify: `app/src/styles.css`
- Modify: `app/src/data/mockData.ts`

**Interfaces:**
- Consumes: `agentApi` and adapter outputs from Task 3.
- Produces: an Agent-backed family dashboard with connection, loading, mutation and error states.

- [ ] Update component tests first to provide realistic fetch responses and assert loaded Agent data, successful care-item synchronization, communication writes and offline messaging.
- [ ] Run the family component tests and confirm they fail because the app still uses local mock state.
- [ ] Load health, overview, state and reminders in parallel; keep request orchestration in `App.tsx` and pass display-ready props to screens.
- [ ] Replace local-only care-plan callbacks with async create/update/delete/toggle/reset operations followed by refresh.
- [ ] Replace local-only message/call records with backend writes and refresh; show loading and connection feedback without claiming failed writes succeeded.
- [ ] Move remaining reusable static labels out of `mockData.ts` or remove the file when no longer imported.
- [ ] Re-run family tests and confirm they pass.

### Task 5: Bedside Voice Integration

**Files:**
- Modify: `app/src/voice-demo/VoiceDemoApp.test.tsx`
- Modify: `app/src/voice-demo/VoiceDemoApp.tsx`
- Modify: `app/src/voice-demo/intentEngine.ts`
- Modify: `app/src/voice-demo/voice-demo.css`

**Interfaces:**
- Consumes: `agentApi.sendBedsideMessage(text, actorId)` and `toDemoTurn`.
- Produces: backend-authoritative bedside conversation with pending, success, rejection and failure states.

- [ ] Change tests first to return complete Agent responses and assert submitted text, backend reply, interpretation details, busy state, confirmation and network failure.
- [ ] Run the bedside component tests and confirm failures show the current local executor is still active.
- [ ] Make submission asynchronous, call the bedside endpoint, append adapted turns, and speak only the backend message.
- [ ] Route confirmation/cancellation buttons through the same endpoint and preserve browser speech recognition as text input only.
- [ ] Remove production use of `processDemoInput`; retain only reusable presentation types/constants or delete dead local execution code with its obsolete tests.
- [ ] Re-run bedside and full frontend tests and confirm they pass.

### Task 6: Unified Startup, Documentation, and End-to-End Verification

**Files:**
- Create: `package.json`
- Create: `scripts/dev.mjs`
- Create: `scripts/dev.test.mjs`
- Modify: `app/vite.config.ts`
- Modify: `README.md`
- Modify: `app/README.md`
- Modify: `agent/README.md`

**Interfaces:**
- Consumes: Python module entry point and Vite dev command.
- Produces: root `npm run dev`, deterministic child-process cleanup, and `/api` proxy configuration.

- [ ] Write Node tests first for platform command selection, health polling success/timeout, and sibling-process shutdown behavior using injected process/fetch doubles.
- [ ] Run `node --test scripts/dev.test.mjs` and confirm it fails because the launcher module is absent.
- [ ] Implement the dependency-free launcher, waiting for `/api/v1/health` before starting Vite and terminating both children on signals or failure.
- [ ] Configure the Vite `/api` proxy and optional `VITE_AGENT_BASE_URL`; document the single startup command and separate troubleshooting commands.
- [ ] Run `node --test scripts/dev.test.mjs`, the complete Agent suite, `npm run test:run`, and `npm run build`.
- [ ] Start the root command, verify health and both HTML entry points, then use browser testing to exercise family load/mutations and a bedside request while checking console and network errors.
- [ ] Review the final changed-file list against the spec and report any non-goal or environmental limitation without modifying unrelated code.
