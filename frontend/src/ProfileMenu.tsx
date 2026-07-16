import { useEffect, useRef, useState } from 'react';
import type { PublicUser } from './auth/api';

// Initials for the avatar. Prefer the display name ("Ada Lovelace" → "AL");
// otherwise fall back to the email's local part, split on the separators people
// actually use ("ada.lovelace@x.com" → "AL", "amulyamishra1733@…" → "A").
// Digits are skipped so "1733ada@…" still yields a letter.
export function initialsOf(user: PublicUser): string {
  const name = user.displayName?.trim();
  const source = name || user.email.split('@')[0] || '';
  const letters = source
    .split(/[\s._+-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part].find((ch) => /\p{L}/u.test(ch)) ?? '')
    .join('');
  return (letters || source.slice(0, 1) || '?').toUpperCase();
}

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

const IconBack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const IconSignOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

interface Props {
  user: PublicUser;
  inSettings: boolean;
  onToggleSettings: () => void;
  onSignOut: () => void;
}

// The account control in the topbar: an initials avatar that opens a menu
// holding Settings and Sign out. Closes on outside click, on Escape (returning
// focus to the avatar), and after choosing an item.
export function ProfileMenu({ user, inSettings, onToggleSettings, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="pm" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="pm-avatar"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.email}`}
        title={user.email}
      >
        {initialsOf(user)}
      </button>

      {open && (
        <div className="pm-menu" role="menu">
          <div className="pm-head">
            {user.displayName && <span className="pm-name">{user.displayName}</span>}
            <span className="pm-email">{user.email}</span>
          </div>
          <button
            type="button"
            className="pm-item"
            role="menuitem"
            onClick={() => choose(onToggleSettings)}
          >
            {inSettings ? <IconBack /> : <IconSettings />}
            {inSettings ? 'Back to app' : 'Settings'}
          </button>
          <button
            type="button"
            className="pm-item"
            role="menuitem"
            onClick={() => choose(onSignOut)}
          >
            <IconSignOut />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
