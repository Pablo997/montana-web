'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  initialQuery: string;
  status: string;
}

/**
 * Small free-text search box for the incidents list. Submits as a GET
 * navigation (preserving the current status tab) so results are
 * shareable and the back button works as expected.
 */
export function IncidentsSearchForm({ initialQuery, status }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = query.trim();
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.delete('page');
    if (status === 'all') params.delete('status');
    startTransition(() => {
      router.push(`/admin/incidents?${params.toString()}`);
    });
  };

  const clear = () => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('page');
    startTransition(() => {
      router.push(`/admin/incidents?${params.toString()}`);
    });
  };

  return (
    <form className="admin-search" onSubmit={submit} role="search">
      <input
        type="search"
        className="admin-search__input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title or description…"
        aria-label="Search incidents"
      />
      {initialQuery ? (
        <button
          type="button"
          className="button button--ghost"
          onClick={clear}
          disabled={pending}
        >
          Clear
        </button>
      ) : null}
      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
