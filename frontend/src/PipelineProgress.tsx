interface Progress {
  step: 'converting' | 'chunking' | 'embedding' | 'storing' | 'done';
  current: number;
  total: number;
  chunks: number;
}

interface JobInfo {
  id: string;
  name: string;
  state: string;
  progress?: Progress | null;
  failedReason?: string;
}

interface Props {
  jobs: JobInfo[];
  closing?: boolean;
}

type StageKey = 'converting' | 'chunking' | 'embedding' | 'storing';

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'converting', label: 'Convert PDF → Markdown' },
  { key: 'chunking',   label: 'Split into chunks'      },
  { key: 'embedding',  label: 'Generate embeddings'    },
  { key: 'storing',    label: 'Store in vector DB'      },
];

const STEP_TO_IDX: Record<string, number> = {
  converting: 0, chunking: 1, embedding: 2, storing: 3, done: 4,
};

function activeSub(key: StageKey, p: Progress): string {
  if (key === 'embedding') return p.total > 0 ? `${p.current} / ${p.total} chunks` : 'Starting…';
  if (key === 'chunking')  return 'Splitting text…';
  if (key === 'converting') return 'Extracting text…';
  return 'Writing to pgvector…';
}

function doneSub(key: StageKey, p: Progress): string {
  if (key === 'chunking')  return `${p.chunks} chunks`;
  if (key === 'embedding') return `${p.total} embeddings done`;
  return 'Done';
}

function JobPipeline({ job }: { job: JobInfo }) {
  const failed  = job.state === 'failed';
  const waiting = job.state === 'waiting' || job.state === 'delayed';
  const p       = job.progress as Progress | null | undefined;
  const isDone  = job.state === 'completed' || p?.step === 'done';
  const activeIdx = isDone ? 4 : p ? (STEP_TO_IDX[p.step] ?? 0) : (job.state === 'active' ? 0 : -1);

  return (
    <div className="pipeline-job">
      <div className="pipeline-filename" title={job.name}>{job.name}</div>

      {waiting && !isDone && (
        <div className="pipeline-queued">
          <span className="ps-spinner" style={{ display: 'inline-block' }} />
          In queue…
        </div>
      )}

      {!waiting && (
        <div className="pipeline-stages">
          {STAGES.map((stage, i) => {
            const isActive = !isDone && !failed && activeIdx === i;
            const isPast   = isDone || (!failed && activeIdx > i);
            const isFail   = failed && activeIdx === i;
            const pct = stage.key === 'embedding' && isActive && p && p.total > 0
              ? Math.round((p.current / p.total) * 100)
              : 0;

            return (
              <div key={stage.key} className="pipeline-stage-wrap">
                <div className={
                  'pipeline-stage' +
                  (isActive ? ' ps-active' : isPast ? ' ps-done' : isFail ? ' ps-fail' : ' ps-idle')
                }>
                  <div className="ps-icon">
                    {isPast   ? <span className="ps-check">✓</span>  :
                     isActive  ? <span className="ps-spinner" />       :
                     isFail   ? <span className="ps-x">✕</span>      :
                                 <span className="ps-dot" />}
                  </div>
                  <div className="ps-body">
                    <span className="ps-label">{stage.label}</span>
                    {isActive && p && (
                      <span className="ps-sub">{activeSub(stage.key, p)}</span>
                    )}
                    {isPast && p && (
                      <span className="ps-sub ps-sub-done">{doneSub(stage.key, p)}</span>
                    )}
                    {isFail && (
                      <span className="ps-sub ps-sub-err">{job.failedReason ?? 'Failed'}</span>
                    )}
                    {isActive && stage.key === 'embedding' && p && p.total > 0 && (
                      <div className="ps-bar-wrap">
                        <div className="ps-bar" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={'pipeline-connector' + (activeIdx > i || isDone ? ' pc-filled' : '')} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isDone && (
        <div className="pipeline-ready">✓ Ready — ask a question below</div>
      )}
    </div>
  );
}

export function PipelineProgress({ jobs, closing }: Props) {
  const visible = jobs.filter((j) => j.state !== 'unknown');
  if (visible.length === 0) return null;
  return (
    <div className={'pipeline-panel' + (closing ? ' pipeline-closing' : '')}>
      <div className="pipeline-panel-title">Processing pipeline</div>
      {visible.map((j) => <JobPipeline key={j.id} job={j} />)}
    </div>
  );
}
