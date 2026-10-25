-- Search & Site: exact Google positions for tracked keywords, checked from
-- Edmonton and Calgary through DataForSEO's queue. A check is posted, then
-- collected on a later run.
create table public.rank_checks (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete cascade,
  keyword     text not null,
  city        text not null,
  checked_on  date not null,
  task_id     text,
  status      text not null default 'pending' check (status in ('pending', 'done', 'error')),
  -- Organic position of the brand's site (null = not in the top 100).
  position    int,
  url         text,
  -- Up to five results ranked above the brand (or the top five if it isn't there).
  above       jsonb not null default '[]',
  -- The Google Maps box: shown at all, and the brand's spot in it (null = not in it).
  map_pack    boolean,
  map_rank    int,
  error       text,
  cost_usd    numeric,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index rank_checks_brand_day on public.rank_checks (brand_id, checked_on);
create index rank_checks_pending on public.rank_checks (status) where status = 'pending';

alter table public.rank_checks enable row level security;
create policy "members read" on public.rank_checks for select to authenticated using (public.is_member());
