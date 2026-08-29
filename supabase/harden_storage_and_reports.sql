-- ============================================================================
-- Two findings from the audit, both about writing rather than reading.
--
-- Re-runnable, and worth re-running: the first version of this file added its
-- policies without removing the permissive one already in place, so the
-- storage half had no effect. See the note above the DO block.
--
-- ── 1. Anyone could write into anyone's folder ─────────────────────────────
-- The app stores images at `<folder>/<user id>/<timestamp>.jpg`, which reads
-- like a per-user space and was not one. A signed-in account could upload to
-- any path in the bucket, overwrite another user's recipe photo or avatar
-- (upsert is on), delete their files, and put arbitrary content on a public
-- URL under this project's domain. Confirmed by doing it: a write into
-- `recipes/00000000-…/probe.txt` succeeded, as did deleting it again.
--
-- Reading stays open. Recipe photos are meant to be public — that is how they
-- appear in a share preview and in anyone's cookbook. It is writing that
-- needed an owner.
--
-- ── 2. An unauthenticated write endpoint ───────────────────────────────────
-- app_errors granted insert to `anon`, and the anon key ships inside the app,
-- so it is public by construction. Anyone could fill the table at will: cost,
-- noise, and alert rules that count crashes made trivially forgeable.
--
-- The cost is losing crash reports from people who are not signed in. That is
-- a real loss and a small one: the reporter attaches a user id for everything
-- after login, which is nearly all of the app.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

-- ── Storage ────────────────────────────────────────────────────────────────
-- The owner is the second path segment: recipes/<uid>/<file>. storage.foldername()
-- splits the path, and [2] is that segment.
--
-- FIRST, remove what is already there — and this is the part the first version
-- of this file got wrong. Postgres combines policies with OR: a permissive
-- "any authenticated user may upload" policy created in the dashboard is not
-- narrowed by adding a stricter one beside it, it simply keeps granting. The
-- fix ran, the crash-table half took effect, and the storage half changed
-- nothing at all, because the old policy was still saying yes.
--
-- So every policy on storage.objects is dropped and the four below are the
-- complete set. Check what you are about to lose first:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'storage' and tablename = 'objects';
--
-- This project has one bucket. If you ever add another, its rules have to be
-- written here too, because after this runs there is nothing else.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

drop policy if exists "Public read of images" on storage.objects;
create policy "Public read of images" on storage.objects
  for select using (bucket_id = 'images');

drop policy if exists "Users upload to their own folder" on storage.objects;
create policy "Users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- upsert is an update when the object exists, so without this the overwrite
-- hole stays open even with the insert policy in place.
drop policy if exists "Users replace their own images" on storage.objects;
create policy "Users replace their own images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Users delete their own images" on storage.objects;
create policy "Users delete their own images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Crash reports ──────────────────────────────────────────────────────────
revoke insert on public.app_errors from anon;

drop policy if exists "Anyone signed in can report an error" on public.app_errors;
create policy "Signed-in users report their own errors" on public.app_errors
  for insert to authenticated
  with check (auth.uid() = user_id);

-- A report is a few hundred characters. Without a ceiling one caller can
-- write megabytes per row, and the table is the one place in this schema that
-- accepts free text from a client.
alter table public.app_errors
  drop constraint if exists app_errors_sane_size;
alter table public.app_errors
  add constraint app_errors_sane_size check (
    length(message) <= 1000
    and (stack is null or length(stack) <= 8000)
    and (screen is null or length(screen) <= 120)
  );

commit;
