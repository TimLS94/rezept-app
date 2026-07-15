-- Migration: self-service account deletion
-- A client with the anon key cannot delete an auth user, so expose a
-- security-definer RPC that deletes the *currently signed-in* user and all of
-- their data. Safe to run on an existing database (idempotent).

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- recipes.influencer_id has no ON DELETE CASCADE, so clear the user's uploads
  -- first, otherwise removing their profile would violate the foreign key.
  delete from public.recipes where influencer_id = auth.uid();

  -- Deleting the auth user cascades to profiles -> family_members / favorites /
  -- shopping_items (all reference profiles with ON DELETE CASCADE).
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
