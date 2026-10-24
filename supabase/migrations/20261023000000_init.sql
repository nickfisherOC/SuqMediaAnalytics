-- Pulse: initial schema.
--
-- Conventions
--  * Every `date` column is a calendar day in America/Edmonton.
--  * Fact tables are written only by server jobs using the service role, which
--    bypasses RLS. Signed-in users can read them; nobody writes from the browser.
--  * Platform tokens live in Supabase Vault. `accounts` only holds the secret ids.
--  * `is_sample` marks seeded demo data so it can be badged and removed in one go.

create extension if not exists pgcrypto;
create extension if not exists supabase_vault;

-- ───────────────────────────────────────────────────────────────────────────
-- People and roles
-- ───────────────────────────────────────────────────────────────────────────

create table public.invites (
  email       text primary key check (email = lower(email)),
  role        text not null default 'viewer' check (role in ('admin', 'viewer')),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  full_name  text,
  role       text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Invite-only: a sign-in from an email that hasn't been invited is refused
-- before the account is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites%rowtype;
begin
  select * into inv from public.invites where email = lower(new.email);
  if not found then
    raise exception 'not_invited: % has not been invited to Pulse', new.email
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    inv.role
  );
  update public.invites set accepted_at = now() where email = inv.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- Brands and connected accounts
-- ───────────────────────────────────────────────────────────────────────────

create table public.brands (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                   text not null,
  short_name             text not null,
  website                text,
  accent_light           text not null check (accent_light ~ '^#[0-9a-fA-F]{6}$'),
  accent_dark            text not null check (accent_dark ~ '^#[0-9a-fA-F]{6}$'),
  platforms              text[] not null default '{}',
  cadence_posts_per_week numeric not null default 0,
  scoreboard             jsonb not null default '[]',
  funnel                 jsonb not null default '[]',
  active                 boolean not null default true,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now()
);

create table public.accounts (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references public.brands (id) on delete cascade,
  platform             text not null,
  external_id          text not null,
  display_name         text,
  status               text not null default 'not_connected'
                         check (status in ('not_connected', 'connected', 'expiring', 'broken', 'sample')),
  is_sample            boolean not null default false,
  access_secret_id     uuid,  -- vault.secrets.id
  refresh_secret_id    uuid,  -- vault.secrets.id
  token_expires_at     timestamptz,
  scopes               text[] not null default '{}',
  last_synced_at       timestamptz,
  last_error           text,
  consecutive_failures int not null default 0,
  settings             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  unique (brand_id, platform, external_id)
);

