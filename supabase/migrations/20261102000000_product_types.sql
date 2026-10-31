-- Product types: each type has its own spec fields (GSM and pilling for
-- hoodies, capacity for backpacks, ink for pens). Types are edited in Pulse.
-- Products keep their spec values in `specs` and anything extra in
-- `custom_fields`. The old category / fabric / weight / fit columns move
-- into the type and specs, then go.

create table public.product_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9_]{1,40}$'),
  name        text not null check (length(trim(name)) between 1 and 60),
  icon        text not null default 'box',
  position    int not null default 100,
  -- [{ key, label, kind: text|number|choice|yesno, unit?, options?, placeholder?, help? }]
  fields      jsonb not null default '[]',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.product_types enable row level security;
create policy "producers read"   on public.product_types for select to authenticated using (public.can_produce());
create policy "producers insert" on public.product_types for insert to authenticated with check (public.can_produce());
create policy "producers update" on public.product_types for update to authenticated using (public.can_produce()) with check (public.can_produce());
create policy "admins delete"    on public.product_types for delete to authenticated using (public.is_admin());

insert into public.product_types (slug, name, icon, position, fields) values
('tshirt', 'T-shirts', 'tshirt', 10, '[
  {"key":"fabric","label":"Fabric blend","kind":"text","placeholder":"e.g. 100% ring-spun cotton"},
  {"key":"gsm","label":"GSM (fabric weight)","kind":"number","unit":"GSM","help":"Grams per square metre. Light tee ~150, heavy tee ~220+"},
  {"key":"knit","label":"Knit","kind":"choice","options":["Jersey","Pique","Rib","Waffle","Mesh","Other"]},
  {"key":"pilling","label":"Pilling","kind":"choice","options":["5 – No pilling","4 – Slight pilling","3 – Some pilling","2 – Noticeable pilling","1 – Heavy pilling"],"help":"How well it resists little fuzz balls (5 is best)"},
  {"key":"shrinkage","label":"Shrinkage","kind":"choice","options":["Pre-shrunk","Low","Some","High"]},
  {"key":"fit","label":"Fit","kind":"choice","options":["Classic","Relaxed","Slim","Athletic","Women''s","Youth","Unisex"]},
  {"key":"stretch","label":"Stretch","kind":"yesno"},
  {"key":"tear_away","label":"Tear-away label","kind":"yesno"}
]'),
('hoodie', 'Hoodies & sweaters', 'hoodie', 20, '[
  {"key":"style","label":"Style","kind":"choice","options":["Pullover hoodie","Full-zip hoodie","Quarter-zip","Crewneck","Other"]},
  {"key":"fabric","label":"Fabric blend","kind":"text","placeholder":"e.g. 50% cotton / 50% polyester"},
  {"key":"gsm","label":"GSM (fabric weight)","kind":"number","unit":"GSM","help":"Grams per square metre. Mid hoodie ~270, heavy ~350+"},
  {"key":"knit","label":"Inside","kind":"choice","options":["Brushed fleece","French terry","Sherpa lined","Other"]},
  {"key":"pilling","label":"Pilling","kind":"choice","options":["5 – No pilling","4 – Slight pilling","3 – Some pilling","2 – Noticeable pilling","1 – Heavy pilling"],"help":"How well it resists little fuzz balls (5 is best)"},
  {"key":"shrinkage","label":"Shrinkage","kind":"choice","options":["Pre-shrunk","Low","Some","High"]},
  {"key":"fit","label":"Fit","kind":"choice","options":["Classic","Relaxed","Slim","Oversized","Women''s","Youth","Unisex"]},
  {"key":"pocket","label":"Pocket","kind":"choice","options":["Pouch","Split pouch","Zip pockets","None"]}
]'),
('jacket', 'Jackets & outerwear', 'jacket', 30, '[
  {"key":"style","label":"Style","kind":"choice","options":["Rain shell","Soft shell","Insulated","Puffer","Vest","Fleece","Canvas / work","Other"]},
  {"key":"shell_fabric","label":"Shell fabric","kind":"text","placeholder":"e.g. 100% nylon, 12 oz duck canvas"},
  {"key":"lining","label":"Lining","kind":"text"},
  {"key":"insulation","label":"Insulation","kind":"text","placeholder":"e.g. 100 g synthetic, 650-fill down"},
  {"key":"warmth","label":"Warmth","kind":"choice","options":["Light (no insulation)","Medium","Warm","Extreme cold"]},
  {"key":"waterproof_mm","label":"Waterproof rating","kind":"number","unit":"mm","help":"Higher is drier. 5,000 mm = light rain, 10,000+ = heavy rain"},
  {"key":"breathability","label":"Breathability","kind":"number","unit":"g/m²/24h","help":"Higher lets sweat out better"},
  {"key":"windproof","label":"Windproof","kind":"yesno"},
  {"key":"seams_taped","label":"Seams taped","kind":"yesno"},
  {"key":"hood","label":"Hood","kind":"choice","options":["Fixed","Removable","Stowaway","None"]},
  {"key":"fit","label":"Fit","kind":"choice","options":["Classic","Relaxed","Slim","Women''s","Youth","Unisex"]}
]'),
('pants', 'Pants & shorts', 'pants', 40, '[
  {"key":"style","label":"Style","kind":"choice","options":["Work pants","Cargo","Joggers","Jeans","Shorts","Rain pants","Other"]},
  {"key":"fabric","label":"Fabric blend","kind":"text"},
  {"key":"gsm","label":"GSM (fabric weight)","kind":"number","unit":"GSM"},
  {"key":"fit","label":"Fit","kind":"choice","options":["Classic","Relaxed","Slim","Straight","Women''s","Youth"]},
  {"key":"rise","label":"Rise","kind":"choice","options":["Low","Mid","High"]},
  {"key":"waist","label":"Waist","kind":"choice","options":["Button & zip","Elastic","Drawstring","Elastic & drawstring"]},
  {"key":"stretch","label":"Stretch","kind":"yesno"},
  {"key":"knee_pads","label":"Knee-pad pockets","kind":"yesno"},
  {"key":"water_resistance","label":"Water resistance","kind":"choice","options":["None","Water-resistant","Waterproof"]}
]'),
('workwear', 'Workwear & hi-vis', 'vest', 50, '[
  {"key":"style","label":"Style","kind":"choice","options":["Vest","T-shirt","Hoodie","Jacket","Coveralls","Pants","Other"]},
  {"key":"fabric","label":"Fabric blend","kind":"text"},
  {"key":"gsm","label":"GSM (fabric weight)","kind":"number","unit":"GSM"},
  {"key":"csa_z96","label":"Hi-vis (CSA Z96)","kind":"choice","options":["Not hi-vis","Class 1","Class 2","Class 3"],"help":"Class 2 for most road and site work; Class 3 for highways and night work"},
  {"key":"reflective_tape","label":"Reflective tape","kind":"text","placeholder":"e.g. 2\" silver, X-back"},
  {"key":"flame_resistant","label":"Flame resistant (FR)","kind":"yesno"},
  {"key":"arc_rating","label":"Arc rating","kind":"text","placeholder":"e.g. ATPV 8 cal/cm²"},
  {"key":"fit","label":"Fit","kind":"choice","options":["Classic","Relaxed","Women''s","Unisex"]}
]'),
('footwear', 'Shoes & boots', 'boot', 60, '[
  {"key":"style","label":"Style","kind":"choice","options":["Work boot","Safety shoe","Hiker","Sneaker","Winter boot","Rubber boot","Slide / sandal","Other"]},
  {"key":"size_system","label":"Sizing","kind":"choice","options":["US men''s","US women''s","US unisex","EU","UK"]},
  {"key":"widths","label":"Widths","kind":"text","placeholder":"e.g. Regular, Wide (EE), Extra wide (4E)"},
  {"key":"upper","label":"Upper","kind":"text","placeholder":"e.g. Full-grain leather"},
  {"key":"sole","label":"Sole","kind":"text","placeholder":"e.g. Rubber, slip-resistant"},
  {"key":"safety_toe","label":"Safety toe","kind":"choice","options":["None","Steel","Composite","Alloy"]},
  {"key":"csa_rating","label":"CSA rating","kind":"choice","options":["None","Green triangle","Yellow triangle","Blue triangle","Other"],"help":"Green triangle = toe cap + puncture-resistant sole (most construction sites)"},
  {"key":"electrical","label":"Electrical hazard (Omega)","kind":"yesno"},
  {"key":"waterproof","label":"Waterproof","kind":"yesno"},
  {"key":"insulation","label":"Insulation","kind":"text","placeholder":"e.g. 400 g Thinsulate, rated -40°C"}
]'),
('hat', 'Hats & beanies', 'cap', 70, '[
  {"key":"style","label":"Style","kind":"choice","options":["Snapback","Fitted","Trucker","Dad cap","Flexfit","Beanie","Bucket","Toque with pom","Other"]},
  {"key":"fabric","label":"Fabric","kind":"text","placeholder":"e.g. Cotton twill, acrylic knit"},
  {"key":"closure","label":"Closure","kind":"choice","options":["Snap","Velcro","Buckle","Stretch fit","Fitted","None"]},
  {"key":"panels","label":"Panels","kind":"number"},
  {"key":"crown","label":"Crown","kind":"choice","options":["Low","Mid","High"]},
  {"key":"brim","label":"Brim","kind":"choice","options":["Curved","Flat","None"]}
]'),
('bag', 'Backpacks & bags', 'backpack', 80, '[
  {"key":"style","label":"Style","kind":"choice","options":["Backpack","Duffel","Tote","Cooler bag","Sling","Laptop bag","Drawstring","Other"]},
  {"key":"capacity_l","label":"Capacity","kind":"number","unit":"L"},
  {"key":"dimensions","label":"Dimensions","kind":"text","placeholder":"e.g. 46 × 30 × 15 cm"},
  {"key":"laptop_in","label":"Fits laptop up to","kind":"number","unit":"in"},
  {"key":"fabric","label":"Fabric","kind":"text","placeholder":"e.g. 600D polyester","help":"The D number (denier) is thread thickness. 600D is everyday tough; 1000D+ is heavy duty"},
  {"key":"water_resistance","label":"Water resistance","kind":"choice","options":["None","Water-resistant","Waterproof"]}
]'),
('drinkware', 'Drinkware', 'mug', 90, '[
  {"key":"style","label":"Style","kind":"choice","options":["Tumbler","Water bottle","Mug","Travel mug","Can cooler","Other"]},
  {"key":"capacity_oz","label":"Capacity","kind":"number","unit":"oz"},
  {"key":"material","label":"Material","kind":"text","placeholder":"e.g. Stainless steel, ceramic"},
  {"key":"insulated","label":"Insulated","kind":"yesno"},
  {"key":"lid","label":"Lid","kind":"text","placeholder":"e.g. Slide lid, straw lid"},
  {"key":"dishwasher_safe","label":"Dishwasher safe","kind":"yesno"},
  {"key":"bpa_free","label":"BPA free","kind":"yesno"}
]'),
('pen', 'Pens & writing', 'pen', 100, '[
  {"key":"ink_type","label":"Ink","kind":"choice","options":["Ballpoint","Gel","Rollerball","Marker","Highlighter","Pencil"]},
  {"key":"ink_colour","label":"Ink colour","kind":"text","placeholder":"e.g. Black, Blue"},
  {"key":"material","label":"Material","kind":"text","placeholder":"e.g. Aluminium, recycled plastic"},
  {"key":"mechanism","label":"Mechanism","kind":"choice","options":["Click","Twist","Cap"]},
  {"key":"stylus","label":"Stylus tip","kind":"yesno"}
]'),
('gift', 'Gifts & other', 'gift', 110, '[
  {"key":"material","label":"Material","kind":"text"},
  {"key":"dimensions","label":"Dimensions","kind":"text","placeholder":"e.g. 20 × 10 × 5 cm"},
  {"key":"weight_g","label":"Weight","kind":"number","unit":"g"},
  {"key":"gift_box","label":"Comes in a gift box","kind":"yesno"},
  {"key":"batteries","label":"Needs batteries / charging","kind":"yesno"}
]');

