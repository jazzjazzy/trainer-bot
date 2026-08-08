import type { CodeComparison, ComparisonConfig } from "../types";
import { Highlight } from "./Highlight";
import { useAI } from "../ai/AIContext";

interface Props {
  items: CodeComparison[];
  config: ComparisonConfig;
}

/** The side-by-side code comparison grid (labels/languages per course). */
export function PhpVsTs({ items, config }: Props) {
  const { openAsk } = useAI();

  return (
    <div className="comparisons">
      {items.map((item, i) => (
        <div className="comparison" key={i}>
          {item.label && <h4 className="comparison-label">{item.label}</h4>}
          {item.intro && <p className="comparison-intro">{item.intro}</p>}
          <div className="comparison-grid">
            <div className="comparison-col">
              <span className="lang-tag cmp-before">{config.leftLabel}</span>
              <Highlight code={item.php} lang={item.leftLang ?? config.leftLang} />
            </div>
            <div className="comparison-col">
              <span className="lang-tag cmp-after">{config.rightLabel}</span>
              <Highlight code={item.ts} lang={item.rightLang ?? config.rightLang} />
            </div>
          </div>
          {item.note && (
            <p className="comparison-note">
              <strong>Difference:</strong> {item.note}
            </p>
          )}
          <button
            className="ask-btn"
            onClick={() =>
              openAsk({
                question:
                  "Why is the new version written this way, and how does it relate to the old one? Walk me through the difference.",
                lang: config.rightLang === "php" ? "php" : "typescript",
                code: `// ${config.leftLabel}\n${item.php}\n\n// ${config.rightLabel}\n${item.ts}`,
              })
            }
          >
            ✨ Ask AI about this
          </button>
        </div>
      ))}
    </div>
  );
}
