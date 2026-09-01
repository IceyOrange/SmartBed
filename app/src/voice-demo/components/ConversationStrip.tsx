import { Clock3 } from "lucide-react";

import type { DemoTurn } from "../model";

interface ConversationStripProps {
  turns: DemoTurn[];
}

export default function ConversationStrip({ turns }: ConversationStripProps) {
  if (!turns.length) return null;

  return (
    <section className="conversation-strip" aria-label="本次对话">
      <div className="conversation-strip__title">
        <Clock3 size={16} />
        <span>本次对话</span>
        <small>刷新页面后清空</small>
      </div>
      <ol>
        {turns.slice(0, 4).map((turn) => (
          <li key={turn.id}>
            <span>{turn.userText}</span>
            <strong>{turn.match.label}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
