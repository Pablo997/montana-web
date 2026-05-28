'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { UserIdentity } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/** Providers we currently surface in the UI. The order also drives
 *  the render order — email first because every account has at
 *  least that one, OAuth providers below. */
const PROVIDERS = ['email', 'google'] as const;
type ProviderId = (typeof PROVIDERS)[number];

interface Props {
  identities: UserIdentity[];
}

/**
 * "Linked accounts" surface on /me. Lets the user attach a Google
 * identity to their existing magic-link account (or vice-versa) so
 * they don't end up with duplicate accounts because they signed
 * in with a different provider next time. The link flow goes
 * through Supabase's `linkIdentity` which redirects to Google and
 * returns a session that points to the SAME `auth.users` row — no
 * data migration needed.
 *
 * Safety rails:
 *   * The currently-used provider can't be unlinked while it's the
 *     only one (would lock the user out of their account).
 *   * Unlink uses the full `UserIdentity` object Supabase exposes
 *     via `getUser()` — we don't reconstruct it client-side.
 */
export function LinkedAccounts({ identities }: Props) {
  const t = useTranslations('profile.linkedAccounts');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [isPending, startTransition] = useTransition();

  // Index identities by provider so the row component can ask "is
  // Google linked?" without filtering the array on every render.
  const byProvider = useMemo(() => {
    const map = new Map<string, UserIdentity>();
    for (const identity of identities) {
      map.set(identity.provider, identity);
    }
    return map;
  }, [identities]);

  const linkedCount = identities.length;
  const isLast = linkedCount <= 1;

  const handleLink = async (provider: ProviderId) => {
    if (provider === 'email') return; // email is implicit, can't "link"
    setError(null);
    setBusy(provider);
    const supabase = createSupabaseBrowserClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect_to=/me`,
      },
    });
    if (linkError) {
      setBusy(null);
      setError(linkError.message);
    }
    // On success the browser is being redirected to Google.
  };

  const handleUnlink = async (identity: UserIdentity) => {
    setError(null);
    setBusy(identity.provider as ProviderId);
    const supabase = createSupabaseBrowserClient();
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    setBusy(null);
    if (unlinkError) {
      setError(unlinkError.message);
      return;
    }
    // Re-fetch the user from the server so the list reflects the
    // updated identity set. `router.refresh()` reruns the RSC tree
    // that owns `<LinkedAccounts identities={...} />`.
    startTransition(() => router.refresh());
  };

  return (
    <section
      className="profile-section linked-accounts"
      aria-labelledby="linked-accounts-title"
    >
      <div className="profile-section__head">
        <h2 id="linked-accounts-title" className="profile-section__title">
          {t('title')}
        </h2>
      </div>
      <p className="linked-accounts__description">{t('description')}</p>

      <ul className="linked-accounts__list">
        {PROVIDERS.map((provider) => {
          const identity = byProvider.get(provider);
          const linked = identity != null;
          const isWorking = busy === provider || isPending;
          return (
            <li key={provider} className="linked-accounts__row">
              <div className="linked-accounts__icon" aria-hidden="true">
                {provider === 'google' ? <GoogleLogo /> : <EmailIcon />}
              </div>

              <div className="linked-accounts__meta">
                <p className="linked-accounts__name">
                  {t(`providers.${provider}.name`)}
                </p>
                <p className="linked-accounts__status">
                  {linked ? (
                    <span className="linked-accounts__badge linked-accounts__badge--linked">
                      {t('statusLinked')}
                    </span>
                  ) : (
                    <span className="linked-accounts__badge linked-accounts__badge--unlinked">
                      {t('statusNotLinked')}
                    </span>
                  )}
                  {linked && identity?.identity_data?.email ? (
                    <span className="linked-accounts__email">
                      {identity.identity_data.email as string}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="linked-accounts__action">
                {linked ? (
                  provider === 'email' ? (
                    // Email/magic-link is the implicit base identity
                    // created on first sign-up. We don't allow
                    // unlinking it; would essentially mean "delete
                    // your email from the account", which is what
                    // account deletion is for.
                    <span className="linked-accounts__hint">
                      {t('emailLockedHint')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button button--ghost-danger"
                      disabled={isWorking || isLast}
                      onClick={() => identity && handleUnlink(identity)}
                      title={isLast ? t('cannotUnlinkLast') : undefined}
                    >
                      {isWorking ? t('working') : t('unlink')}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={isWorking}
                    onClick={() => handleLink(provider)}
                  >
                    {isWorking ? t('working') : t('link')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isLast ? (
        <p className="linked-accounts__notice">{t('lastProviderNotice')}</p>
      ) : null}
      {error ? (
        <p className="linked-accounts__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function GoogleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  );
}
