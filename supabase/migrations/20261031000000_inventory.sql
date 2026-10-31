-- Inventory, part 1: what's on the shelves in Calgary. Each product has
-- photos, specs and a colour × size grid of counts. Everyone with Pulse
-- access (production included) can see and update it.

create table public.inventory_products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 120),
  brand        text,
  style_number text,
  category     text,
  description  text,
  fabric       text,
  weight       text,
  fit          text,
  print_notes  text,
  cost         numeric check (cost is null or cost >= 0),
  location     text,
  -- A size/colour at or below this count is flagged as running low (0 = off).
  low_stock_at int not null default 0 check (low_stock_at >= 0),
  -- Storage paths in the "inventory" bucket; the first is the cover photo.
  photos       text[] not null default '{}',
  archived_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.inventory_stock (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products (id) on delete cascade,
  colour     text not null default '' check (length(colour) <= 60),
  size       text not null check (length(trim(size)) between 1 and 20),
  quantity   int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, colour, size)
);
create index inventory_stock_product on public.inventory_stock (product_id);

alter table public.inventory_products enable row level security;
create policy "producers read"   on public.inventory_products for select to authenticated using (public.can_produce());
create policy "producers insert" on public.inventory_products for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.inventory_products for update to authenticated using (public.can_produce()) with check (public.can_produce());

alter table public.inventory_stock enable row level security;
create policy "producers read"   on public.inventory_stock for select to authenticated using (public.can_produce());
create policy "producers insert" on public.inventory_stock for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.inventory_stock for update to authenticated using (public.can_produce()) with check (public.can_produce());
create policy "producers delete" on public.inventory_stock for delete to authenticated using (public.can_produce());

-- +/- from the count buttons: add to the current count, never below zero,
-- so two people counting at once don't overwrite each other.
create or replace function public.adjust_stock(stock_id uuid, delta int)
returns int language sql security invoker set search_path = '' as $$
  update public.inventory_stock
     set quantity = greatest(0, quantity + delta), updated_at = now()
   where id = stock_id
  returning quantity;
$$;
grant execute on function public.adjust_stock(uuid, int) to authenticated;

-- Product photos: a private bucket, read through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory', 'inventory', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "inventory photos read"   on storage.objects for select to authenticated using (bucket_id = 'inventory' and public.can_produce());
create policy "inventory photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'inventory' and public.can_produce());
create policy "inventory photos delete" on storage.objects for delete to authenticated using (bucket_id = 'inventory' and public.can_produce());
