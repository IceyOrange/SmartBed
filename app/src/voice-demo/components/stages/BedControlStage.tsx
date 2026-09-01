import { Activity, LockKeyhole, MoveVertical, ShieldCheck } from "lucide-react";

import type { ServicePresentation } from "../../servicePresentation";

type BedPresentation = Extract<ServicePresentation, { kind: "bed" }>;

interface BedControlStageProps {
  presentation: BedPresentation;
}

function boundedPercent(value: number, maximum: number) {
  return `${Math.max(4, Math.min(100, (value / maximum) * 100))}%`;
}

export default function BedControlStage({ presentation }: BedControlStageProps) {
  const metrics = [
    { label: "靠背", value: `${presentation.backrest}°`, width: boundedPercent(presentation.backrest, 70) },
    { label: "腿板", value: `${presentation.legrest}°`, width: boundedPercent(presentation.legrest, 35) },
    { label: "床高", value: `${presentation.height} cm`, width: boundedPercent(presentation.height - 35, 35) },
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
          <div className="bed-metric" key={metric.label}>
            <strong>{metric.label} {metric.value}</strong>
            <div className="metric-track" aria-hidden="true"><span style={{ width: metric.width }} /></div>
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
