import { getLocale, getTranslations } from 'next-intl/server';

interface Props {
  email: string;
  username: string | null;
  createdAt: string | null;
}

function initialsFrom(username: string | null, email: string): string {
  const source = (username ?? email.split('@')[0] ?? '?').trim();
  const parts = source.split(/[\s_.-]+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Identity card at the top of the profile page. Intentionally minimal —
 * the user already knows who they are, this just frames the page and
 * anchors the stats underneath.
 */
export async function ProfileHeader({ email, username, createdAt }: Props) {
  const t = await getTranslations('profile');
  const locale = await getLocale();

  const formatted = (() => {
    if (!createdAt) return t('memberSinceUnknown');
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return t('memberSinceUnknown');
    // `Intl.DateTimeFormat` keeps month names localised without
    // requiring per-language template strings.
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  })();

  return (
    <header className="profile-header">
      <div className="profile-header__avatar" aria-hidden="true">
        {initialsFrom(username, email)}
      </div>
      <div className="profile-header__text">
        <h1 className="profile-header__name">{username ?? t('anonymous')}</h1>
        <p className="profile-header__email">{email}</p>
        <p className="profile-header__since">
          {t('memberSince', { date: formatted })}
        </p>
      </div>
    </header>
  );
}
