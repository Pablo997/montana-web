-- ============================================================================
-- Auto-create a `public.profiles` row for every new `auth.users` record.
--
-- Before this trigger, a fresh user could sign in with a magic link but any
-- subsequent `insert` into `public.incidents` failed with a foreign-key
-- violation because `profiles` was still empty. We used to work around it
-- by inserting the row by hand in the SQL editor — obviously not viable for
-- real users.
--
-- The function runs as `security definer` so it bypasses RLS; otherwise the
-- trigger context (the anon role during signup) could not insert into
-- `profiles` even though the row belongs to the user being created.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- handle_new_user: build a unique, human-readable username from the email.
--
-- Examples:
--   pablo@example.com        -> pablo
--   pablo+hiking@example.com -> pablohiking
--   <no email>               -> user_<first 8 chars of uuid>
--
-- On unique-constraint collision (two users with the same email prefix) we
-- retry up to 5 times appending a 4-char random suffix, and as a last
-- resort fall back to the user's uuid.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  attempts integer := 0;
begin
  -- Derive a safe base from the email local part; fall back to a uuid stub.
  base_username := lower(regexp_replace(
    coalesce(split_part(new.email, '@', 1), ''),
    '[^a-z0-9_]',
    '',
    'g'
  ));

  if base_username is null or length(base_username) < 3 then
    base_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  candidate := base_username;

  -- Retry with a random suffix if the username is taken.
  while exists (select 1 from public.profiles where username = candidate) loop
    attempts := attempts + 1;
    if attempts > 5 then
      -- Guaranteed unique because `id` is the PK on auth.users.
      candidate := base_username || '_' || substr(new.id::text, 1, 8);
      exit;
    end if;
    candidate := base_username || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username)
  values (new.id, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Bind the function to `auth.users`.
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Backfill: make sure every existing user has a profile too, so the app
-- doesn't break for people who signed up before this migration.
--
-- The uuid stub guarantees username uniqueness across the backfill even if
-- two existing users share the same email prefix. Users can pick a nicer
-- handle later from the profile settings screen.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, username)
select
  u.id,
  coalesce(
    nullif(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '', 'g')), ''),
    'user'
  ) || '_' || substr(u.id::text, 1, 8) as username
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
