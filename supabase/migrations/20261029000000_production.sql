-- Production: a print queue. Won deals land in the first step; people drag
-- jobs through the steps and up or down to set what's next. Notes stay in
-- Lead Rescue, so a job is just a name, due date, rush flag and a link.
--
-- New role 'production' (e.g. whoever runs the printing): sees only this
-- queue. is_member() no longer includes it, so every other table stays closed.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'viewer', 'production'));
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('admin', 'viewer', 'production'));

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role <> 'production');
$$;

-- Anyone signed in to Pulse, production included.
create or replace function public.can_produce()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- Everyone can read their own profile (production users aren't members).
create policy "read own" on public.profiles for select to authenticated using (id = auth.uid());

create table public.production_steps (
  id       uuid primary key default gen_random_uuid(),
  name     text not null check (length(trim(name)) between 1 and 40),
  position int not null,
  -- The finished step: its jobs are never overdue and drop off after two weeks.
  is_done  boolean not null default false
);

insert into public.production_steps (name, position, is_done) values
  ('Queued', 0, false),
  ('Prep', 1, false),
  ('Printing', 2, false),
  ('Done', 3, true);

create table public.production_jobs (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid references public.brands (id) on delete set null,
  -- The won deal it came from; unique so the nightly sync adds each deal once.
  lead_id         uuid unique references public.leads (id) on delete set null,
  title           text not null check (length(trim(title)) between 1 and 120),
  url             text,
  due_date        date,
  rush            boolean not null default false,
  step_id         uuid not null references public.production_steps (id) on delete restrict,
  -- Order within a step, lowest first. New jobs go to the bottom.
  sort_order      double precision not null default extract(epoch from now()),
  step_changed_at timestamptz not null default now(),
  -- Removed jobs are kept so the sync doesn't add their deal again.
  removed_at      timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index production_jobs_step on public.production_jobs (step_id, sort_order) where removed_at is null;

alter table public.production_steps enable row level security;
create policy "producers read"  on public.production_steps for select to authenticated using (public.can_produce());
create policy "admins insert"   on public.production_steps for insert to authenticated with check (public.is_admin());
create policy "admins update"   on public.production_steps for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete"   on public.production_steps for delete to authenticated using (public.is_admin());

alter table public.production_jobs enable row level security;
create policy "producers read"   on public.production_jobs for select to authenticated using (public.can_produce());
create policy "producers insert" on public.production_jobs for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.production_jobs for update to authenticated using (public.can_produce()) with check (public.can_produce());

-- Deals already won go straight into the queue.
insert into public.production_jobs (brand_id, lead_id, title, url, step_id)
select l.brand_id, l.id, coalesce(nullif(trim(c.company), ''), nullif(trim(c.name), ''), 'Won deal'), c.url,
       (select id from public.production_steps order by position limit 1)
from public.leads l
join public.pipeline_stages s on s.id = l.stage_id and s.is_won
left join public.lead_contacts c on c.lead_id = l.id
where not l.is_sample
on conflict (lead_id) do nothing;