alter table public.inventory_products
  add column type_id       uuid references public.product_types (id) on delete set null,
  add column specs         jsonb not null default '{}',
  add column custom_fields jsonb not null default '[]';
alter table public.supplier_products
  add column type_id       uuid references public.product_types (id) on delete set null,
  add column specs         jsonb not null default '{}',
  add column custom_fields jsonb not null default '[]';

-- Old free-text category → type.
create or replace function pg_temp.type_for(category text) returns uuid language sql as $$
  select id from public.product_types where slug = case
    when category ~* 'hood|sweat|crew' then 'hoodie'
    when category ~* 't-?shirt|tee' then 'tshirt'
    when category ~* 'jacket|coat|outer|vest' then 'jacket'
    when category ~* 'pant|short|jean' then 'pants'
    when category ~* 'hi-?vis|work' then 'workwear'
    when category ~* 'shoe|boot|foot' then 'footwear'
    when category ~* 'hat|cap|beanie|toque' then 'hat'
    when category ~* 'bag|pack|tote' then 'bag'
    when category ~* 'mug|bottle|tumbler|drink' then 'drinkware'
    when category ~* 'pen|pencil|writ' then 'pen'
    when category is not null then 'gift'
  end
$$;

-- Old weight text → GSM: "400 gsm" as is; "8 oz" × 33.906.
create or replace function pg_temp.gsm_of(weight text) returns numeric language sql as $$
  select case
    when weight ~* '^\s*[0-9.]+\s*(gsm|g/m)' then round(substring(weight from '[0-9.]+')::numeric)
    when weight ~* '^\s*[0-9.]+\s*oz' then round(substring(weight from '[0-9.]+')::numeric * 33.906)
  end
