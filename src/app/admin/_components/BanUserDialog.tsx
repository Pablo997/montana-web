'use client';

import { useEffect, useState, useTransition } from 'react';
import { banUser } from '@/app/admin/actions';

interface Props {
  userId: string;
  username: string | null;
  onClose: () => void;
}

const DURATIONS: Array<{ id: string; label: string; interval: string | null }> = [
  { id: '24h', label: '24 hours', interval: '1 day' },
  { id: '7d', label: '7 days', interval: '7 days' },
  { id: '30d', label: '30 days', interval: '30 days' },
  { id: 'perm', label: 'Permanent', interval: null },
];

export function BanUserDialog({ userId, username, onClose }: Props) {
  const [durationId, setDurationId] = useState<string>('7d');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const duration = DURATIONS.find((d) => d.id === durationId)?.interval ?? null;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Please describe why you are banning this user (3+ chars).');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await banUser(userId, trimmed, duration);
      if (!result.ok) {
        setError(result.error ?? 'Failed to ban user.');
        return;
      }
      onClose();
    });
  };

  return (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-ban-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="admin-modal__card" onSubmit={handleSubmit}>
        <h2 id="admin-ban-title" className="admin-modal__title">
          Ban user
        </h2>
        <p className="admin-modal__body">
          Banning <strong>{username ?? userId.slice(0, 8)}</strong> immediately
          prevents them from posting, voting or reporting. Reads are not
          affected. You can revert this from the Bans tab.
        </p>

        <fieldset className="admin-modal__field">
          <legend>Duration</legend>
          <div className="admin-modal__choices">
            {DURATIONS.map((d) => (
              <label key={d.id} className="admin-modal__choice">
                <input
                  type="radio"
                  name="duration"
                  value={d.id}
                  checked={durationId === d.id}
                  onChange={() => setDurationId(d.id)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="admin-modal__field">
          <span>Reason (visible to the banned user)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Repeated false reports after warnings."
            autoFocus
          />
        </label>

        {error ? <p className="admin-modal__error">{error}</p> : null}

        <div className="admin-modal__actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--danger"
            disabled={pending}
          >
            {pending ? 'Banning…' : 'Ban user'}
          </button>
        </div>
      </form>
    </div>
  );
}
