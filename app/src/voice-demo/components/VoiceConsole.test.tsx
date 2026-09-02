import { act, createRef } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VoiceConsole from "./VoiceConsole";

describe("VoiceConsole", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances calm processing feedback while a request remains pending", () => {
    vi.useFakeTimers();
    render(
      <VoiceConsole
        draft=""
        inputRef={createRef<HTMLInputElement>()}
        interimTranscript=""
        listening={false}
        speechMessage="正在理解您的需要…"
        speechStarting={false}
        submitting
        failedRequest={null}
        onDraftChange={vi.fn()}
        onFillExample={vi.fn()}
        onOpenGuide={vi.fn()}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        onToggleListening={vi.fn()}
      />,
    );

    expect(screen.getByText("理解需要")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("安全处理")).not.toHaveAttribute("aria-current");

    act(() => vi.advanceTimersByTime(700));

    expect(screen.getByText("理解需要")).toHaveClass("is-complete");
    expect(screen.getByText("安全处理")).toHaveAttribute("aria-current", "step");
  });
});