$$;

update public.inventory_products p set
  type_id = pg_temp.type_for(p.category),
  specs = jsonb_strip_nulls(jsonb_build_object(
    case when p.category ~* 'jacket|coat|outer' then 'shell_fabric' else 'fabric' end, nullif(trim(p.fabric), ''),
    'gsm', pg_temp.gsm_of(p.weight),
    'fit', nullif(trim(p.fit), ''))),
  custom_fields = case when p.weight is not null and pg_temp.gsm_of(p.weight) is null
    then jsonb_build_array(jsonb_build_object('label', 'Weight', 'value', p.weight)) else '[]'::jsonb end;

update public.supplier_products p set
  type_id = case when p.name ~* 'hi-?vis' then (select id from public.product_types where slug = 'workwear') else pg_temp.type_for(p.category) end,
  specs = jsonb_strip_nulls(jsonb_build_object(
    case when p.category ~* 'jacket|coat|outer' then 'shell_fabric' else 'fabric' end, nullif(trim(p.fabric), ''),
    'gsm', pg_temp.gsm_of(p.weight),
    'fit', nullif(trim(p.fit), ''))),
  custom_fields = case when p.weight is not null and pg_temp.gsm_of(p.weight) is null
    then jsonb_build_array(jsonb_build_object('label', 'Weight', 'value', p.weight)) else '[]'::jsonb end;

