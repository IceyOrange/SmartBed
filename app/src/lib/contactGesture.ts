export type ContactSelection = "none" | "message" | "call";
export type ContactGesturePhase =
  | "idle"
  | "choosing"
  | "recording"
  | "call-ready"
  | "calling";

export interface ContactGestureState {
  phase: ContactGesturePhase;
  selection: ContactSelection;
}

export type ContactGestureEvent =
  | { type: "LONG_PRESS_RECOGNIZED" }
  | { type: "MOVE"; deltaX: number }
  | { type: "RELEASE" }
  | { type: "RESET" };

export function createContactGestureState(): ContactGestureState {
  return { phase: "idle", selection: "none" };
}

export function reduceContactGesture(
  state: ContactGestureState,
  event: ContactGestureEvent,
): ContactGestureState {
  if (event.type === "RESET") {
    return createContactGestureState();
  }

  if (event.type === "LONG_PRESS_RECOGNIZED") {
    return { phase: "choosing", selection: "none" };
  }

  if (event.type === "MOVE" && state.phase !== "idle") {
    if (event.deltaX <= -56) {
      return { phase: "recording", selection: "message" };
    }

    if (event.deltaX >= 56) {
      return { phase: "call-ready", selection: "call" };
    }

    return { phase: "choosing", selection: "none" };
  }

  if (event.type === "RELEASE") {
    if (state.phase === "call-ready") {
      return { phase: "calling", selection: "call" };
    }

    if (state.phase === "recording") {
      return state;
    }

    return createContactGestureState();
  }

  return state;
}
