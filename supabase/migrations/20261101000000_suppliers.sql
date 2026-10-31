-- Inventory, part 2: what we can get from dropshippers, distributors and
-- manufacturers. Typed in for now. Products carry the same photos and
-- specs as Calgary stock, plus minimum orders, sizes, colours, price
-- breaks, lead time and when the info was last checked.
-- Rows marked is_sample are made-up examples, badged in the app and
-- removable in one click.

create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 120),
  kind           text not null default 'dropship' check (kind in ('dropship', 'distributor', 'manufacturer')),
  location       text,
  website        text,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  -- e.g. "3–5 business days to print, plus 2–4 days shipping"
  lead_time      text,
  shipping_notes text,
  notes          text,
  is_sample      boolean not null default false,
  archived_at    timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.supplier_products (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  brand        text,
  style_number text,
  category     text,
  description  text,
  fabric       text,
  weight       text,
  fit          text,
  print_notes  text,
  photos       text[] not null default '{}',
  colours      text[] not null default '{}',
  sizes        text[] not null default '{}',
  moq          int check (moq is null or moq >= 1),
  -- What the minimum applies to: the whole order, each style, each colour, or each size.
  moq_per      text not null default 'order' check (moq_per in ('order', 'style', 'colour', 'size')),
  -- [{ "min_qty": 12, "price": 18.5 }, …], CAD per unit.
  price_breaks jsonb not null default '[]',
  -- Overrides the supplier's lead time when set.
  lead_time    text,
  sample_cost  numeric check (sample_cost is null or sample_cost >= 0),
  last_checked date,
  is_sample    boolean not null default false,
  archived_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index supplier_products_supplier on public.supplier_products (supplier_id);

alter table public.suppliers enable row level security;
create policy "producers read"   on public.suppliers for select to authenticated using (public.can_produce());
create policy "producers insert" on public.suppliers for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.suppliers for update to authenticated using (public.can_produce()) with check (public.can_produce());
create policy "admins delete"    on public.suppliers for delete to authenticated using (public.is_admin());

alter table public.supplier_products enable row level security;
create policy "producers read"   on public.supplier_products for select to authenticated using (public.can_produce());
create policy "producers insert" on public.supplier_products for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.supplier_products for update to authenticated using (public.can_produce()) with check (public.can_produce());
create policy "admins delete"    on public.supplier_products for delete to authenticated using (public.is_admin());

-- Sample suppliers and products (made up; prices in CAD).
with s as (
  insert into public.suppliers (name, kind, location, website, contact_name, contact_email, lead_time, shipping_notes, notes, is_sample) values
    ('Example Print Co.', 'dropship', 'Edmonton, AB', 'https://example.com/print', 'Jordan (sample)', 'orders@example.com',
     '3–5 business days to print, plus 2–4 days shipping', 'Ships blind (no Example Print branding) to the customer anywhere in Canada.',
     'Print on demand: no stock to hold. DTG and embroidery.', true),
    ('Example Blanks Ltd.', 'distributor', 'Mississauga, ON', 'https://example.com/blanks', 'Sam (sample)', 'sales@example.com',
     '1–2 business days to ship; 3–5 days to Calgary', 'Free shipping over $200.',
     'Blank garments for us to print in Calgary.', true),
    ('Example Garment Factory', 'manufacturer', 'Overseas', 'https://example.com/factory', 'Lee (sample)', 'factory@example.com',
     '30–40 days to make, plus 10–14 days sea freight', 'Freight and duties quoted per order.',
     'Custom cut-and-sew with our own labels. Sample first, then bulk.', true)
  returning id, name
)
insert into public.supplier_products
  (supplier_id, name, brand, style_number, category, description, fabric, weight, fit, print_notes, colours, sizes, moq, moq_per, price_breaks, lead_time, sample_cost, last_checked, is_sample)
select s.id, p.name, p.brand, p.style_number, p.category, p.description, p.fabric, p.weight, p.fit, p.print_notes,
       p.colours, p.sizes, p.moq, p.moq_per, p.price_breaks::jsonb, p.lead_time, p.sample_cost, p.last_checked::date, true
from s
join (values
  ('Example Print Co.', 'Premium pullover hoodie (printed)', 'Example', 'EP-H100', 'Hoodies', 'Printed and shipped one at a time.',
   '80% cotton / 20% polyester', '9 oz', 'Classic', 'DTG full front and back; embroidery on left chest.',
   array['Black', 'Charcoal', 'Navy', 'Forest Green'], array['S', 'M', 'L', 'XL', '2XL', '3XL'], 1, 'order',
   '[{"min_qty":1,"price":42.0},{"min_qty":10,"price":38.5},{"min_qty":25,"price":35.0}]', null, null, '2026-10-28'),
  ('Example Print Co.', 'Classic tee (printed)', 'Example', 'EP-T200', 'T-shirts', null,
   '100% ring-spun cotton', '5.3 oz', 'Classic', 'DTG front and back.',
   array['Black', 'White', 'Sport Grey'], array['XS', 'S', 'M', 'L', 'XL', '2XL'], 1, 'order',
   '[{"min_qty":1,"price":21.0},{"min_qty":10,"price":18.75}]', null, null, '2026-10-28'),
  ('Example Print Co.', 'Embroidered snapback', 'Example', 'EP-C300', 'Hats', 'Structured six-panel cap.',
   'Cotton twill', null, 'One size fits most', 'Embroidery front only, up to 10,000 stitches.',
   array['Black', 'Khaki'], array['One size'], 6, 'order',
   '[{"min_qty":6,"price":24.0},{"min_qty":24,"price":20.0}]', '5–7 business days to stitch, plus shipping', null, '2026-10-20'),
  ('Example Blanks Ltd.', 'Heavyweight hoodie (blank)', 'Example', 'EB-18500', 'Hoodies', 'Our go-to crew hoodie blank.',
   '50% cotton / 50% polyester', '8 oz', 'Classic', 'Great for DTF and screen print.',
   array['Black', 'Sport Grey', 'Navy', 'Safety Orange', 'Safety Green'], array['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'], 12, 'order',
   '[{"min_qty":12,"price":16.25},{"min_qty":72,"price":14.5},{"min_qty":144,"price":13.75}]', null, null, '2026-10-25'),
  ('Example Blanks Ltd.', 'Hi-vis work tee (blank)', 'Example', 'EB-HV50', 'T-shirts', 'Class 2 hi-vis, good for crews.',
   '100% polyester birdseye', '4.6 oz', 'Classic', 'DTF only (polyester). Low heat.',
   array['Safety Orange', 'Safety Green'], array['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'], 12, 'order',
   '[{"min_qty":12,"price":11.0},{"min_qty":72,"price":9.75}]', null, null, '2026-10-25'),
  ('Example Garment Factory', 'Custom crew hoodie (cut and sew)', 'Our own label', null, 'Hoodies', 'Fully custom: fabric, fit, labels and trims.',
   'Choice of 330–450 gsm fleece', '400 gsm', 'Relaxed', 'Screen print, embroidery or woven patches done at the factory.',
   array['Any (Pantone match)'], array['S', 'M', 'L', 'XL', '2XL', '3XL'], 50, 'colour',
   '[{"min_qty":50,"price":28.0},{"min_qty":200,"price":22.5},{"min_qty":500,"price":19.0}]', null, 85, '2026-10-15'),
  ('Example Garment Factory', 'Insulated work jacket', 'Our own label', null, 'Jackets', 'Canvas shell, quilted lining.',
   '12 oz cotton duck canvas', null, 'Classic', 'Embroidery or patches.',
   array['Black', 'Brown'], array['S', 'M', 'L', 'XL', '2XL', '3XL'], 100, 'style',
   '[{"min_qty":100,"price":46.0},{"min_qty":300,"price":39.0}]', '45–55 days to make, plus sea freight', 120, '2026-10-15')
) as p (supplier, name, brand, style_number, category, description, fabric, weight, fit, print_notes, colours, sizes, moq, moq_per, price_breaks, lead_time, sample_cost, last_checked)
  on p.supplier = s.name;
