import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { VOICE_DOMAINS } from "../model";

interface DemoGuideProps {
  open: boolean;
  onClose: () => void;
  onSelect: (example: string) => void;
}

export default function DemoGuide({ open, onClose, onSelect }: DemoGuideProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    closeButtonRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="demo-guide-layer">
      <button className="demo-guide-backdrop" type="button" aria-label="关闭演示指南" onClick={onClose} />
      <aside
        ref={panelRef}
        className="demo-guide"
        role="dialog"
        aria-modal="true"
        aria-label="演示指南"
        aria-describedby="demo-guide-description"
      >
        <div className="demo-guide__header">
          <div>
            <span className="section-kicker">演示指南</span>
            <h2 id="demo-guide-title">试着这样说</h2>
            <p id="demo-guide-description">点击一句话，只会填入输入框。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" aria-label="关闭演示指南" onClick={onClose}>
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
