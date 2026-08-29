-- ============================================================================
-- Two findings from the audit, both about writing rather than reading.
--
-- Re-runnable, and worth re-running: the first version of this file added its
-- policies without removing the permissive one already in place, so the
-- storage half had no effect. See the note above the DO block.
--
-- ── 1. Anyone could write into anyone's folder ─────────────────────────────
-- The app stores images at `<folder>/<user id>/<timestamp>.jpg`, which reads
-- like a per-user space and was not one: a signed-in account could create a
-- file at any path in the bucket, including inside another person's folder,
-- and have it served publicly under this project's domain. Confirmed by doing
-- it — a write to `recipes/00000000-…/probe.txt` returned 200.
--
-- What was NOT possible, contrary to the first draft of this comment:
-- overwriting or deleting someone else's file. The pre-existing update and
-- delete policies check `owner = auth.uid()`, which held. That was an
-- inference from the successful write rather than something tested, and it
-- was wrong.
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
-- FIRST, remove the policies that were already there — this is the part the
-- first version of this file got wrong. Postgres combines policies with OR: a
-- permissive "any authenticated user may upload" policy is not narrowed by
-- adding a stricter one beside it. Both are consulted, the old one still says
-- yes, and the write succeeds. The new policy was never wrong; it was simply
-- never the deciding one.
--
-- The names below came from reading the live catalogue rather than guessing:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'storage' and tablename = 'objects';
--
-- Only one of the four actually granted too much:
--
--   Authenticated upload images   INSERT  with_check (bucket_id = 'images')
--       ^ no path, no person: any signed-in account could create a file
--         anywhere in the bucket, including inside someone else's folder.
--
-- The other three were already sound — "Owners update images" and "Owners
-- delete images" both check `owner = auth.uid()`, so changing or deleting
-- another person's file was never possible. They are dropped anyway because
-- ownership by the uploader and ownership by the path should not be two
-- different answers to the same question; the four written below are the
-- whole rule set.
drop policy if exists "Public read images"          on storage.objects;
drop policy if exists "Authenticated upload images" on storage.objects;
drop policy if exists "Owners update images"        on storage.objects;
drop policy if exists "Owners delete images"        on storage.objects;

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

-- Both names: the one being replaced, and the one about to be created. A file
-- that only drops the old name runs once and fails on the second attempt with
-- "policy already exists" — which is exactly what happened here, and it took
-- the whole transaction with it, including the storage half that had not
-- landed yet.
drop policy if exists "Anyone signed in can report an error" on public.app_errors;
drop policy if exists "Signed-in users report their own errors" on public.app_errors;
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
