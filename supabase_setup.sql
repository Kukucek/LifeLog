-- Run this in Supabase → SQL Editor

create table if not exists lifelog_data (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  unique(user_id, key)
);

-- Allow anyone with the anon key to read/write their own data
alter table lifelog_data enable row level security;

create policy "Users can manage their own data"
  on lifelog_data
  for all
  using (true)
  with check (true);
