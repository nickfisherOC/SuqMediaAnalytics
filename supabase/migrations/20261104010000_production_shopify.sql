-- Store orders in the print queue: paid Shopify orders that haven't shipped
-- become jobs, with what to print on the card and a link to the order.
-- When Shopify marks an order fulfilled the job moves to the last step;
-- a cancelled order's job is taken off the board.

alter table public.production_jobs
  add column source           text not null default 'manual' check (source in ('manual', 'lead_rescue', 'shopify')),
  add column shopify_order_id text unique,
  -- e.g. "2× Black hoodie / M, White tee / L"
  add column items            text;

update public.production_jobs set source = 'lead_rescue' where lead_id is not null;

-- One row of settings for the queue.
create table public.production_settings (
  id                boolean primary key default true check (id),
  -- Store orders are due this many business days (Mon–Fri) after they're placed.
  shopify_due_days  int not null default 3 check (shopify_due_days between 0 and 60),
  updated_at        timestamptz not null default now()
);
insert into public.production_settings default values;

alter table public.production_settings enable row level security;
create policy "producers read" on public.production_settings for select to authenticated using (public.can_produce());
create policy "admins update"  on public.production_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
