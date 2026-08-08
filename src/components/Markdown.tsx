import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight } from "./Highlight";

interface Props {
  children: string;
}

/** Renders lesson markdown, routing fenced code through our highlighter. */
export function Markdown({ children }: Props) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const text = String(children ?? "");
            const match = /language-(\w+)/.exec(className || "");
            // Inline code (no language, single line) renders plainly.
            if (!match && !text.includes("\n")) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }
            return <Highlight code={text} lang={match ? match[1] : "plaintext"} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
