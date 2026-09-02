import { Check, CircleHelp, ShieldCheck, X } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type FeedbackPresentation = Extract<ServicePresentation, { kind: "confirmation" | "feedback" }>;

interface FeedbackStageProps {
  presentation: FeedbackPresentation;
  cancelled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FeedbackStage({ presentation, cancelled, onConfirm, onCancel }: FeedbackStageProps) {
  if (presentation.kind === "confirmation") {
    if (cancelled) {
      return (
        <div className="feedback-stage feedback-stage--cancelled">
          <span className="feedback-icon"><ShieldCheck size={30} /></span>
          <div className="feedback-copy">
            <span>操作未执行</span>
            <strong>已取消，床体没有执行调整</strong>
          </div>
        </div>
      );
    }

    return (
      <div className="feedback-stage feedback-stage--confirmation">
        <span className="feedback-icon"><CircleHelp size={30} /></span>
        <div className="feedback-copy">
          <span>准备执行</span>
          <strong>{presentation.action}</strong>
        </div>
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
      <div className="feedback-copy">
        <span>{presentation.title === "操作已取消" ? "操作未执行" : presentation.tone === "safe" ? "没有执行任何操作" : "需要补充信息"}</span>
        <strong>{presentation.detail ?? (presentation.tone === "safe" ? "建议联系专业医护人员" : "请换一种更具体的说法")}</strong>
      </div>
    </div>
  );
}
