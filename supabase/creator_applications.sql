-- ============================================================================
-- Becoming a creator is granted, not claimed.
--
-- Until now the app tried to promote people itself: influencer-login ran
-- `update profiles set role = 'creator'` on the signed-in user. That has been
-- failing silently since the profile columns were hardened — the client has no
-- update grant on `role`, so the call returns 42501 and the screen logs a
-- warning nobody reads. Which means there is currently no way to become a
-- creator at all, and the one that existed was "ask and receive".
--
-- Right, because a creator can publish recipes, charge for them and take a
-- payout. That is not a checkbox.
--
-- So: an application anyone can file, and a decision only an admin can make.
-- The role is written by this function and by nothing else — no client, no
-- matter what it sends, can grant it.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.creator_applications (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  -- What they say about themselves. The only free text a stranger can put in
  -- front of an admin, so it is capped.
  pitch       text,
  links       text,
  applied_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null,
  note        text
);

alter table public.creator_applications
  drop constraint if exists creator_applications_sane_size;
alter table public.creator_applications
  add constraint creator_applications_sane_size check (
    (pitch is null or length(pitch) <= 2000)
    and (links is null or length(links) <= 500)
    and (note is null or length(note) <= 1000)
  );

create index if not exists creator_applications_status_idx
  on public.creator_applications (status, applied_at desc);

alter table public.creator_applications enable row level security;

-- You can see your own application and nothing else. Admins read through the
-- function below, which is the only thing that can see all of them.
drop policy if exists "Users read their own application" on public.creator_applications;
create policy "Users read their own application" on public.creator_applications
  for select using (auth.uid() = user_id);

revoke all on public.creator_applications from anon, authenticated;
grant select on public.creator_applications to authenticated;
-- No insert or update policy: rows are written by the functions below, so a
-- client cannot file an application as somebody else or edit a decision.

-- ── Apply ──────────────────────────────────────────────────────────────────
create or replace function public.apply_to_be_creator(p_pitch text, p_links text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_role text; existing text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select role into current_role from public.profiles where id = auth.uid();
  if current_role in ('creator', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'already_a_creator');
  end if;

  select status into existing from public.creator_applications where user_id = auth.uid();
  if existing = 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  -- A rejected application can be filed again. People improve, and a
  -- permanent no from a form is a decision nobody made deliberately.
  insert into public.creator_applications (user_id, status, pitch, links, applied_at)
  values (auth.uid(), 'pending', left(p_pitch, 2000), left(p_links, 500), now())
  on conflict (user_id) do update
    set status = 'pending', pitch = excluded.pitch, links = excluded.links,
        applied_at = now(), decided_at = null, decided_by = null, note = null;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.apply_to_be_creator(text, text) to authenticated;

-- ── Review ─────────────────────────────────────────────────────────────────
create or replace function public.admin_creator_applications(p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  return jsonb_build_object('ok', true, 'applications', coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', a.user_id,
             'email', u.email,
             'name', p.full_name,
             'username', p.username,
             'pitch', a.pitch,
             'links', a.links,
             'status', a.status,
             'applied_at', a.applied_at) order by a.applied_at)
    from public.creator_applications a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.id = a.user_id
    where p_status is null or a.status = p_status
  ), '[]'::jsonb));
end; $$;

grant execute on function public.admin_creator_applications(text) to authenticated;

-- ── Decide ─────────────────────────────────────────────────────────────────
-- The only place in the system that writes `role`. An admin cannot decide
-- their own application either — not because anyone expects that to be a
-- problem, but because "who approved this" should never be able to answer
-- "themselves".
create or replace function public.admin_decide_creator(
  p_user uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_user = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'cannot_decide_own');
  end if;
  if not exists (select 1 from public.creator_applications where user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'no_application');
  end if;

  update public.creator_applications
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_at = now(), decided_by = auth.uid(), note = left(p_note, 1000)
  where user_id = p_user;

  if p_approve then
    -- Never downgrades: an admin who applied and was approved stays an admin.
    update public.profiles set role = 'creator'
    where id = p_user and role = 'user';
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve);
end; $$;

grant execute on function public.admin_decide_creator(uuid, boolean, text) to authenticated;

commit;
