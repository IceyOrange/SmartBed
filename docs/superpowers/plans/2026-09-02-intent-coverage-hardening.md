# Intent Coverage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce generic `unknown_intent` results for realistic bedside speech while preserving strict safety behavior and proving coverage with a broad real-GLM case matrix.

**Architecture:** Keep the single-LLM-call architecture. Improve the catalog-driven system prompt so every declared example reaches the model and recognizable but incomplete supported requests are routed to capability handlers for specific clarification. Add a reusable real-model evaluation matrix covering every action, colloquial variants, missing details, context, and negative safety cases.

**Tech Stack:** Python 3 standard library, `unittest`, GLM chat-completions client, React/Vitest for regression verification.

**Spec:** `docs/superpowers/specs/2026-09-02-non-ai-bedside-capability-modules-design.md`

## Global Constraints

- Every utterance still makes at most one LLM request.
- The model never directly controls equipment or calls tools.
- Negated, quoted, hypothetical, medication-adjustment, and unsupported requests never execute.
- Missing details for a recognized supported capability must reach the existing handler clarification path.
- Real-model evaluation must not print or persist the API key.

---

### Task 1: Capture the coverage gap with prompt tests

**Files:**
- Modify: `agent/tests/test_prompting.py`
- Test: `agent/tests/test_prompting.py`

**Interfaces:**
- Consumes: `CAPABILITIES`, `build_system_prompt()`
- Produces: regression expectations that all catalog examples and clarification-routing rules are present in the generated prompt.

- [x] **Step 1: Add tests asserting every `CapabilityAction.examples` phrase appears in the prompt.**
- [x] **Step 2: Add a test asserting recognizable incomplete requests remain executable candidates for local clarification.**
- [x] **Step 3: Run `python -B -m unittest tests.test_prompting -v` and confirm both tests fail for the intended missing prompt content.**

### Task 2: Build a comprehensive real-model evaluation matrix

**Files:**
- Modify: `agent/tests/manual_glm_smoke.py`

**Interfaces:**
- Consumes: `AiIntentInterpreter.interpret(text, history)` and capability metadata.
- Produces: categorized evaluation output and nonzero exit status for misrouted intent, action, target, parameter, or unsafe execution.

- [x] **Step 1: Extend `SmokeCase` with category, optional history, expected targets, required parameter values, and allowed alternatives.**
- [x] **Step 2: Add cases for every action plus colloquial, polite, omitted-detail, follow-up, negation, hypothetical, quotation, medical, unsupported, and UI-navigation speech.**
- [x] **Step 3: Run the matrix against the current prompt and record the exact failing categories before production changes.**

### Task 3: Fix prompt generation at the source

**Files:**
- Modify: `agent/src/care_bed_agent/prompting.py`
- Modify: `agent/src/care_bed_agent/capabilities.py`
- Test: `agent/tests/test_prompting.py`

**Interfaces:**
- Consumes: `CapabilityAction.examples`, required parameters, target mode, action options.
- Produces: a catalog-derived prompt containing natural examples and explicit clarification behavior.

- [x] **Step 1: Render every action's examples inside `_format_capability()`.**
- [x] **Step 2: Replace the conflicting “信息不足不执行” rule with a distinction between unknown capability and known capability with omitted details.**
- [x] **Step 3: Add realistic colloquial examples only where the baseline matrix demonstrates a gap.**
- [x] **Step 4: Run prompt and contract tests until green.**

### Task 4: Verify safety, execution, and UI regression

**Files:**
- Modify if required by evidence: `agent/tests/manual_glm_smoke.py`
- Modify if required by evidence: `agent/src/care_bed_agent/orchestrator.py`

**Interfaces:**
- Consumes: the updated intent prompt and existing capability handlers.
- Produces: a measured pass/fail report covering model recognition and local handler behavior.

- [x] **Step 1: Run the full real-GLM matrix and inspect every failure rather than weakening expected outcomes.**
- [x] **Step 2: For recognized incomplete requests, call the bedside API and verify capability-specific clarification instead of `unknown_intent`.**
- [x] **Step 3: Run all Python tests, frontend tests, and the production build.**
- [x] **Step 4: Review the final diff, commit the focused changes, and report measured coverage and remaining intentionally unsupported speech.**
