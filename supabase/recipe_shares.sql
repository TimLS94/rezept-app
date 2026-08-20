-- ============================================================================
-- Sharing a recipe with another SpoonDrop user.
--
-- Two kinds travel very differently, and the difference is the whole design:
--
--   'creator' — the recipe already exists in `recipes` and everyone resolves
--   it through the normal, paywalled path. The share stores an id and nothing
--   else, so a paid recipe shared by a subscriber opens as a preview for the
--   recipient until they buy it or subscribe. There is no copy to leak.
--
--   'mine'    — a personal recipe lives in `my_recipes` behind RLS, so the
--   recipient cannot read it however hard they try. The share therefore holds
--   a snapshot, written by this function from the owner's own row: the sender
--   is handing over a copy on purpose, and that copy is what gets imported.
--
-- The token is the capability. Anyone holding it can read the share, which is
-- what "send this to a friend" means; it is 16 random hex characters, so it
-- cannot be guessed or walked.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.recipe_shares (
  token      text primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  kind       text not null check (kind in ('mine', 'creator')),
  recipe_id  uuid not null,
  payload    jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- One share per recipe per person, so sharing the same recipe twice hands out
-- the same link instead of littering the table with dead tokens.
create unique index if not exists recipe_shares_owner_recipe_idx
  on public.recipe_shares (user_id, kind, recipe_id);

alter table public.recipe_shares enable row level security;

-- Direct reads are for the owner only. Recipients come through the function
-- below, which is the only thing that can resolve a token.
drop policy if exists "Users read their own shares" on public.recipe_shares;
create policy "Users read their own shares" on public.recipe_shares
  for select using (auth.uid() = user_id);

drop policy if exists "Users delete their own shares" on public.recipe_shares;
create policy "Users delete their own shares" on public.recipe_shares
  for delete using (auth.uid() = user_id);

-- No insert or update policy on purpose: rows are written by the function.
revoke all on public.recipe_shares from anon, authenticated;
grant select, delete on public.recipe_shares to authenticated;

-- ── Make a share ───────────────────────────────────────────────────────────
create or replace function public.create_recipe_share(p_kind text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_payload jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_kind not in ('mine', 'creator') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  if p_kind = 'mine' then
    -- The snapshot is built here rather than passed in, so a share can only
    -- ever contain a recipe the sender actually owns, exactly as it stands.
    select to_jsonb(m) - 'user_id' - 'id' into v_payload
    from public.my_recipes m
    where m.id = p_recipe_id and m.user_id = auth.uid();

    if v_payload is null then
      return jsonb_build_object('ok', false, 'error', 'not_your_recipe');
    end if;
  else
    if not exists (select 1 from public.recipes r where r.id = p_recipe_id) then
      return jsonb_build_object('ok', false, 'error', 'no_such_recipe');
    end if;
    v_payload := null;
  end if;

  insert into public.recipe_shares (token, user_id, kind, recipe_id, payload)
  values (encode(gen_random_bytes(8), 'hex'), auth.uid(), p_kind, p_recipe_id, v_payload)
  on conflict (user_id, kind, recipe_id) do update
    -- Re-sharing refreshes the snapshot: the link a friend already has should
    -- give them the recipe as it is now, not as it was in March.
    set payload = excluded.payload
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end; $$;

grant execute on function public.create_recipe_share(text, uuid) to authenticated;

-- ── Resolve a share ────────────────────────────────────────────────────────
-- Open to anon as well: someone tapping a shared link may not have signed in
-- yet, and being asked to make an account before you can even see what was
-- sent to you is how a shared link gets abandoned.
create or replace function public.get_recipe_share(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec public.recipe_shares%rowtype;
        v_from text;
begin
  select * into rec from public.recipe_shares where token = p_token;
  if rec.token is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(full_name, 'A SpoonDrop user') into v_from
  from public.profiles where id = rec.user_id;

  return jsonb_build_object(
    'ok', true,
    'kind', rec.kind,
    'recipe_id', rec.recipe_id,
    -- Null for creator shares. The recipient resolves those through the
    -- ordinary recipe screen, which is where the paywall lives.
    'payload', rec.payload,
    'shared_by', v_from
  );
end; $$;

grant execute on function public.get_recipe_share(text) to anon, authenticated;

commit;
