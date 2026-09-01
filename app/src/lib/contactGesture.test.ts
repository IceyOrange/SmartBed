import { describe, expect, it } from "vitest";

import {
  createContactGestureState,
  reduceContactGesture,
} from "./contactGesture";

describe("contact gesture", () => {
  it("reveals two explicit choices after a long press", () => {
    const state = reduceContactGesture(createContactGestureState(), {
      type: "LONG_PRESS_RECOGNIZED",
    });

    expect(state.phase).toBe("choosing");
    expect(state.selection).toBe("none");
  });

  it("starts recording when the user slides left", () => {
    const choosing = reduceContactGesture(createContactGestureState(), {
      type: "LONG_PRESS_RECOGNIZED",
    });
    const recording = reduceContactGesture(choosing, {
      type: "MOVE",
      deltaX: -88,
    });

    expect(recording.phase).toBe("recording");
    expect(recording.selection).toBe("message");
  });

  it("starts a call when the user slides right and releases", () => {
    const choosing = reduceContactGesture(createContactGestureState(), {
      type: "LONG_PRESS_RECOGNIZED",
    });
    const callReady = reduceContactGesture(choosing, {
      type: "MOVE",
      deltaX: 88,
    });
    const calling = reduceContactGesture(callReady, { type: "RELEASE" });

    expect(calling.phase).toBe("calling");
    expect(calling.selection).toBe("call");
  });

  it("cancels when the user releases without choosing", () => {
    const choosing = reduceContactGesture(createContactGestureState(), {
      type: "LONG_PRESS_RECOGNIZED",
    });
    const idle = reduceContactGesture(choosing, { type: "RELEASE" });

    expect(idle).toEqual(createContactGestureState());
  });
});
