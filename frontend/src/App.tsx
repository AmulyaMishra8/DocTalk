import { useRef, useState, useEffect, useCallback, type DragEvent } from 'react';
import { tryRefresh } from './auth/client';
import { useAuth } from './auth/AuthContext';
import { PipelineProgress } from './PipelineProgress';
import { AnswerRenderer } from './AnswerRenderer';
import { NotebookSidebar, type Notebook } from './NotebookSidebar';

interface Citation {
  ref: number;
  chunkId: string;
  documentId: string;
  filename: string;
  snippet: string;
}

interface DocRow {
  id: string;
  filename: string;
  createdAt: string;
  chunks: number;
}

async function apiFetch(url: string, init?: RequestInit) {
  const opts: RequestInit = { credentials: 'include', ...init };
  let res = await fetch(url, opts);
  if (res.status === 401 && (await tryRefresh())) res = await fetch(url, opts);
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  return { res, data: data as Record<string, any> };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App({ sidebarOpen = true }: { sidebarOpen?: boolean }) {
  const { refresh: revalidateSession } = useAuth();

  // ── Notebooks ──
  const [notebooks, setNotebooks]     = useState<Notebook[]>([]);
  const [activeNbId, setActiveNbId]   = useState<string | null>(null);
  const [nbLoading, setNbLoading]     = useState(true);

  // ── Documents in active notebook ──
  const [docs, setDocs]               = useState<DocRow[]>([]);

  // ── Upload ──
  const [files, setFiles]             = useState<File[]>([]);
  const [dragActive, setDragActive]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [resetting, setResetting]     = useState(false);
  const [trackedJobs, setTrackedJobs] = useState<{ id: string; name: string }[]>([]);
  const [jobDetails, setJobDetails]   = useState<Record<string, { state: string; progress?: unknown; failedReason?: string }>>({});
  const [pipelineClosing, setPipelineClosing] = useState(false);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Ask ──
  const [question, setQuestion]       = useState('');
  const [asking, setAsking]           = useState(false);
  const [answer, setAnswer]           = useState('');
  const [citations, setCitations]     = useState<Citation[]>([]);
  const [askError, setAskError]       = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight ask when the component unmounts.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Load notebooks on mount
  useEffect(() => {
    (async () => {
      const { res, data } = await apiFetch('/notebooks');
      if (res.ok) {
        setNotebooks(data.notebooks ?? []);
        if (data.notebooks?.length) setActiveNbId(data.notebooks[0].id);
      }
      setNbLoading(false);
    })();
  }, []);

  // Load documents when active notebook changes
  useEffect(() => {
    if (!activeNbId) { setDocs([]); return; }
    apiFetch(`/notebooks/${activeNbId}/documents`).then(({ res, data }) => {
      if (res.ok) setDocs(data.documents ?? []);
    });
  }, [activeNbId]);

  // Reload docs when a job completes
  const allDone = trackedJobs.length > 0 &&
    trackedJobs.every((j) => ['completed', 'failed', 'unknown'].includes(jobDetails[j.id]?.state ?? ''));
  const anyFailed = trackedJobs.some((j) => jobDetails[j.id]?.state === 'failed');
  useEffect(() => {
    if (allDone && activeNbId) {
      apiFetch(`/notebooks/${activeNbId}/documents`).then(({ res, data }) => {
        if (res.ok) setDocs(data.documents ?? []);
      });
    }
  }, [allDone, activeNbId]);

  // Once everything finishes cleanly, let the pipeline linger a few seconds so
  // the "Ready" state registers, then fade it out. Failures stay put.
  useEffect(() => {
    if (!allDone || anyFailed || trackedJobs.length === 0) return;
    const fade = setTimeout(() => setPipelineClosing(true), 4500);
    const remove = setTimeout(() => {
      setTrackedJobs([]);
      setJobDetails({});
      setPipelineClosing(false);
    }, 4950);
    return () => { clearTimeout(fade); clearTimeout(remove); };
  }, [allDone, anyFailed, trackedJobs.length]);

  // Poll job progress
  useEffect(() => {
    if (trackedJobs.length === 0) return;
    async function poll() {
      const ids = trackedJobs.map((j) => j.id).join(',');
      try {
        const res = await fetch(`/jobs?ids=${ids}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const next: Record<string, { state: string; progress?: unknown; failedReason?: string }> = {};
        for (const j of data.jobs) next[j.id] = { state: j.state, progress: j.progress, failedReason: j.failedReason };
        setJobDetails(next);
        const terminal = ['completed', 'failed', 'unknown'];
        if (data.jobs.every((j: { state: string }) => terminal.includes(j.state))) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch { /* retry next tick */ }
    }
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [trackedJobs]);

  // ── Notebook actions ──
  async function handleCreateNotebook(name: string) {
    const { res, data } = await apiFetch('/notebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNotebooks((prev) => [...prev, data.notebook]);
      setActiveNbId(data.notebook.id);
    }
  }

  async function handleDeleteNotebook(id: string) {
    const { res } = await apiFetch(`/notebooks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const remaining = notebooks.filter((n) => n.id !== id);
      setNotebooks(remaining);
      if (activeNbId === id) {
        setActiveNbId(remaining[0]?.id ?? null);
        setDocs([]);
        setFiles([]);
        setAnswer('');
        setCitations([]);
        setAskError(null);
        setUploadStatus(null);
        setTrackedJobs([]);
        setJobDetails({});
      }
    }
  }

  async function handleRenameNotebook(id: string, name: string) {
    const { res } = await apiFetch(`/notebooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) setNotebooks((prev) => prev.map((n) => n.id === id ? { ...n, name } : n));
  }

  function handleSelectNotebook(id: string) {
    setActiveNbId(id);
    setFiles([]);
    setAnswer('');
    setCitations([]);
    setAskError(null);
    setTrackedJobs([]);
    setJobDetails({});
    setUploadStatus(null);
  }

  // ── Upload ──
  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...pdfs.filter((f) => !seen.has(f.name + f.size))];
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!activeNbId || files.length === 0) return;
    const form = new FormData();
    files.forEach((f) => form.append('pdfs', f));
    form.append('notebookId', activeNbId);

    setUploading(true);
    setUploadStatus(null);
    try {
      const { res, data } = await apiFetch('/pdfs', { method: 'POST', body: form });
      if (res.status === 401) { await revalidateSession(); return; }
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      const ids: string[] = data.jobIds ?? [];
      setTrackedJobs(files.map((f, i) => ({ id: ids[i] ?? '', name: f.name })));
      setJobDetails({});
      setPipelineClosing(false);
      setFiles([]);
    } catch (err) {
      setUploadStatus('Error: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    const { res } = await apiFetch(`/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  async function handleReset() {
    if (!activeNbId) return;
    if (!confirm('Clear all documents in this notebook? This cannot be undone.')) return;
    setResetting(true);
    try {
      const { res, data } = await apiFetch('/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId: activeNbId }),
      });
      if (!res.ok) throw new Error(data.error);
      setDocs([]);
      setAnswer('');
      setCitations([]);
      setTrackedJobs([]);
      setJobDetails({});
    } catch (err) {
      setUploadStatus('Error: ' + (err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  // ── Ask (SSE streaming) ──
  async function handleAsk() {
    const q = question.trim();
    if (!q || !activeNbId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsking(true);
    setAnswer('');
    setCitations([]);
    setAskError(null);

    const body = JSON.stringify({ question: q, notebookId: activeNbId });
    const init: RequestInit = { method: 'POST', credentials: 'include', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body };

    try {
      let res = await fetch('/ask', init);
      if (res.status === 401 && (await tryRefresh())) res = await fetch('/ask', init);
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw) as { token?: string; citations?: Citation[]; done?: boolean; error?: string };
            if (ev.token)     setAnswer((prev) => prev + ev.token);
            if (ev.citations) setCitations(ev.citations);
            if (ev.error)     { setAskError(ev.error); break outer; }
            if (ev.done)      break outer;
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setAskError((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  const pipelineJobs = trackedJobs.map((j) => ({
    ...j,
    state: jobDetails[j.id]?.state ?? 'waiting',
    progress: jobDetails[j.id]?.progress,
    failedReason: jobDetails[j.id]?.failedReason,
  }));
  const showPipeline = pipelineJobs.length > 0;
  const activeNb = notebooks.find((n) => n.id === activeNbId);

  if (nbLoading) return <div className="nb-loading">Loading…</div>;

  return (
    <div className={'app-shell' + (showPipeline ? ' has-pipeline' : '') + (sidebarOpen ? '' : ' sidebar-hidden')}>
      <NotebookSidebar
        notebooks={notebooks}
        activeId={activeNbId}
        onSelect={handleSelectNotebook}
        onCreate={handleCreateNotebook}
        onDelete={handleDeleteNotebook}
        onRename={handleRenameNotebook}
      />

      <main className="app-main">
        {!activeNbId ? (
          <div className="nb-placeholder">
            <div className="nb-placeholder-icon">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <p>Select a notebook from the sidebar, or create one to get started.</p>
          </div>
        ) : (
          <div className="workspace">
            <header className="nb-header">
              <span className="nb-eyebrow">Notebook</span>
              <h1 className="nb-header-title">{activeNb?.name}</h1>
              <p className="nb-header-meta">
                {docs.length > 0
                  ? `${docs.length} source${docs.length === 1 ? '' : 's'} · ask anything below`
                  : 'Add a document to start asking questions'}
              </p>
            </header>

            {docs.length === 0 ? (
              /* Empty notebook — adding a source is the one thing to do. */
              <section className="add-hero">
                <div className={'dropzone dz-hero' + (dragActive ? ' drag' : '')}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                >
                  <svg className="up-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="dz-title">{dragActive ? 'Drop it here' : 'Add your first document'}</div>
                  <div className="dz-sub">Drop a PDF here or click to browse — then ask it anything.</div>
                  <input ref={inputRef} className="hidden-input" type="file" accept="application/pdf" multiple
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                </div>

                {files.length > 0 && (
                  <div className="filelist">
                    {files.map((f, i) => (
                      <div className="file-chip" key={f.name + f.size}>
                        <svg className="doc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                        <span className="fname">{f.name}</span>
                        <span className="fsize">{formatSize(f.size)}</span>
                        <button className="remove" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="row">
                      <button onClick={handleUpload} disabled={uploading}>
                        {uploading ? <><span className="spinner" /> Uploading…</> : `Add ${files.length} document${files.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  </div>
                )}
                {uploadStatus && (
                  <div className={'status' + (uploadStatus.startsWith('Error') ? ' error' : '')}>
                    <span className="dot" />{uploadStatus}
                  </div>
                )}
              </section>
            ) : (
              /* Has sources — asking is the hero. */
              <section className="ask-console">
                <label className="ask-field">
                  <span className="ask-prompt" aria-hidden="true">›</span>
                  <textarea ref={textareaRef} value={question} rows={2}
                    placeholder={`Ask anything about ${activeNb?.name}…`}
                    onChange={(e) => { setQuestion(e.target.value); autoResize(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAsk(); }}
                  />
                </label>
                <div className="ask-bar">
                  <button className="ask-go" onClick={handleAsk} disabled={asking || !question.trim()}>
                    {asking ? <><span className="spinner" /> Thinking…</> : <>Ask <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
                  </button>
                  <span className="kbd-hint"><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to ask</span>
                </div>
                {askError && <div className="status error"><span className="dot" />{askError}</div>}
              </section>
            )}

            {/* Answer — rendered as a sourced briefing. */}
            {(asking || answer) && (
              <section className="briefing">
                {asking && !answer ? (
                  <div className="thinking"><span className="spinner" /> Reading your sources…</div>
                ) : (
                  <>
                    <AnswerRenderer text={answer} />
                    {citations.length > 0 && (
                      <div className="refs">
                        <div className="nb-eyebrow refs-label">Sources</div>
                        <ol className="refs-list">
                          {citations.map((c) => (
                            <li className="ref-entry" key={c.ref}>
                              <span className="ref-num">{c.ref}</span>
                              <div className="ref-body">
                                <div className="ref-file">{c.filename}</div>
                                <div className="ref-snip">{c.snippet}…</div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* Sources in this notebook + compact add. */}
            {docs.length > 0 && (
              <section className="src-panel">
                <div className="src-head">
                  <span className="nb-eyebrow">Sources in this notebook</span>
                  <button className="ghost small" onClick={handleReset} disabled={resetting}>
                    {resetting ? 'Clearing…' : 'Clear all'}
                  </button>
                </div>
                <div className="doc-list">
                  {docs.map((d) => (
                    <div key={d.id} className="doc-row">
                      <svg className="doc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      <span className="doc-name">{d.filename}</span>
                      <span className="doc-meta">{d.chunks} chunk{d.chunks === 1 ? '' : 's'}</span>
                      <button className="doc-del" onClick={() => handleDeleteDoc(d.id)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>

                <div className={'dz-compact' + (dragActive ? ' drag' : '')}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                  {dragActive ? 'Drop to add' : 'Add another PDF'}
                  <input ref={inputRef} className="hidden-input" type="file" accept="application/pdf" multiple
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                </div>

                {files.length > 0 && (
                  <div className="filelist">
                    {files.map((f, i) => (
                      <div className="file-chip" key={f.name + f.size}>
                        <svg className="doc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                        <span className="fname">{f.name}</span>
                        <span className="fsize">{formatSize(f.size)}</span>
                        <button className="remove" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="row">
                      <button onClick={handleUpload} disabled={uploading}>
                        {uploading ? <><span className="spinner" /> Uploading…</> : `Add ${files.length} document${files.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  </div>
                )}
                {uploadStatus && (
                  <div className={'status' + (uploadStatus.startsWith('Error') ? ' error' : '')}>
                    <span className="dot" />{uploadStatus}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {showPipeline && <PipelineProgress jobs={pipelineJobs} closing={pipelineClosing} />}
    </div>
  );
}
