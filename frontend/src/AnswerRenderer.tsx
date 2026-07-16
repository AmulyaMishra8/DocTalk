import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { ReactNode } from 'react';

// Citation markers arrive in two shapes: our own `[3]`, and the model's native
// `【3†L1-L4】` line-anchored form. Both resolve to a source number.
const CITE_RE = /(\[\d+\]|【[^】]*】)/g;

function citeNum(token: string): string | null {
  const m = token.match(/^\[(\d+)\]$/) || token.match(/^【\s*(\d+)/);
  return m ? m[1] : null;
}

// Walk a React node tree and replace citation markers with chip spans,
// collapsing runs that point at the same source (e.g. 【1†L1】【1†L9】 -> one [1]).
function injectCites(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(CITE_RE);
    if (parts.length === 1) return node;
    const out: ReactNode[] = [];
    let lastNum: string | null = null;
    parts.forEach((p, i) => {
      const num = citeNum(p);
      if (num !== null) {
        if (num === lastNum) return; // skip consecutive duplicate reference
        out.push(<span key={i} className="cite">{num}</span>);
        lastNum = num;
      } else {
        if (p.trim() !== '') lastNum = null; // real text breaks the run
        out.push(p);
      }
    });
    return out;
  }
  if (Array.isArray(node)) return (node as ReactNode[]).map((c, i) => <span key={i}>{injectCites(c)}</span>);
  return node;
}

type MDProps = { children?: ReactNode; node?: unknown };

const components: Components = {
  // Inject citation chips into paragraphs and list items where they appear.
  p:    ({ children }: MDProps) => <p className="md-p">{injectCites(children)}</p>,
  li:   ({ children }: MDProps) => <li>{injectCites(children)}</li>,
  // Headings — answers rarely have these but handle them gracefully.
  h1:   ({ children }: MDProps) => <h2 className="md-h">{children}</h2>,
  h2:   ({ children }: MDProps) => <h3 className="md-h">{children}</h3>,
  h3:   ({ children }: MDProps) => <h4 className="md-h">{children}</h4>,
  // Inline code and code blocks.
  code: ({ children, className }: MDProps & { className?: string }) =>
    className
      ? <pre className="md-pre"><code>{children}</code></pre>
      : <code className="md-code">{children}</code>,
  // Don't open links in the doc (they'd be hallucinated URLs anyway).
  a:    ({ children, href }: MDProps & { href?: string }) =>
    <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
};

interface Props {
  text: string;
}

export function AnswerRenderer({ text }: Props) {
  return (
    <div className="md-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
