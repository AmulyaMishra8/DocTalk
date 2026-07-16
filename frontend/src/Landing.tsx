import { useEffect } from 'react';
import { Logo } from './Logo';

// Marketing landing page — what a logged-out visitor lands on at "/". The copy
// describes the real pipeline (hybrid retrieval → RRF → rerank → cited answer),
// so it doubles as the portfolio explanation of what DocTalk actually does.

const FEATURES = [
  {
    title: 'Hybrid retrieval',
    body: 'Every question runs vector search and full-text search in parallel, then merges both rankings with Reciprocal Rank Fusion. Semantic matches and exact keyword hits both survive.',
    icon: (
      <>
        <circle cx="9" cy="9" r="5.5" />
        <circle cx="15" cy="15" r="5.5" />
      </>
    ),
  },
  {
    title: 'LLM reranking',
    body: 'Fusion is fast but blunt, so a second model reads the top 15 candidates and scores them for real relevance. Only the best 5 reach the answer prompt.',
    icon: (
      <>
        <path d="M4 6h10M4 12h16M4 18h7" />
        <path d="M18 5v6M15 8l3-3 3 3" />
      </>
    ),
  },
  {
    title: 'Answers with receipts',
    body: 'The model may only answer from your documents, and cites each passage inline with [n]. Click a citation to read the exact snippet it came from — or watch it say "I don\'t know".',
    icon: (
      <>
        <path d="M9 5H6v14h3M15 5h3v14h-3" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
  {
    title: 'Streaming responses',
    body: 'Answers arrive token by token over Server-Sent Events, with citations resolved at the end. No spinner-staring while a paragraph is composed.',
    icon: (
      <>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
      </>
    ),
  },
  {
    title: 'Real PDFs, handled',
    body: 'Uploads are converted through MarkItDown, deduplicated by content hash, then chunked and embedded on a background queue. Watch each file move through the pipeline live.',
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  {
    title: 'Notebooks, not a pile',
    body: 'Group documents into notebooks and keep questions scoped to one set at a time. Everything is private to your account, enforced on every request.',
    icon: (
      <>
        <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2Z" />
        <path d="M9 3v18" />
      </>
    ),
  },
];

const STEPS = [
  { n: '01', title: 'Upload', body: 'Drop in a batch of PDFs. Each one becomes a queued job.' },
  { n: '02', title: 'Convert', body: 'MarkItDown turns the PDF into clean Markdown.' },
  { n: '03', title: 'Embed', body: 'Text is chunked and stored as 768-dim vectors in pgvector.' },
  { n: '04', title: 'Retrieve', body: 'Vector + keyword search run in parallel, fused by RRF.' },
  { n: '05', title: 'Rerank', body: 'A model scores the candidates and keeps the best few.' },
  { n: '06', title: 'Answer', body: 'A grounded reply streams back, cited line by line.' },
];

// Adds .is-in to every .dt-reveal once it scrolls into view, which is what the
// stylesheet transitions on. One observer for the whole page; each element is
// unobserved after it fires so reveals don't replay on scroll-back.
function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.dt-reveal'));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  useScrollReveal();

  return (
    <div className="dt-landing">
      <header className="dt-nav">
        <div className="dt-nav-brand">
          <Logo size={44} />
        </div>
        <nav className="dt-nav-links">
          <a href="#features">Features</a>
          <a href="#pipeline">How it works</a>
        </nav>
        <button className="dt-btn dt-btn-ghost" onClick={onSignIn}>Sign in</button>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="dt-hero">
          <p className="dt-eyebrow dt-stagger" style={{ '--i': 0 } as React.CSSProperties}>
            <span className="dt-dot" aria-hidden="true" />
            Retrieval-augmented, not retrieval-adjacent
          </p>
          <h1 className="dt-hero-title dt-stagger" style={{ '--i': 1 } as React.CSSProperties}>
            Ask your documents.<br />
            <em>Get answers with receipts.</em>
          </h1>
          <p className="dt-hero-sub dt-stagger" style={{ '--i': 2 } as React.CSSProperties}>
            DocTalk reads your PDFs and answers questions about them — grounded in the
            actual text, cited line by line, and honest enough to say when the answer
            simply isn't in there.
          </p>
          <div className="dt-hero-cta dt-stagger" style={{ '--i': 3 } as React.CSSProperties}>
            <button className="dt-btn dt-btn-primary" onClick={onSignIn}>
              Try it now
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <a className="dt-btn dt-btn-ghost" href="#pipeline">See how it works</a>
          </div>
          <p className="dt-hero-note dt-stagger" style={{ '--i': 4 } as React.CSSProperties}>
            A sample login is on the sign-in screen — no signup needed to look around.
          </p>

          {/* Faux answer card: shows the citation UX the app actually produces. */}
          <div className="dt-proof dt-stagger" style={{ '--i': 5 } as React.CSSProperties}>
            <div className="dt-proof-bar" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="dt-proof-body">
              <p className="dt-proof-q">How much parental leave do new engineers get?</p>
              <p className="dt-proof-a">
                Full-time employees receive <strong>16 weeks of paid parental leave</strong>,
                available any time within the first year <span className="dt-cite">[1]</span>.
                Engineers on probation accrue it but can't draw on it until month
                three <span className="dt-cite">[2]</span>.
              </p>
              <div className="dt-proof-cites">
                <span className="dt-chip"><b>[1]</b> handbook-2026.pdf</span>
                <span className="dt-chip"><b>[2]</b> leave-policy.pdf</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="dt-section" id="features">
          <div className="dt-section-head dt-reveal">
            <h2>Built around the hard part</h2>
            <p>
              Anyone can stuff a PDF into a prompt. The difficulty is finding the right
              passage in a pile of them, and proving the answer came from there.
            </p>
          </div>
          <div className="dt-grid">
            {FEATURES.map((f, i) => (
              <article
                className="dt-card dt-reveal"
                key={f.title}
                style={{ '--d': `${(i % 3) * 90}ms` } as React.CSSProperties}
              >
                <span className="dt-card-icon" aria-hidden="true"><Icon>{f.icon}</Icon></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Pipeline ── */}
        <section className="dt-section" id="pipeline">
          <div className="dt-section-head dt-reveal">
            <h2>From upload to answer</h2>
            <p>Six stages, each one observable while it runs.</p>
          </div>
          <ol className="dt-steps">
            {STEPS.map((s, i) => (
              <li
                className="dt-step dt-reveal"
                key={s.n}
                style={{ '--d': `${(i % 3) * 90}ms` } as React.CSSProperties}
              >
                <span className="dt-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Closing CTA ── */}
        <section className="dt-final dt-reveal">
          <h2>Point it at your own documents.</h2>
          <p>Upload a handful of PDFs and start asking. It takes about a minute.</p>
          <button className="dt-btn dt-btn-primary" onClick={onSignIn}>
            Get started
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </section>
      </main>

      <footer className="dt-foot">
        <Logo size={36} />
        <span className="dt-foot-note">Hybrid search · reranking · grounded citations</span>
      </footer>
    </div>
  );
}
