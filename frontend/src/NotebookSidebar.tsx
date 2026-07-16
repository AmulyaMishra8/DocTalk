import { useState } from 'react';

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
}

// Lucide-style line icons (per ui-ux-pro-max: no emoji as icons).
const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const FolderIcon = () => (
  <svg {...ICON} className="nb-svg" aria-hidden="true"><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" /></svg>
);
const PlusIcon = () => (<svg {...ICON} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>);
const PencilIcon = () => (<svg {...ICON} width={14} height={14} aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const TrashIcon = () => (<svg {...ICON} width={14} height={14} aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>);

interface Props {
  notebooks: Notebook[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}

export function NotebookSidebar({ notebooks, activeId, onSelect, onCreate, onDelete, onRename }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await onCreate(name);
    setNewName('');
    setCreating(false);
  }

  async function submitRename(e: React.FormEvent, id: string) {
    e.preventDefault();
    const name = renameVal.trim();
    if (!name) return;
    await onRename(id, name);
    setRenamingId(null);
  }

  return (
    <aside className="nb-sidebar">
      <div className="nb-sidebar-head">
        <span className="nb-sidebar-title">Notebooks</span>
        <button className="nb-new-btn" onClick={() => setCreating(true)} title="New notebook" aria-label="New notebook"><PlusIcon /></button>
      </div>

      <nav className="nb-list">
        {notebooks.map((nb) => (
          <div key={nb.id} className={'nb-item' + (nb.id === activeId ? ' nb-active' : '')}>
            {renamingId === nb.id ? (
              <form className="nb-rename-form" onSubmit={(e) => submitRename(e, nb.id)}>
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => setRenamingId(null)}
                  className="nb-rename-input"
                />
              </form>
            ) : (
              <>
                <button className="nb-label" onClick={() => onSelect(nb.id)}>
                  <span className="nb-icon"><FolderIcon /></span>
                  <span className="nb-name">{nb.name}</span>
                </button>
                <span className="nb-actions">
                  <button
                    className="nb-action-btn"
                    title="Rename"
                    aria-label="Rename notebook"
                    onClick={() => { setRenamingId(nb.id); setRenameVal(nb.name); }}
                  ><PencilIcon /></button>
                  <button
                    className="nb-action-btn nb-delete-btn"
                    title="Delete"
                    aria-label="Delete notebook"
                    onClick={async () => {
                      if (confirm(`Delete "${nb.name}" and all its documents?`)) {
                        await onDelete(nb.id);
                      }
                    }}
                  ><TrashIcon /></button>
                </span>
              </>
            )}
          </div>
        ))}

        {notebooks.length === 0 && !creating && (
          <p className="nb-empty">No notebooks yet.<br />Create one to start uploading.</p>
        )}
      </nav>

      {creating && (
        <form className="nb-create-form" onSubmit={submitCreate}>
          <input
            autoFocus
            placeholder="Notebook name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => { if (!newName.trim()) setCreating(false); }}
            className="nb-create-input"
          />
          <button type="submit" className="nb-create-submit" disabled={!newName.trim()}>Create</button>
        </form>
      )}
    </aside>
  );
}
