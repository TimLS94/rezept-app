-- Migration: public 'images' storage bucket for recipe photos and avatars.
-- Safe to run on an existing database (idempotent).

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Public read (bucket is public), authenticated write. Users may only modify /
-- delete objects they own; uploads are namespaced by user id in the object path.
drop policy if exists "Public read images" on storage.objects;
create policy "Public read images" on storage.objects
  for select using (bucket_id = 'images');

drop policy if exists "Authenticated upload images" on storage.objects;
create policy "Authenticated upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images');

drop policy if exists "Owners update images" on storage.objects;
create policy "Owners update images" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and owner = auth.uid());

drop policy if exists "Owners delete images" on storage.objects;
create policy "Owners delete images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and owner = auth.uid());
