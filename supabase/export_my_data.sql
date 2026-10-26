-- ============================================================================
-- Giving someone their data back.
--
-- app/privacy.tsx has listed "Export your data" as a right since the policy
-- was written, and there has never been a way to do it. Answering a request
-- by hand is lawful — CCPA allows 45 days, the GDPR a month — but a promise
-- in writing with nothing behind it is the kind of thing that is discovered
-- at the worst moment, by the person it was promised to.
--
-- Two functions, because there are two situations. Someone asking for their
-- own data should not have to ask anybody. Someone writing to privacy@ should
-- not have to be talked through signing in.
--
-- Deliberately a function rather than a view: the tables are read with the
-- definer's rights, so this does not depend on which columns the client
-- happens to be granted — and that grant list has changed twice.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create or replace function public.export_user_data(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email,
                                'created_at', u.created_at,
                                'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = p_user),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user),
    'family_members', coalesce((select jsonb_agg(to_jsonb(f))
      from public.family_members f where f.profile_id = p_user), '[]'::jsonb),
    'shopping_items', coalesce((select jsonb_agg(to_jsonb(s))
      from public.shopping_items s where s.user_id = p_user), '[]'::jsonb),
    'my_recipes', coalesce((select jsonb_agg(to_jsonb(m))
      from public.my_recipes m where m.user_id = p_user), '[]'::jsonb),
    'favorite_recipes', coalesce((select jsonb_agg(to_jsonb(fr))
      from public.favorite_recipes fr where fr.user_id = p_user), '[]'::jsonb),
    'meal_plan', coalesce((select jsonb_agg(to_jsonb(mp))
      from public.meal_plan_items mp where mp.user_id = p_user), '[]'::jsonb),
    'cook_log', coalesce((select jsonb_agg(to_jsonb(cl))
      from public.cook_log cl where cl.user_id = p_user), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(e))
      from public.entitlements e where e.user_id = p_user), '[]'::jsonb),
    'creator_subscriptions', coalesce((select jsonb_agg(to_jsonb(cs))
      from public.creator_subscribers cs where cs.subscriber_id = p_user), '[]'::jsonb),
    -- Recipes they published, if they are a creator. Their own work is theirs
    -- to take with them.
    'published_recipes', coalesce((select jsonb_agg(to_jsonb(r))
      from public.recipes r where r.influencer_id = p_user), '[]'::jsonb)
  ) into out;
  return out;
exception when undefined_table or undefined_column then
  -- A table named here may not exist in every environment. Losing the whole
  -- export because one optional table is missing would be worse than saying
  -- so, since the point is to hand somebody their data rather than a failure.
  return jsonb_build_object('error', 'export_incomplete', 'detail', sqlerrm);
end; $$;

-- ── Your own data, no asking required ──────────────────────────────────────
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  return public.export_user_data(auth.uid());
end; $$;

grant execute on function public.export_my_data() to authenticated;

-- ── Somebody else's, for answering a request sent by email ─────────────────
create or replace function public.admin_export_user(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean; v_id uuid;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_account');
  end if;

  return jsonb_build_object('ok', true, 'data', public.export_user_data(v_id));
end; $$;

grant execute on function public.admin_export_user(text) to authenticated;

-- export_user_data() takes any id, so it stays unreachable from a client. The
-- two wrappers above are the only ways in, and each decides for itself whose
-- data the caller is allowed to see.
revoke all on function public.export_user_data(uuid) from public, anon, authenticated;

commit;

-- ── Answering a request that arrived by email ──────────────────────────────
--   select public.admin_export_user('someone@example.com');
--
-- Copy the JSON out of the result and send it to the address that asked.
