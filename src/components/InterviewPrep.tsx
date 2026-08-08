import type { InterviewQA } from "../types";
import { Markdown } from "./Markdown";

interface Props {
  items: InterviewQA[];
}

/** Collapsible interview Q&A list. */
export function InterviewPrep({ items }: Props) {
  return (
    <div className="interview">
      {items.map((qa, i) => (
        <details className="interview-qa" key={i}>
          <summary className="interview-q">
            <span className="interview-badge">Q</span>
            {qa.q}
          </summary>
          <div className="interview-a">
            <Markdown>{qa.a}</Markdown>
          </div>
        </details>
      ))}
    </div>
  );
}
