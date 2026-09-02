import { Check, CircleHelp, ShieldCheck, X } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type FeedbackPresentation = Extract<ServicePresentation, { kind: "confirmation" | "feedback" }>;

interface FeedbackStageProps {
  presentation: FeedbackPresentation;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FeedbackStage({ presentation, onConfirm, onCancel }: FeedbackStageProps) {
  if (presentation.kind === "confirmation") {
    return (
      <div className="feedback-stage feedback-stage--confirmation">
        <span className="feedback-icon"><CircleHelp size={30} /></span>
        <span>准备执行</span>
        <strong>{presentation.action}</strong>
        <div className="confirmation-actions">
          <button type="button" onClick={onCancel}><X size={18} />取消操作</button>
          <button type="button" className="confirm-button" onClick={onConfirm}><Check size={18} />确认执行</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`feedback-stage feedback-stage--${presentation.tone}`}>
      <span className="feedback-icon"><ShieldCheck size={30} /></span>
      <strong>{presentation.detail ?? (presentation.tone === "safe" ? "建议联系专业医护人员" : "请换一种更具体的说法")}</strong>
    </div>
  );
}
