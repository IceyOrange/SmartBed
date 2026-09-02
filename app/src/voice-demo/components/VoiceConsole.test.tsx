import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VoiceConsole from "./VoiceConsole";

function renderConsole(overrides: Record<string, unknown> = {}) {
  const props = {
    draft: "",
    inputRef: createRef<HTMLInputElement>(),
    interimTranscript: "",
    listening: false,
    speechMessage: "点击麦克风或按空格键开始说话",
    speechStarting: false,
    submitting: false,
    failedRequest: null,
    onDraftChange: vi.fn(),
    onFillExample: vi.fn(),
    onOpenGuide: vi.fn(),
    onRetry: vi.fn(),
    onSubmit: vi.fn(),
    onToggleListening: vi.fn(),
    ...overrides,
  };
  return render(<VoiceConsole {...props} />);
}

describe("VoiceConsole", () => {
  it("uses one horizontal bedside control without model-process copy", () => {
    renderConsole({ submitting: true, speechMessage: "正在处理…" });

    const button = screen.getByRole("button", { name: "正在识别语音" });
    expect(button).toBeDisabled();
    expect(button.closest(".voice-control")).toBeInTheDocument();
    expect(screen.getByText("正在处理")).toBeInTheDocument();
    expect(screen.queryByText("已听清")).not.toBeInTheDocument();
    expect(screen.queryByText("理解需要")).not.toBeInTheDocument();
    expect(screen.queryByText("安全处理")).not.toBeInTheDocument();
  });

  it("shows the approved idle instruction and physical space-key hint", () => {
    renderConsole();

    expect(screen.getByRole("heading", { name: "现在需要什么帮助？" })).toBeInTheDocument();
    expect(screen.getByText("点击开始说话")).toBeInTheDocument();
    expect(screen.getByText("也可以按空格键")).toBeInTheDocument();
    expect(screen.getByText("空格").tagName).toBe("KBD");
  });
});
