'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { castVote, removeVote } from '@/lib/incidents/api';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMapStore } from '@/store/useMapStore';
import type { Incident } from '@/types/incident';

interface Props {
  incident: Incident;
}

type Vote = 1 | -1;

/**
 * Up/down vote control for a single incident.
 *
 * UX decisions:
 *   - The author of an incident cannot vote on it (matches the RLS policy
 *     `incident_votes_upsert_self`). We hide the buttons entirely instead
 *     of disabling them so the card stays clean for self-authored items.
 *   - Anonymous visitors are bounced to the sign-in page on click — same
 *     pattern as the "Report" FAB.
 *   - Counts are updated optimistically via `upsertIncident` so the UI
 *     feels instant; the voting trigger on the server will then broadcast
 *     the authoritative counts via realtime, which merges into the store.
 *   - The current viewer's vote is already embedded in `incident.userVote`
 *     (hydrated by the read RPCs), so we render with the right selected
 *     state on first paint — no hydration flicker.
 */
export function VoteButtons({ incident }: Props) {
  const router = useRouter();
  const { userId } = useCurrentUser();
  const upsertIncident = useMapStore((s) => s.upsertIncident);
  const [isPending, startTransition] = useTransition();

  const isAuthor = userId !== null && userId === incident.userId;
  const userVote = incident.userVote;

  if (isAuthor) {
    return (
      <div className="vote vote--readonly" aria-label="Incident score">
        <span className="vote__count vote__count--up">▲ {incident.upvotes}</span>
        <span className="vote__count vote__count--down">▼ {incident.downvotes}</span>
      </div>
    );
  }

  const handle = (vote: Vote) => {
    if (!userId) {
      router.push('/auth/sign-in');
      return;
    }
    const previous = userVote;
    const next: Vote | null = previous === vote ? null : vote;
    upsertIncident(applyVoteDelta(incident, previous, next));

    startTransition(async () => {
      try {
        if (next === null) await removeVote(incident.id);
        else await castVote(incident.id, next);
      } catch (err) {
        console.error(err);
        // Roll back optimistic UI. The authoritative counts will be
        // re-synced on the next realtime event or viewport refetch.
        upsertIncident(incident);
      }
    });
  };

  return (
    <div className="vote" aria-busy={isPending}>
      <button
        type="button"
        onClick={() => handle(1)}
        className={`vote__button vote__button--up${
          userVote === 1 ? ' vote__button--active' : ''
        }`}
        aria-label="Confirm incident"
        aria-pressed={userVote === 1}
        disabled={isPending}
      >
        <span aria-hidden>▲</span>
        <span className="vote__count">{incident.upvotes}</span>
      </button>
      <button
        type="button"
        onClick={() => handle(-1)}
        className={`vote__button vote__button--down${
          userVote === -1 ? ' vote__button--active' : ''
        }`}
        aria-label="Flag as resolved or incorrect"
        aria-pressed={userVote === -1}
        disabled={isPending}
      >
        <span aria-hidden>▼</span>
        <span className="vote__count">{incident.downvotes}</span>
      </button>
    </div>
  );
}

/**
 * Returns a copy of `incident` whose up/down counts reflect the change
 * from `previous` to `next`. Used for optimistic UI; the server trigger
 * owns the real aggregation.
 */
function applyVoteDelta(
  incident: Incident,
  previous: Vote | null,
  next: Vote | null,
): Incident {
  let up = incident.upvotes;
  let down = incident.downvotes;

  if (previous === 1) up -= 1;
  if (previous === -1) down -= 1;
  if (next === 1) up += 1;
  if (next === -1) down += 1;

  return {
    ...incident,
    upvotes: Math.max(0, up),
    downvotes: Math.max(0, down),
    score: Math.max(0, up) - Math.max(0, down),
    userVote: next,
  };
}
