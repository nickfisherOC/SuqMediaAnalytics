-- Search & Site: the Google searches each brand wants to rank for.
create table public.search_keywords (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands (id) on delete cascade,
  keyword    text not null check (length(trim(keyword)) between 2 and 120),
  group_name text not null default 'Other',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index search_keywords_unique on public.search_keywords (brand_id, lower(trim(keyword)));

alter table public.search_keywords enable row level security;
create policy "members read"   on public.search_keywords for select to authenticated using (public.is_member());
create policy "admins insert"  on public.search_keywords for insert to authenticated with check (public.is_admin());
create policy "admins update"  on public.search_keywords for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete"  on public.search_keywords for delete to authenticated using (public.is_admin());

-- Starter list; admins edit it on the Search & Site page.
insert into public.search_keywords (brand_id, keyword, group_name)
select b.id, k.keyword, k.group_name
from public.brands b
join (values
  ('suq-media', 'suq media', 'Brand name'),
  ('suq-media', 'custom apparel edmonton', 'Local apparel'),
  ('suq-media', 'custom apparel calgary', 'Local apparel'),
  ('suq-media', 'custom apparel alberta', 'Local apparel'),
  ('suq-media', 'custom hoodies edmonton', 'Local apparel'),
  ('suq-media', 'custom hoodies calgary', 'Local apparel'),
  ('suq-media', 'branded workwear calgary', 'Local apparel'),
  ('suq-media', 'crew hoodies', 'Local apparel'),
  ('suq-media', 'podcast studio calgary', 'Podcast studio'),
  ('peoplesuq', 'people suq', 'Brand name'),
  ('peoplesuq', 'peoplesuq', 'Brand name'),
  ('peoplesuq', 'addiction podcast', 'Podcast / mental health'),
  ('peoplesuq', 'mental health podcast', 'Podcast / mental health'),
  ('peoplesuq', 'addiction and mental health podcast', 'Podcast / mental health'),
  ('peoplesuq', 'addiction recovery podcast', 'Podcast / mental health')
) as k (slug, keyword, group_name) on k.slug = b.slug
on conflict do nothing;
