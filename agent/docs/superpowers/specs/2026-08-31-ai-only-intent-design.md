# AI-Only Natural-Language Intent Design

## Goal

Remove production keyword/template matching from natural-language understanding. Every ordinary natural-language request is classified by `glm-5.3-flash`, while deterministic event routing, emergency-stop handling, authorization, device limits, and execution remain local.

## Boundaries

- `HANDLE_CONTROL`, `EMERGENCY_STOP`, and `SAFETY_SIGNAL` remain direct deterministic events.
- `FIXED_VOICE_COMMAND`, timer events, message events, structured APP actions, and synchronization remain rule-driven structured events.
- `NATURAL_LANGUAGE` and `APP_ASSISTANT_REQUEST` always use the AI intent interpreter.
- A missing or unavailable model never falls back to keyword matching and never invents an action.
- AI produces a typed intent candidate only. Skills and controllers remain responsible for validation and execution.
- APP-originated bed-control intents remain forbidden.

## AI Intent Contract

The model returns one JSON object with:

- `kind`: one supported intent kind or `unknown`.
- `target`: optional bed target or contact.
- `action`: operation requested by the user.
- `parameters`: primitive structured fields used by the selected skill.
- `confidence`: number from `0` to `1`.
- `negated`: whether the user rejects or prohibits the action.
- `utterance_type`: `command`, `query`, `statement`, or `unknown`.
- For `companion`, `parameters.reply` contains the short user-facing response from the same model call.

The interpreter rejects unsupported kinds, invalid enum values, malformed JSON, negated action requests, and low-confidence classifications. Unsupported or incomplete requests become `unknown` or are clarified by the selected skill.

## Latency Strategy

- Use exactly one model request per natural-language classification.
- Use a dedicated intent client with `reasoning_effort=low`, non-streaming JSON output, and a shorter timeout.
- Generate a lightweight companion reply in the same structured response, avoiding a second model call.
- Keep the classification prompt compact and forbid explanatory output.
- Avoid a second model pass; deterministic validators handle schema and policy checks locally.

## Failure Behavior

- Missing API key: return a clear `ai_not_configured` response.
- Network/model failure: return `ai_unavailable`; do not execute an action.
- Invalid JSON or unsupported intent: return `unknown_intent` and ask the user to rephrase.
- Low confidence or negated command: do not execute.
- Emergency stop remains available through its dedicated local event path even when AI is unavailable.

## Compatibility

The HTTP API and skill execution result shape remain unchanged. Tests inject a deterministic fake AI model; production does not contain phrase templates or keyword intent matching.
