import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapBanRow,
  type AdminBanRawRow,
  type AdminBanRow,
} from '@/lib/admin/types';
import { BanRow } from './_components/BanRow';

const PAGE_SIZE = 50;

async function fetchBans(): Promise<AdminBanRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_bans', {
    p_limit: PAGE_SIZE,
    p_offset: 0,
  });
  if (error || !data) return [];
  return (data as AdminBanRawRow[]).map(mapBanRow);
}

export default async function AdminBansPage() {
  const rows = await fetchBans();

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1 className="admin-page__title">Active bans</h1>
        <p className="admin-page__subtitle">
          Users currently banned from interacting with the platform.
          They cannot create incidents, vote or report anything. Reading
          the map still works so they understand why their actions fail.
          Expired bans disappear from this list automatically; use
          "Unban" to lift an active one early.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="admin-empty">No active bans.</p>
      ) : (
        <ul className="admin-ban-list">
          {rows.map((row) => (
            <li key={row.userId}>
              <BanRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
