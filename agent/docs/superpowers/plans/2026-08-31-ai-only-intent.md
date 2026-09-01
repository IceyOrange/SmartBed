# AI-Only Natural-Language Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every ordinary natural-language request through GLM while retaining deterministic safety, routing, policy, and execution layers.

**Architecture:** Replace the local keyword interpreter with an AI-only interpreter that emits validated typed intents. Use one low-latency model call per utterance, including a short generated reply for companion requests. Structured events and hardware controls remain outside the Agent path.

**Tech Stack:** Python 3.12 standard library, `unittest`, GLM Chat Completion API.

**Spec:** `docs/superpowers/specs/2026-08-31-ai-only-intent-design.md`

## Global Constraints

- Do not expose or print `GLM_API_KEY`.
- Do not send physical-handle, emergency-stop, timer, or structured APP events to AI.
- Do not execute an action after model, parsing, validation, or confidence failure.
- Preserve the existing HTTP contract and APP bed-control prohibition.
- Do not add third-party dependencies.

---

### Task 1: Define AI-only interpreter behavior

**Files:**
- Modify: `tests/test_model_integration.py`
- Modify: `tests/test_intents.py`
- Modify: `src/care_bed_agent/model_interpreter.py`
- Modify: `src/care_bed_agent/intents.py`

**Interfaces:**
- Consumes: `ChatModel.complete(messages, response_format="json_object")`.
- Produces: `AiIntentInterpreter.interpret(text) -> Intent`.

- [x] Add failing tests proving every natural-language request invokes the model.
- [x] Add failing tests for malformed JSON, negation, invalid actions, and low confidence.
- [x] Run the focused tests and verify expected failures.
- [x] Implement the AI-only interpreter and remove production keyword matching.
- [x] Run the focused tests and verify they pass.

### Task 2: Inject deterministic AI fixtures into behavior tests

**Files:**
- Create: `tests/support.py`
- Modify: `tests/test_agent_orchestrator.py`
- Modify: `tests/test_api.py`
- Modify: `tests/test_care_skill.py`
- Modify: `tests/test_daily_life_skill.py`
- Modify: `tests/test_relationship_skill.py`
- Modify: `tests/test_system.py`

**Interfaces:**
- Produces: `ScriptedIntentModel` and `build_test_system()` for deterministic tests.

- [x] Add a failing test fixture that models typed AI responses without network access.
- [x] Update behavior tests to inject the model fixture.
- [x] Verify natural-language behavior no longer depends on production templates.

### Task 3: Add a low-latency intent profile

**Files:**
- Modify: `src/care_bed_agent/llm.py`
- Modify: `src/care_bed_agent/bootstrap.py`
- Modify: `src/care_bed_agent/__main__.py`
- Modify: `tests/test_glm_client.py`

**Interfaces:**
- Produces: one injected intent `ChatModel` dependency.
- Produces: an intent settings profile using low reasoning, non-streaming output, and a short timeout.

- [x] Add failing settings and dependency-injection tests.
- [x] Implement the intent profile and single-call dependency.
- [x] Run focused settings and integration tests.

### Task 4: Document and verify

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Documents AI-only semantics, latency settings, and safe failure behavior.

- [x] Update configuration and architecture documentation.
- [x] Run the complete unit-test suite.
- [x] Compile all Python sources.
- [x] Run live GLM checks for a natural phrase, a negated command, and companion chat without exposing credentials.
