-- Add is_paid column to recipes table if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'recipes' 
    and column_name = 'is_paid'
  ) then
    alter table public.recipes add column is_paid boolean default false;
  end if;
end $$;
