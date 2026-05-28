-- ============================================================================
-- Discard duplicate auth.users row created by a second-provider sign-up
-- -----------------------------------------------------------------------------
-- WHEN THIS RPC ACTUALLY FIRES
-- ----------------------------
-- Supabase has a built-in "secure same-email linking" behaviour: if the
-- OAuth provider returns an email that is already in `auth.users` AND that
-- email is marked as verified by the provider, Supabase attaches the new
-- identity to the EXISTING user instead of creating a new one. Google,
-- Apple, Microsoft, GitLab and most major providers all flag email as
-- verified, so for those this RPC is a no-op (no duplicate ever appears).
--
-- It IS needed for:
--   * Providers that don't verify email (legacy OIDC, custom SAML, some
--     enterprise SSO setups, GitHub when the user's primary email is
--     private),
--   * Providers configured to omit the email scope,
--   * Apple "Hide my email" relay flow (returns a private @privaterelay
--     address that won't match the user's real email),
--   * Future-proofing if Supabase changes its default linking policy.
--
-- In those cases Supabase WILL create a brand-new `auth.users` row, the
-- two accounts share an email but nothing else, and the duplicate is an
-- empty husk that the user keeps signing into by accident. This RPC
-- catches that.
--
-- This RPC is called by `/auth/callback` immediately after
-- `exchangeCodeForSession`. It:
--   1. Looks at the current session's user.
--   2. Checks whether another `auth.users` row exists with the SAME email.
--   3. Decides which one is the "original" — by `created_at`, oldest wins.
--   4. If the current user is the duplicate AND has no meaningful data
--      attached yet, deletes the current `auth.users` row (cascading
--      through every public table with FK on it) and reports back so the
--      callback can sign the user out and bounce them to the sign-in page
--      with a clear explanation.
--
-- Returns a JSON object describing the outcome. The `action` field is the
-- only one the route handler reads; the rest is there for debugging /
-- observability and is safe to ignore.
-- ============================================================================

create or replace function public.discard_duplicate_account_for_email()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_my_created_at timestamptz;
  v_oldest_other_id uuid;
  v_oldest_other_created_at timestamptz;
  v_my_incidents integer;
begin
  if v_uid is null then
    return jsonb_build_object('action', 'noop', 'reason', 'no_session');
  end if;

  -- Pull the current user's email + creation time. We trust the row
  -- because we're SECURITY DEFINER; the caller is implicitly the user
  -- itself via `auth.uid()`.
  select email, created_at
    into v_email, v_my_created_at
    from auth.users
   where id = v_uid;

  if v_email is null then
    return jsonb_build_object('action', 'noop', 'reason', 'no_email');
  end if;

  -- Look for the OLDEST row that shares the email — that's the
  -- candidate "original" account. We ignore the current user here so
  -- self-comparison never matches.
  select id, created_at
    into v_oldest_other_id, v_oldest_other_created_at
    from auth.users
   where lower(email) = lower(v_email)
     and id <> v_uid
   order by created_at asc
   limit 1;

  if v_oldest_other_id is null then
    return jsonb_build_object('action', 'noop', 'reason', 'no_duplicate');
  end if;

  -- A duplicate exists. The "original" is whichever row was created
  -- first. If WE are older, the other one is the duplicate (which is
  -- not OUR problem on this request — they're not signed in here).
  if v_my_created_at <= v_oldest_other_created_at then
    return jsonb_build_object(
      'action', 'noop',
      'reason', 'we_are_original',
      'other_user_id', v_oldest_other_id
    );
  end if;

  -- We are the duplicate. SAFETY GUARD: only discard if no meaningful
  -- data is hanging off our id yet. The trigger from migration 00007
  -- creates a `profiles` row on every sign-up, so a fresh-duplicate
  -- session will always have one profile row — that's expected and
  -- doesn't count as "data". We check what actually matters: did the
  -- user already publish anything before this callback?
  select count(*) into v_my_incidents
    from public.incidents
   where user_id = v_uid;

  if v_my_incidents > 0 then
    -- The duplicate has already created incidents between sign-up
    -- and now (millisecond-window race, or the user got distracted
    -- in the OAuth screen and someone resumed). Don't auto-delete:
    -- the merge would need manual handling. Tell the route handler
    -- to sign the user out with a generic "duplicate" message.
    return jsonb_build_object(
      'action', 'manual',
      'reason', 'has_data',
      'email', v_email,
      'kept_user_id', v_oldest_other_id
    );
  end if;

  -- Safe to delete. Cascading FKs in `public.*` wipe the matching
  -- profiles / push_subscriptions / notifications rows automatically.
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'action', 'discarded',
    'email', v_email,
    'kept_user_id', v_oldest_other_id
  );
end;
$$;

revoke all on function public.discard_duplicate_account_for_email() from public;
grant execute on function public.discard_duplicate_account_for_email() to authenticated;

comment on function public.discard_duplicate_account_for_email() is
  'Called by /auth/callback after exchangeCodeForSession. Detects '
  'and removes the duplicate auth.users row created when a user signs '
  'in with a second provider on an email that already has an account. '
  'Returns a JSON object whose `action` is one of: noop | discarded | manual.';
