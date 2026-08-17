-- ============================================================================
-- Own recipes get the same steps a creator's recipe has.
--
-- my_recipes.instructions was `text[]` while recipes.instructions is `jsonb`.
-- A creator's step is an object — {text, image, timer} — so it can carry a
-- countdown and a photo. A text[] element is a string and nothing else, so a
-- per-step timer in your own recipe was not a missing button: there was
-- physically nowhere to put the number.
--
-- Converting to jsonb makes both tables the same shape, so the same editor and
-- the same cook mode work for both. Plain strings stay valid — mapping code
-- already accepts a step that is either a string (legacy) or an object.
--
-- Idempotent: re-running finds the column already jsonb and does nothing.
-- ============================================================================

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'my_recipes'
      and column_name = 'instructions'
      and data_type = 'ARRAY'
  ) then
    -- The old default is `'{}'::text[]`, and Postgres tries to convert it
    -- along with the column. text[] → jsonb has no automatic cast, so the
    -- whole statement fails on the default alone. Drop it first, convert, then
    -- set the jsonb default.
    alter table public.my_recipes
      alter column instructions drop default;

    -- to_jsonb on a text[] yields a jsonb array of strings, which is exactly
    -- the legacy shape the app already reads. No content changes, no data loss.
    alter table public.my_recipes
      alter column instructions type jsonb
      using to_jsonb(coalesce(instructions, '{}'::text[]));

    alter table public.my_recipes
      alter column instructions set default '[]'::jsonb;
  end if;
end $$;

commit;
