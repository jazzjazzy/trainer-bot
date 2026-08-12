import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import twig from "highlight.js/lib/languages/twig";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("php", php);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
// Svelte files are close enough to HTML for hljs: the xml grammar highlights
// the markup and hands <script> contents to the javascript sub-language.
hljs.registerLanguage("svelte", xml);
// JSX/TSX highlight acceptably with the plain JS/TS grammars.
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("tsx", typescript);
// Twig templates (Drupal/Symfony theming): highlights {{ }}/{% %} plus markup.
hljs.registerLanguage("twig", twig);

interface Props {
  code: string;
  lang: string;
}

/** Static, syntax-highlighted code block (read-only). */
export function Highlight({ code, lang }: Props) {
  const html = useMemo(() => {
    // Only highlight languages we've registered; otherwise render escaped text.
    if (!hljs.getLanguage(lang)) return escapeHtml(code.trimEnd());
    try {
      return hljs.highlight(code.trimEnd(), { language: lang }).value;
    } catch {
      return escapeHtml(code.trimEnd());
    }
  }, [code, lang]);

  return (
    <pre className="code-block">
      <code
        className={`hljs language-${lang}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