-- Fill out the sample products so each shows its type's specs.
update public.supplier_products set specs = specs || '{"style":"Pullover hoodie","knit":"Brushed fleece","pilling":"4 – Slight pilling","shrinkage":"Pre-shrunk","pocket":"Pouch","season":"All-season"}'
  where is_sample and name = 'Premium pullover hoodie (printed)';
update public.supplier_products set specs = specs || '{"knit":"Jersey","pilling":"4 – Slight pilling","shrinkage":"Pre-shrunk","tear_away":"Yes","season":"Summer"}'
  where is_sample and name = 'Classic tee (printed)';
update public.supplier_products set specs = specs - 'fit' || '{"style":"Snapback","closure":"Snap","panels":6,"crown":"Mid","brim":"Curved","season":"All-season"}'
  where is_sample and name = 'Embroidered snapback';
update public.supplier_products set specs = specs || '{"style":"Pullover hoodie","knit":"Brushed fleece","pilling":"3 – Some pilling","shrinkage":"Low","pocket":"Pouch","season":"All-season"}'
  where is_sample and name = 'Heavyweight hoodie (blank)';
update public.supplier_products set specs = specs || '{"style":"T-shirt","csa_z96":"Class 2","reflective_tape":"2\" silver, X-back","flame_resistant":"No","season":"Summer"}'
  where is_sample and name = 'Hi-vis work tee (blank)';
update public.supplier_products set specs = specs || '{"style":"Pullover hoodie","knit":"French terry","pilling":"5 – No pilling","shrinkage":"Pre-shrunk","fit":"Relaxed","pocket":"Pouch","season":"Winter"}'
  where is_sample and name = 'Custom crew hoodie (cut and sew)';
update public.supplier_products set specs = specs || '{"style":"Canvas / work","lining":"Quilted nylon","insulation":"150 g synthetic","warmth":"Warm","windproof":"Yes","hood":"Removable","season":"Winter"}'
  where is_sample and name = 'Insulated work jacket';

