import { Activity, LockKeyhole, MoveVertical, ShieldCheck } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type BedPresentation = Extract<ServicePresentation, { kind: "bed" }>;

interface BedControlStageProps {
  presentation: BedPresentation;
}

export default function BedControlStage({ presentation }: BedControlStageProps) {
  const metrics = [
    { label: "靠背", value: `${presentation.backrest}°` },
    { label: "腿板", value: `${presentation.legrest}°` },
    { label: "床高", value: `${presentation.height} cm` },
  ];

  return (
    <div className="bed-control-stage">
      <div className="bed-target-card">
        <span className="stage-icon"><MoveVertical size={26} /></span>
        <div>
          <span>{presentation.stopped ? "当前位置" : "目标姿态"}</span>
          <strong>{presentation.posture}</strong>
          <small>目标 {presentation.targetValue}</small>
        </div>
        <span className="target-complete"><Activity size={15} />{presentation.stopped ? "保持" : "已到达"}</span>
      </div>

      <div className="bed-metrics" aria-label="床体当前数值">
        {metrics.map((metric) => (
          <div className="bed-metric" key={metric.label} aria-label={`${metric.label} ${metric.value}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>当前数值</small>
          </div>
        ))}
      </div>

      <div className="stage-safety-note">
        <ShieldCheck size={19} />
        <strong>安全锁正常 · 随时说“停止”</strong>
        <span><LockKeyhole size={14} />动作范围受保护</span>
      </div>
    </div>
  );
}
