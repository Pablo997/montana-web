import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { captureServerError } from '@/lib/observability/sentry';

const MEDIA_BUCKET = 'incident-media';

/**
 * Fully erases the authenticated user's account (GDPR art. 17).
 *
 * The flow runs server-side on purpose:
 *  1. We verify the caller's JWT with the *user* client, so only the
 *     account's owner can trigger deletion. No admin impersonation.
 *  2. We clean every storage object under the user's prefix via the
 *     admin client. Going through the Storage API (as opposed to raw
 *     SQL on `storage.objects`) is mandatory since Supabase blocks
 *     direct DELETEs on storage tables.
 *  3. We call `auth.admin.deleteUser()`. This is the only path that
 *     removes the row from `auth.users` without tripping Supabase's
 *     internal storage-cascade triggers. Cascading FKs (profiles,
 *     incidents, votes, consents, ...) take care of everything else.
 */
export async function POST() {
  const userClient = createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  // Storage: list `${uid}/<incidentId>/<file>` and bulk-remove.
  try {
    const { data: folders, error: listError } = await admin
      .storage.from(MEDIA_BUCKET)
      .list(user.id, { limit: 1000 });

    if (listError) throw listError;

    const paths: string[] = [];
    for (const folder of folders ?? []) {
      const { data: files } = await admin
        .storage.from(MEDIA_BUCKET)
        .list(`${user.id}/${folder.name}`, { limit: 1000 });
      for (const f of files ?? []) {
        paths.push(`${user.id}/${folder.name}/${f.name}`);
      }
    }

    if (paths.length > 0) {
      const { error: removeError } = await admin.storage
        .from(MEDIA_BUCKET)
        .remove(paths);
      if (removeError) throw removeError;
    }
  } catch (err) {
    captureServerError(err, {
      tag: 'api.me.delete',
      extras: { step: 'storage-cleanup', userId: user.id },
    });
    return NextResponse.json(
      { error: 'Could not remove uploaded media. Try again.' },
      { status: 500 },
    );
  }

  // Delete the auth user. Cascades to profiles → incidents / votes /
  // consents / etc. via existing ON DELETE CASCADE FKs.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    captureServerError(deleteError, {
      tag: 'api.me.delete',
      extras: { step: 'auth-delete', userId: user.id },
    });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