-- Tokens: written and read only by the service role, never exposed to the API.
create or replace function public.set_account_token(p_account_id uuid, p_kind text, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
  new_id uuid;
begin
  if p_kind not in ('access', 'refresh') then raise exception 'bad token kind'; end if;
  select case p_kind when 'access' then access_secret_id else refresh_secret_id end
    into existing from public.accounts where id = p_account_id;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
  else
    new_id := vault.create_secret(p_secret, 'pulse_' || p_kind || '_' || p_account_id);
    if p_kind = 'access' then
      update public.accounts set access_secret_id = new_id where id = p_account_id;
    else
      update public.accounts set refresh_secret_id = new_id where id = p_account_id;
    end if;
  end if;
end;
$$;

create or replace function public.get_account_token(p_account_id uuid, p_kind text)
returns text language sql security definer set search_path = '' as $$
  select s.decrypted_secret
  from public.accounts a
  join vault.decrypted_secrets s
    on s.id = case p_kind when 'access' then a.access_secret_id else a.refresh_secret_id end
  where a.id = p_account_id;
$$;

revoke all on function public.set_account_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_account_token(uuid, text) from public, anon, authenticated;
grant execute on function public.set_account_token(uuid, text, text) to service_role;
grant execute on function public.get_account_token(uuid, text) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Sync: a queue of small jobs plus the raw responses they captured
-- ───────────────────────────────────────────────────────────────────────────

create table public.sync_runs (
  id           bigint generated always as identity primary key,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  job          text not null check (job in ('backfill', 'daily', 'manual', 'intraday')),
  from_date    date not null,
  to_date      date not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts     int not null default 0,
  run_after    timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  rows_written int,
  error        text,
  created_at   timestamptz not null default now()
);
create index sync_runs_queue on public.sync_runs (status, run_after) where status in ('queued', 'running');
create index sync_runs_account on public.sync_runs (account_id, created_at desc);

-- Every API response, untouched. Platforms forget history; this table doesn't,
-- and metrics can be re-derived from it when a definition changes.
create table public.raw_ingest (
  id           bigint generated always as identity primary key,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  sync_run_id  bigint references public.sync_runs (id) on delete set null,
  endpoint     text not null,
  params       jsonb not null default '{}',
  for_date     date,
  captured_at  timestamptz not null default now(),
  payload      jsonb not null,
  payload_hash text not null,
  unique (account_id, endpoint, payload_hash)
);
create index raw_ingest_lookup on public.raw_ingest (account_id, endpoint, for_date);

-- ───────────────────────────────────────────────────────────────────────────
-- Facts
-- ───────────────────────────────────────────────────────────────────────────

-- The long, normalized daily fact table. Re-running a day overwrites it.
create table public.metric_daily (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  brand_id    uuid not null references public.brands (id) on delete cascade,
  platform    text not null,
  date        date not null,
  metric_key  text not null,
  value       numeric not null,
  is_sample   boolean not null default false,
  sync_run_id bigint references public.sync_runs (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (account_id, date, metric_key)
);
create index metric_daily_brand on public.metric_daily (brand_id, metric_key, date);

create table public.content_items (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  brand_id         uuid not null references public.brands (id) on delete cascade,
  platform         text not null,
  external_id      text not null,
  url              text,
  caption          text,
  published_at     timestamptz,
  published_date   date,
  format           text check (format in ('reel', 'short', 'video', 'post', 'photo', 'carousel', 'story', 'live')),
  duration_seconds numeric,
  thumbnail_url    text,
  status           text not null default 'published'
                     check (status in ('published', 'under_review', 'private', 'unlisted', 'deleted', 'failed')),
  is_sample        boolean not null default false,
  raw              jsonb,
  updated_at       timestamptz not null default now(),
  unique (account_id, external_id)
);
create index content_items_brand_date on public.content_items (brand_id, published_date);

-- Daily snapshot of each item's lifetime counters, so growth curves survive
-- the platform overwriting them.
create table public.content_metrics_snapshots (
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  captured_on     date not null,
  views           numeric,
  reach           numeric,
  likes           numeric,
  comments        numeric,
  shares          numeric,
  saves           numeric,
  watch_seconds   numeric,
  avg_view_pct    numeric,
  extra           jsonb not null default '{}',
  is_sample       boolean not null default false,
  primary key (content_item_id, captured_on)
);

-- One piece of content across platforms ("Day 8" on all four).
create table public.content_groups (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands (id) on delete cascade,
  title      text not null,
  series     text,
  day_number int,
  theme      text,
  hook_type  text,
  faces      text[] not null default '{}',
  tags       text[] not null default '{}',
  notes      text,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.content_group_members (
  group_id        uuid not null references public.content_groups (id) on delete cascade,
  content_item_id uuid not null unique references public.content_items (id) on delete cascade,
  match_method    text not null default 'auto' check (match_method in ('auto', 'manual')),
  confidence      numeric,
  confirmed       boolean not null default false,
  primary key (group_id, content_item_id)
);

create table public.ads_daily (
  account_id    uuid not null references public.accounts (id) on delete cascade,
  date          date not null,
  level         text not null check (level in ('campaign', 'adset', 'ad')),
  entity_id     text not null,
  parent_id     text,
  name          text not null,  -- exactly as named in Meta
  status        text,
  spend         numeric not null default 0,
  impressions   numeric not null default 0,
  reach         numeric,
  clicks        numeric not null default 0,
  link_clicks   numeric not null default 0,
  leads         numeric not null default 0,
  frequency     numeric,
  thumbnail_url text,
  extra         jsonb not null default '{}',
  is_sample     boolean not null default false,
  primary key (account_id, date, level, entity_id)
);

create table public.search_daily (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  date        date not null,
  query       text not null,
  page        text not null,
  clicks      numeric not null,
  impressions numeric not null,
  position    numeric not null,
  is_sample   boolean not null default false,
  primary key (account_id, date, query, page)
);

-- GA4 and Shopify broken down by one dimension at a time.
create table public.site_daily (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  date        date not null,
  dimension   text not null check (dimension in ('source_medium', 'channel', 'landing_page', 'device', 'city', 'country', 'referrer')),
  dim_value   text not null,
  sessions    numeric not null default 0,
  users       numeric,
  key_events  numeric,
  add_to_cart numeric,
  checkouts   numeric,
  orders      numeric,
  revenue     numeric,
  extra       jsonb not null default '{}',
  is_sample   boolean not null default false,
  primary key (account_id, date, dimension, dim_value)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Pipeline (Lead Rescue). No contact details here; those are admin-only below.
-- ───────────────────────────────────────────────────────────────────────────

create table public.pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  external_id   text not null,
  pipeline_id   text not null,
  pipeline_name text not null,
  name          text not null,
  position      int not null,
  is_won        boolean not null default false,
  is_lost       boolean not null default false,
  unique (account_id, external_id)
);

create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts (id) on delete cascade,
  brand_id            uuid not null references public.brands (id) on delete cascade,
  external_id         text not null,
  created_at_source   timestamptz not null,
  created_date        date not null,
  form                text,
  source_channel      text not null default 'unknown'
                        check (source_channel in ('meta_ads', 'organic_social', 'google', 'referral', 'direct', 'other', 'unknown')),
  how_did_you_find_us text,
  utm                 jsonb not null default '{}',
  is_spam             boolean not null default false,
  stage_id            uuid references public.pipeline_stages (id) on delete set null,
  value               numeric,
  first_contact_at    timestamptz,
  quote_sent_at       timestamptz,
  won_at              timestamptz,
  lost_at             timestamptz,
  is_sample           boolean not null default false,
  updated_at          timestamptz not null default now(),
  unique (account_id, external_id)
);
create index leads_brand_date on public.leads (brand_id, created_date);

create table public.lead_contacts (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  name    text,
  email   text,
  phone   text
);

create table public.lead_stage_events (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null references public.leads (id) on delete cascade,
  stage_id   uuid references public.pipeline_stages (id) on delete set null,
  entered_at timestamptz not null,
  left_at    timestamptz,
  unique (lead_id, stage_id, entered_at)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Data quality
-- ───────────────────────────────────────────────────────────────────────────

create table public.data_flags (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands (id) on delete cascade,
  platform    text,
  kind        text not null check (kind in (
                'test_traffic', 'missing_post', 'cadence_missed', 'stuck_content', 'duplicate_post',
                'metric_unavailable', 'sync_failure', 'token_expiring', 'insights_disabled', 'other')),
  severity    text not null default 'warning' check (severity in ('info', 'warning', 'serious')),
  date_from   date,
  date_to     date,
  title       text not null,
  detail      text,
  ref         jsonb not null default '{}',
  -- For traffic flags: whether the flagged traffic is left out of totals.
  excluded    boolean not null default true,
  is_sample   boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- Meetings, goals, notes, decisions
-- ───────────────────────────────────────────────────────────────────────────

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete cascade,
  metric_key  text not null,
  platform    text not null default 'all',
  label       text not null,
  target      numeric not null,
  start_date  date not null default current_date,
  deadline    date not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.annotations (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid references public.brands (id) on delete cascade,  -- null = every brand
  platform   text,
  date       date not null,
  title      text not null,
  body       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index annotations_date on public.annotations (date);

-- One meeting per week (week_start is the Monday of the week under review).
create table public.meetings (
  id               uuid primary key default gen_random_uuid(),
  week_start       date not null unique check (extract(isodow from week_start) = 1),
  notes            text not null default '',
  locked_at        timestamptz,
  locked_by        uuid references auth.users (id) on delete set null,
  share_token      text unique,
  share_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);

-- Frozen week packs. Immutable once written.
create table public.week_snapshots (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  brand_id   uuid not null references public.brands (id) on delete cascade,
  pack       jsonb not null,
  narrative  jsonb,
  created_at timestamptz not null default now(),
  primary key (meeting_id, brand_id)
);

create table public.ai_calls (
  id             uuid primary key default gen_random_uuid(),
  feature        text not null,
  prompt_version text not null,
  model          text not null,
  input_hash     text not null,
  input          jsonb not null,
  output         jsonb,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric,
  status         text not null check (status in ('ok', 'rejected', 'error')),
  error          text,
  created_at     timestamptz not null default now()
);

create table public.narratives (
  brand_id   uuid not null references public.brands (id) on delete cascade,
  week_start date not null,
  pack_hash  text not null,
  output     jsonb not null,
  ai_call_id uuid references public.ai_calls (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (brand_id, week_start)
);

create table public.recommendations (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands (id) on delete cascade,
  week_start         date not null,
  what               text not null,
  why                text not null,
  target_metric      text not null,
  target_platform    text not null default 'all',
  expected_direction text not null check (expected_direction in ('up', 'down')),
  effort             text not null check (effort in ('S', 'M', 'L')),
  confidence         text not null check (confidence in ('low', 'medium', 'high')),
  category           text,
  status             text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  decided_by         uuid references auth.users (id) on delete set null,
  decided_at         timestamptz,
  ai_call_id         uuid references public.ai_calls (id) on delete set null,
  created_at         timestamptz not null default now()
);

create table public.action_items (
  id                 uuid primary key default gen_random_uuid(),
  meeting_id         uuid references public.meetings (id) on delete set null,
  brand_id           uuid references public.brands (id) on delete cascade,
  recommendation_id  uuid references public.recommendations (id) on delete set null,
  title              text not null,
  owner_name         text,
  due_date           date,
  status             text not null default 'open' check (status in ('open', 'done', 'dropped')),
  target_metric      text,
  target_platform    text,
  expected_direction text check (expected_direction in ('up', 'down')),
  baseline_value     numeric,
  outcome            text check (outcome in ('worked', 'no_change', 'worse', 'too_early')),
  outcome_value      numeric,
  outcome_checked_at timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- Guards
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.forbid_change()
returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;

create trigger week_snapshots_immutable
  before update or delete on public.week_snapshots
  for each row execute function public.forbid_change();

-- Locked meetings can't be edited, and only admins can lock or share.
create or replace function public.guard_meeting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if old.locked_at is not null then
    raise exception 'This week is locked';
  end if;
  if (new.locked_at is distinct from old.locked_at
      or new.share_token is distinct from old.share_token
      or new.share_expires_at is distinct from old.share_expires_at)
     and not public.is_admin() then
    raise exception 'Only admins can lock or share a week';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger meetings_guard
  before update on public.meetings
  for each row execute function public.guard_meeting();

-- ───────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────────────────────

alter table public.invites                   enable row level security;
alter table public.profiles                  enable row level security;
alter table public.brands                    enable row level security;
alter table public.accounts                  enable row level security;
alter table public.sync_runs                 enable row level security;
alter table public.raw_ingest                enable row level security;
alter table public.metric_daily              enable row level security;
alter table public.content_items             enable row level security;
alter table public.content_metrics_snapshots enable row level security;
alter table public.content_groups            enable row level security;
alter table public.content_group_members     enable row level security;
alter table public.ads_daily                 enable row level security;
alter table public.search_daily              enable row level security;
alter table public.site_daily                enable row level security;
alter table public.pipeline_stages           enable row level security;
alter table public.leads                     enable row level security;
alter table public.lead_contacts             enable row level security;
alter table public.lead_stage_events         enable row level security;
alter table public.data_flags                enable row level security;
alter table public.goals                     enable row level security;
alter table public.annotations               enable row level security;
alter table public.meetings                  enable row level security;
alter table public.week_snapshots            enable row level security;
alter table public.ai_calls                  enable row level security;
alter table public.narratives                enable row level security;
alter table public.recommendations           enable row level security;
alter table public.action_items              enable row level security;

-- Everyone signed in can read the reporting data.
do $$
declare t text;
begin
  foreach t in array array[
    'brands', 'sync_runs', 'metric_daily', 'content_items', 'content_metrics_snapshots',
    'content_groups', 'content_group_members', 'ads_daily', 'search_daily', 'site_daily',
    'pipeline_stages', 'leads', 'lead_stage_events', 'data_flags', 'goals', 'annotations',
    'meetings', 'week_snapshots', 'narratives', 'recommendations', 'action_items'
  ] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- Accounts: members see status, but never the token columns.
create policy "members read" on public.accounts for select to authenticated using (public.is_member());
-- (A column-level revoke doesn't override a table grant, so grant columns explicitly.)
revoke select on public.accounts from authenticated, anon;
grant select (id, brand_id, platform, external_id, display_name, status, is_sample, token_expires_at, scopes,
              last_synced_at, last_error, consecutive_failures, settings, created_at)
  on public.accounts to authenticated;

-- Profiles: members see the team; only admins change roles.
create policy "members read" on public.profiles for select to authenticated using (public.is_member());
create policy "admins update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin-only tables.
create policy "admins all" on public.invites       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins all" on public.lead_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read" on public.ai_calls     for select to authenticated using (public.is_admin());
create policy "admins read" on public.raw_ingest   for select to authenticated using (public.is_admin());

-- Admin-managed settings.
do $$
declare t text;
begin
  foreach t in array array['brands', 'accounts', 'goals', 'content_groups', 'content_group_members', 'data_flags'] loop
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Viewers can take part in the meeting: notes, annotations, action items, and
-- deciding on recommendations.
create policy "members insert" on public.meetings        for insert to authenticated with check (public.is_member());
create policy "members update" on public.meetings        for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members insert" on public.annotations     for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "own or admin update" on public.annotations for update to authenticated using (created_by = auth.uid() or public.is_admin());
create policy "own or admin delete" on public.annotations for delete to authenticated using (created_by = auth.uid() or public.is_admin());
create policy "members insert" on public.action_items    for insert to authenticated with check (public.is_member());
create policy "members update" on public.action_items    for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "admins delete" on public.action_items     for delete to authenticated using (public.is_admin());
create policy "members update" on public.recommendations for update to authenticated using (public.is_member()) with check (public.is_member());