-- More sample products, so every kind of thing has an example.
insert into public.supplier_products (supplier_id, type_id, name, brand, description, print_notes, colours, sizes, moq, moq_per, price_breaks, last_checked, is_sample, specs)
select s.id, t.id, v.name, 'Example', v.description, v.print_notes, v.colours, v.sizes, v.moq, 'order', v.price_breaks::jsonb, '2026-10-30', true, v.specs::jsonb
from (values
  ('Example Blanks Ltd.', 'bag', 'Commuter laptop backpack', 'Padded laptop sleeve, water bottle pocket.', 'Embroidery or patch on front pocket.',
   array['Black', 'Grey'], array['One size'], 12, '[{"min_qty":12,"price":32.0},{"min_qty":50,"price":27.5}]',
   '{"style":"Backpack","capacity_l":25,"dimensions":"46 × 30 × 15 cm","laptop_in":15.6,"fabric":"600D polyester","water_resistance":"Water-resistant","season":"All-season"}'),
  ('Example Blanks Ltd.', 'pants', 'Stretch work pants', 'Durable work pant with cargo and knee-pad pockets.', 'Small logo on thigh pocket (embroidery).',
   array['Black', 'Khaki', 'Navy'], array['30x30', '32x30', '32x32', '34x32', '36x32', '38x32', '40x32'], 12, '[{"min_qty":12,"price":38.0},{"min_qty":48,"price":34.0}]',
   '{"style":"Work pants","fabric":"98% cotton / 2% spandex canvas","gsm":340,"fit":"Relaxed","rise":"Mid","waist":"Button & zip","stretch":"Yes","knee_pads":"Yes","water_resistance":"Water-resistant","season":"All-season"}'),
  ('Example Garment Factory', 'footwear', '6" composite-toe work boot', 'Lace-up work boot for site crews.', 'Debossed logo on tongue (factory order only).',
   array['Brown', 'Black'], array['7', '8', '9', '10', '10.5', '11', '12', '13'], 100, '[{"min_qty":100,"price":78.0},{"min_qty":300,"price":69.0}]',
   '{"style":"Work boot","size_system":"US men''s","widths":"Regular, Wide (EE)","upper":"Full-grain leather","sole":"Rubber, slip-resistant","safety_toe":"Composite","csa_rating":"Green triangle","electrical":"Yes","waterproof":"Yes","season":"All-season"}'),
  ('Example Print Co.', 'drinkware', 'Insulated tumbler', 'Keeps drinks cold 24 h, hot 6 h.', 'Laser engraving, one side.',
   array['Black', 'White', 'Navy', 'Stainless'], array['One size'], 12, '[{"min_qty":12,"price":19.5},{"min_qty":48,"price":16.0}]',
   '{"style":"Tumbler","capacity_oz":20,"material":"Double-wall stainless steel","insulated":"Yes","lid":"Slide lid","dishwasher_safe":"No","bpa_free":"Yes","season":"All-season"}'),
  ('Example Print Co.', 'pen', 'Metal click pen with stylus', 'Weighty aluminium pen, a client-gift favourite.', 'Laser engraving on barrel.',
   array['Black', 'Silver', 'Navy'], array['One size'], 100, '[{"min_qty":100,"price":2.1},{"min_qty":500,"price":1.65}]',
   '{"ink_type":"Ballpoint","ink_colour":"Black","material":"Aluminium","mechanism":"Click","stylus":"Yes"}'),
  ('Example Print Co.', 'gift', 'Executive gift set', 'Notebook, pen and tumbler in a branded box.', 'Logo on box lid and notebook cover.',
   array['Black'], array['One size'], 25, '[{"min_qty":25,"price":44.0},{"min_qty":100,"price":38.0}]',
   '{"material":"Vegan leather, aluminium, stainless steel","dimensions":"30 × 22 × 9 cm","weight_g":950,"gift_box":"Yes","batteries":"No"}')
) as v (supplier, type, name, description, print_notes, colours, sizes, moq, price_breaks, specs)
join public.suppliers s on s.name = v.supplier and s.is_sample
join public.product_types t on t.slug = v.type;

alter table public.inventory_products drop column category, drop column fabric, drop column weight, drop column fit;
alter table public.supplier_products  drop column category, drop column fabric, drop column weight, drop column fit;
