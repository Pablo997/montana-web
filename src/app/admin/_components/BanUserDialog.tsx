'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { banUser } from '@/app/admin/actions';

interface Props {
  userId: string;
  username: string | null;
  onClose: () => void;
}

const DURATIONS: ReadonlyArray<{ id: string; interval: string | null }> = [
  { id: '24h', interval: '1 day' },
  { id: '7d', interval: '7 days' },
  { id: '30d', interval: '30 days' },
  { id: 'perm', interval: null },
];

export function BanUserDialog({ userId, username, onClose }: Props) {
  const t = useTranslations('admin.banDialog');
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
      setError(t('reasonError'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await banUser(userId, trimmed, duration);
      if (!result.ok) {
        setError(result.error ?? t('errorFallback'));
        return;
      }
      onClose();
    });
  };

  const displayUser = username ?? userId.slice(0, 8);

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
          {t('title')}
        </h2>
        <p className="admin-modal__body">
          {t.rich('body', {
            user: displayUser,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>

        <fieldset className="admin-modal__field">
          <legend>{t('durationLegend')}</legend>
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
                {t(`durations.${d.id}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="admin-modal__field">
          <span>{t('reasonLabel')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('reasonPlaceholder')}
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
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="button button--danger"
            disabled={pending}
          >
            {pending ? t('submitting') : t('submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
