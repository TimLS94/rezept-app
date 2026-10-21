-- ============================================================================
-- Somebody has to be able to say "this one is wrong".
--
-- App Review reads guideline 1.2 against any app that shows what its users
-- made: there has to be a way for a reader to flag a recipe, and a stated
-- time to answer in. The terms now promise 48 hours. This is the part that
-- makes the promise reachable from inside the app rather than only by email.
--
-- Deliberately additive. Nothing here touches public.recipes, its policies or
-- its column grants — twice now a rebuilt column has taken the whole
-- catalogue down with it, because Postgres refuses every column of a query
-- when one of them is ungranted. A takedown is rare and an admin is awake for
-- it; that is not worth betting the catalogue on. So removal is an explicit
-- function call, not a flag the read path has to consult on every query.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

-- A report. recipe_id is text rather than a foreign key for the same reason
-- cook_log's is: the row has to outlive the recipe it is about, or the
-- evidence disappears at exactly the moment it is acted on.
create table if not exists public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    text not null,
  recipe_title text,
  reporter_id  uuid references public.profiles(id) on delete set null,
  reason       text not null check (reason in ('copyright','unsafe','offensive','spam','other')),
  detail       text,
  status       text not null default 'open' check (status in ('open','removed','dismissed')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null,
  note         text
);

alter table public.content_reports drop constraint if exists content_reports_sane_size;
alter table public.content_reports add constraint content_reports_sane_size check (
  (detail is null or length(detail) <= 2000)
  and (note is null or length(note) <= 1000)
);

create index if not exists content_reports_queue_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_recipe_idx
  on public.content_reports (recipe_id);

alter table public.content_reports enable row level security;

-- No policy at all, and no grant. Every read and write goes through the
-- functions below, so a client cannot list other people's reports, file one
-- under somebody else's name, or mark its own report resolved.
revoke all on public.content_reports from anon, authenticated;

-- Where a removed recipe goes. A takedown decided in 48 hours on one
-- complaint should not be the last word on somebody's work, and a mistake
-- that cannot be undone is a worse outcome than the complaint.
create table if not exists public.removed_recipes (
  id         uuid primary key,
  recipe     jsonb not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references public.profiles(id) on delete set null,
  reason     text
);
alter table public.removed_recipes enable row level security;
revoke all on public.removed_recipes from anon, authenticated;

-- ── File a report ──────────────────────────────────────────────────────────
create or replace function public.report_content(
  p_recipe_id text,
  p_recipe_title text default null,
  p_reason text default 'other',
  p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare recent integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_recipe_id is null or length(trim(p_recipe_id)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_recipe');
  end if;
  if p_reason not in ('copyright','unsafe','offensive','spam','other') then
    return jsonb_build_object('ok', false, 'error', 'bad_reason');
  end if;

  -- Reporting the same recipe twice is almost always a second tap, not a
  -- second complaint. Answer it the same way so the queue stays readable.
  if exists (
    select 1 from public.content_reports
    where reporter_id = auth.uid() and recipe_id = p_recipe_id and status = 'open'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- A report puts a stranger's words in front of an admin, so it is capped.
  select count(*) into recent from public.content_reports
  where reporter_id = auth.uid() and created_at > now() - interval '24 hours';
  if recent >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.content_reports (recipe_id, recipe_title, reporter_id, reason, detail)
  values (p_recipe_id, left(p_recipe_title, 300), auth.uid(), p_reason, left(p_detail, 2000));

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.report_content(text, text, text, text) to authenticated;

-- ── The queue ──────────────────────────────────────────────────────────────
create or replace function public.admin_content_reports(p_status text default 'open')
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  return jsonb_build_object('ok', true, 'reports', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id,
             'recipe_id', r.recipe_id,
             'recipe_title', coalesce(r.recipe_title, rec.title),
             'reason', r.reason,
             'detail', r.detail,
             'status', r.status,
             'created_at', r.created_at,
             'reporter', u.email,
             'creator', p.full_name,
             -- Says whether there is still anything to take down, so the
             -- admin is not offered a button that cannot do anything.
             'recipe_exists', rec.id is not null) order by r.created_at)
    from public.content_reports r
    left join auth.users u on u.id = r.reporter_id
    left join public.recipes rec
      on r.recipe_id ~ '^[0-9a-f]{8}-' and rec.id = r.recipe_id::uuid
    left join public.profiles p on p.id = rec.influencer_id
    where p_status is null or r.status = p_status
  ), '[]'::jsonb));
end; $$;

grant execute on function public.admin_content_reports(text) to authenticated;

-- ── Decide ─────────────────────────────────────────────────────────────────
-- Removing archives first and deletes second, in one transaction. Everything
-- that points at a recipe either cascades (saves, edits, prices) or is set
-- null (purchases, deliberately — a customer who paid keeps their receipt
-- when the recipe goes).
create or replace function public.admin_decide_report(
  p_id uuid, p_remove boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean; v_recipe text; v_uuid uuid; removed boolean := false;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select recipe_id into v_recipe from public.content_reports where id = p_id;
  if v_recipe is null then
    return jsonb_build_object('ok', false, 'error', 'no_report');
  end if;

  if p_remove and v_recipe ~ '^[0-9a-f]{8}-' then
    v_uuid := v_recipe::uuid;
    insert into public.removed_recipes (id, recipe, removed_by, reason)
    select r.id, to_jsonb(r), auth.uid(), left(p_note, 1000)
    from public.recipes r where r.id = v_uuid
    on conflict (id) do nothing;

    delete from public.recipes where id = v_uuid;
    removed := found;

    -- Every open report about this recipe is answered by the same takedown.
    update public.content_reports
    set status = 'removed', decided_at = now(), decided_by = auth.uid(),
        note = left(p_note, 1000)
    where recipe_id = v_recipe and status = 'open';
  else
    update public.content_reports
    set status = case when p_remove then 'removed' else 'dismissed' end,
        decided_at = now(), decided_by = auth.uid(), note = left(p_note, 1000)
    where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'removed', removed);
end; $$;

grant execute on function public.admin_decide_report(uuid, boolean, text) to authenticated;

commit;
