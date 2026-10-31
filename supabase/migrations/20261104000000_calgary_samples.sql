-- Sample Calgary stock: a black and a white hoodie, badged Sample in the app
-- and removable in one click, so the In Calgary tab has something to try.

alter table public.inventory_products add column is_sample boolean not null default false;
create policy "admins delete" on public.inventory_products for delete to authenticated using (public.is_admin());

with p as (
  insert into public.inventory_products
    (name, brand, style_number, description, cost, location, low_stock_at, is_sample, type_id, specs, branding_methods, imprint_areas, print_notes)
  select v.name, 'Example', v.style, v.description, 16.25, v.location, 3, true, t.id,
         '{"style":"Pullover hoodie","fabric":"50% cotton / 50% polyester","gsm":271,"knit":"Brushed fleece","pilling":"3 – Some pilling","shrinkage":"Low","fit":"Classic","pocket":"Pouch","season":"All-season"}'::jsonb,
         array['DTF transfer', 'Screen print', 'Embroidery'],
         '[{"location":"Full front","maxSize":"12 × 14 in","method":""},{"location":"Full back","maxSize":"12 × 16 in","method":""},{"location":"Left chest","maxSize":"4 × 4 in","method":""}]'::jsonb,
         v.notes
  from (values
    ('Black pullover hoodie', 'EX-H500-BLK', 'Our everyday crew hoodie in black.', 'Shelf A1', 'DTF: press 15 s at 150 °C, peel warm.'),
    ('White pullover hoodie', 'EX-H500-WHT', 'Our everyday crew hoodie in white.', 'Shelf A2', 'Pre-press 5 s to remove moisture. Watch for scorch marks on white.')
  ) as v (name, style, description, location, notes)
  join public.product_types t on t.slug = 'hoodie'
  returning id, name
)
insert into public.inventory_stock (product_id, colour, size, quantity)
select p.id, case when p.name like 'Black%' then 'Black' else 'White' end, s.size,
       case when p.name like 'Black%' then s.black else s.white end
from p
cross join (values ('S', 4, 2), ('M', 12, 6), ('L', 15, 9), ('XL', 9, 3), ('2XL', 2, 1), ('3XL', 1, 0)) as s (size, black, white);
