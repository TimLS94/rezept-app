-- FeedFamily Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  family_size integer default 2,
  weekly_budget decimal default 150,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Recipes table
create table public.recipes (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  image_url text,
  prep_time integer, -- in minutes
  cook_time integer, -- in minutes
  servings integer default 4,
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard')),
  calories integer,
  kid_approved boolean default false,
  tags text[], -- array of tags like 'quick', 'healthy', 'budget'
  ingredients jsonb, -- [{name, amount, unit}]
  instructions jsonb, -- [{step, description}]
  influencer_id uuid references public.profiles(id),
  influencer_name text,
  influencer_handle text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Favorites table
create table public.favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, recipe_id)
);

-- Family members table
create table public.family_members (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  age integer,
  portion_size text default 'medium',
  dietary_restrictions text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Shopping list items table
create table public.shopping_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  recipe_id text,            -- source recipe id (from the local recipe catalogue); null for manual items
  recipe_name text,          -- source recipe title, used to group items by meal
  name text not null,
  amount decimal default 1,
  unit text default '',
  category text default 'other',
  checked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index shopping_items_user_id_idx on public.shopping_items(user_id);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.favorites enable row level security;
alter table public.family_members enable row level security;
alter table public.shopping_items enable row level security;

-- Profiles policies
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Recipes policies (public read, authenticated write)
create policy "Anyone can view recipes" on public.recipes
  for select using (true);

create policy "Authenticated users can create recipes" on public.recipes
  for insert with check (auth.role() = 'authenticated');

-- Favorites policies
create policy "Users can view their own favorites" on public.favorites
  for select using (auth.uid() = user_id);

create policy "Users can add favorites" on public.favorites
  for insert with check (auth.uid() = user_id);

create policy "Users can remove favorites" on public.favorites
  for delete using (auth.uid() = user_id);

-- Family members policies
create policy "Users can manage their family members" on public.family_members
  for all using (auth.uid() = profile_id);

-- Shopping items policies
create policy "Users can view their own shopping items" on public.shopping_items
  for select using (auth.uid() = user_id);

create policy "Users can add shopping items" on public.shopping_items
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own shopping items" on public.shopping_items
  for update using (auth.uid() = user_id);

create policy "Users can remove their own shopping items" on public.shopping_items
  for delete using (auth.uid() = user_id);

-- Function to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Insert some sample recipes
insert into public.recipes (title, description, image_url, prep_time, cook_time, servings, difficulty, calories, kid_approved, tags, influencer_name, influencer_handle) values
('15-Minute Creamy Chicken Pasta', 'A quick and delicious pasta dish the whole family will love', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800', 5, 10, 4, 'Easy', 450, true, '{"quick", "kid-friendly", "one-pot"}', 'Sarah Kitchen', '@sarahcooks'),
('Rainbow Veggie Tacos', 'Colorful and healthy tacos packed with fresh vegetables', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800', 15, 5, 4, 'Easy', 380, true, '{"healthy", "vegetarian", "quick"}', 'MealPrepMom', '@mealprepmom'),
('Honey Garlic Salmon', 'Sweet and savory salmon with a sticky honey garlic glaze', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800', 10, 15, 4, 'Medium', 420, false, '{"healthy", "protein", "date-night"}', 'ChefDadLife', '@chefdadlife'),
('Mac & Cheese Bites', 'Crispy on the outside, creamy on the inside - kids go crazy for these!', 'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?w=800', 20, 10, 6, 'Easy', 290, true, '{"kid-friendly", "snack", "party"}', 'FamilyFoodFun', '@familyfoodfun'),
('Smoothie Bowl Party', 'Beautiful and nutritious breakfast bowls with endless topping options', 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800', 10, 0, 2, 'Easy', 320, true, '{"breakfast", "healthy", "quick"}', 'HealthyMomTips', '@healthymomtips');
