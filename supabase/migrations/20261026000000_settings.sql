-- Settings: content series are edited in Pulse instead of in code.
create table public.content_series (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands (id) on delete cascade,
  name       text not null check (length(trim(name)) between 2 and 120),
  start_date date not null,
  days       int not null check (days between 1 and 366),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index content_series_brand on public.content_series (brand_id, start_date);

alter table public.content_series enable row level security;
create policy "members read"  on public.content_series for select to authenticated using (public.is_member());
create policy "admins insert" on public.content_series for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.content_series for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.content_series for delete to authenticated using (public.is_admin());

-- The series that was written into the code.
insert into public.content_series (brand_id, name, start_date, days)
select id, '31 Days of Crushing Pumpkins', '2026-10-01', 31 from public.brands where slug = 'peoplesuq';
