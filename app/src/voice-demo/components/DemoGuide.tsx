import { ChevronRight, X } from "lucide-react";

import { VOICE_DOMAINS } from "../model";

interface DemoGuideProps {
  open: boolean;
  onClose: () => void;
  onSelect: (example: string) => void;
}

export default function DemoGuide({ open, onClose, onSelect }: DemoGuideProps) {
  if (!open) return null;

  return (
    <div className="demo-guide-layer">
      <button className="demo-guide-backdrop" type="button" aria-label="关闭演示指南" onClick={onClose} />
      <aside className="demo-guide" role="dialog" aria-modal="false" aria-label="演示指南">
        <div className="demo-guide__header">
          <div>
            <span className="section-kicker">演示指南</span>
            <h2 id="demo-guide-title">试着这样说</h2>
            <p>点击一句话，只会填入输入框。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭演示指南" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="demo-guide__groups">
          {VOICE_DOMAINS.map((domain) => (
            <section key={domain.id}>
              <h3>{domain.title}</h3>
              <p>{domain.subtitle}</p>
              <div>
                {domain.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    aria-label={`示例：${example}`}
                    onClick={() => onSelect(example)}
                  >
                    <span>{example}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
