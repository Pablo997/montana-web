'use client';

import { useState, useTransition } from 'react';
import { castVote, removeVote } from '@/lib/incidents/api';
import type { Incident } from '@/types/incident';

interface Props {
  incident: Incident;
  initialUserVote?: 1 | -1 | null;
}

export function VoteButtons({ incident, initialUserVote = null }: Props) {
  const [userVote, setUserVote] = useState<1 | -1 | null>(initialUserVote);
  const [isPending, startTransition] = useTransition();

  const handle = (vote: 1 | -1) => {
    const next = userVote === vote ? null : vote;
    setUserVote(next);
    startTransition(async () => {
      try {
        if (next === null) {
          await removeVote(incident.id);
        } else {
          await castVote(incident.id, next);
        }
      } catch (err) {
        console.error(err);
        setUserVote(userVote);
      }
    });
  };

  return (
    <div className="vote" aria-busy={isPending}>
      <button
        type="button"
        onClick={() => handle(1)}
        className={`vote__button vote__button--up ${
          userVote === 1 ? 'vote__button--active' : ''
        }`}
        aria-label="Confirm incident"
      >
        <span aria-hidden>▲</span>
        <span className="vote__count">{incident.upvotes}</span>
      </button>
      <button
        type="button"
        onClick={() => handle(-1)}
        className={`vote__button vote__button--down ${
          userVote === -1 ? 'vote__button--active' : ''
        }`}
        aria-label="Report as resolved or incorrect"
      >
        <span aria-hidden>▼</span>
        <span className="vote__count">{incident.downvotes}</span>
      </button>
    </div>
  );
}
