import { Activity, ArrowLeft, CalendarCheck2, HeartHandshake, Home, Info } from "lucide-react";
import { useEffect, useState } from "react";

import type { ServicePresentation } from "../servicePresentation";
import BedControlStage from "./stages/BedControlStage";
import CareStage from "./stages/CareStage";
import DailyLifeStage from "./stages/DailyLifeStage";
import FeedbackStage from "./stages/FeedbackStage";
import RelationshipStage from "./stages/RelationshipStage";

interface ServiceStageProps {
  presentation: ServicePresentation;
  onConfirm: () => void;
  onCancel: () => void;
  onReturnToOverview: () => void;
}

const DOMAIN_LABELS = {
  body: "身体舒适",
  care: "照护协同",
  relationship: "家人联系",
  daily: "日常服务",
  unknown: "服务反馈",
} as const;

const DOMAIN_ICONS = {
  body: Activity,
  care: HeartHandshake,
  relationship: Home,
  daily: CalendarCheck2,
  unknown: Info,
} as const;

export default function ServiceStage({ presentation, onConfirm, onCancel, onReturnToOverview }: ServiceStageProps) {
  const [secondaryState, setSecondaryState] = useState<"active" | "ended" | "paused" | "cancelled">("active");
  const DomainIcon = DOMAIN_ICONS[presentation.domain];

  useEffect(() => {
    setSecondaryState("active");
  }, [presentation]);

  let content;
  switch (presentation.kind) {
    case "bed":
      content = <BedControlStage presentation={presentation} />;
      break;
    case "reminder":
    case "record":
    case "emergency":
    case "todo":
      content = (
        <CareStage
          presentation={presentation}
          cancelled={secondaryState === "cancelled"}
          onCancelEmergency={() => setSecondaryState("cancelled")}
        />
      );
      break;
    case "call":
    case "message":
    case "anniversary":
      content = (
        <RelationshipStage
          presentation={presentation}
          ended={secondaryState === "ended"}
          paused={secondaryState === "paused"}
          onEndCall={() => setSecondaryState("ended")}
          onTogglePlayback={() => setSecondaryState((state) => state === "paused" ? "active" : "paused")}
        />
      );
      break;
    case "agenda":
    case "weather":
    case "note":
    case "companion":
    case "media":
      content = (
        <DailyLifeStage
          presentation={presentation}
          paused={secondaryState === "paused"}
          onTogglePlayback={() => setSecondaryState((state) => state === "paused" ? "active" : "paused")}
        />
      );
      break;
    case "confirmation":
    case "feedback":
      content = (
        <FeedbackStage
          presentation={presentation}
          cancelled={secondaryState === "cancelled"}
          onConfirm={onConfirm}
          onCancel={() => {
            setSecondaryState("cancelled");
            onCancel();
          }}
        />
      );
      break;
  }

  const cancelledConfirmation = presentation.kind === "confirmation" && secondaryState === "cancelled";

  return (
    <section
      className={`service-stage service-stage--${presentation.domain}`}
      data-result-kind={presentation.kind}
      aria-atomic="true"
      aria-live="polite"
      aria-labelledby="service-stage-title"
    >
      <button type="button" className="stage-return" onClick={onReturnToOverview}>
        <ArrowLeft size={17} />
        回到今日概览
      </button>
      <div className="stage-heading">
        <div>
          <span className="section-kicker"><DomainIcon size={16} />{DOMAIN_LABELS[presentation.domain]}</span>
          <h2 id="service-stage-title">{cancelledConfirmation ? "操作已取消" : presentation.title}</h2>
          <p>{cancelledConfirmation ? "床体保持原位，未执行任何动作。" : presentation.description}</p>
        </div>
        <span className="result-status">{cancelledConfirmation ? "未执行" : presentation.badge}</span>
      </div>
      <div className={`service-stage__content service-stage__content--${presentation.kind}`}>
        {content}
      </div>
    </section>
  );
}
