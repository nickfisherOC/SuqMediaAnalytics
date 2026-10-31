-- Branding: the ways a product can carry a logo, and where the logo can go
-- (with the biggest size that fits). On Calgary stock it's what we can do
-- in-house; on supplier products it's what the supplier offers.

alter table public.inventory_products
  add column branding_methods text[] not null default '{}',
  -- [{ "location": "Left chest", "maxSize": "4 × 4 in", "method": "Embroidery" }, …]
  add column imprint_areas    jsonb  not null default '[]';
alter table public.supplier_products
  add column branding_methods text[] not null default '{}',
  add column imprint_areas    jsonb  not null default '[]';

-- Sample products get example branding.
update public.supplier_products p set branding_methods = v.methods, imprint_areas = v.areas::jsonb
from (values
  ('Premium pullover hoodie (printed)', array['DTG (direct to garment)', 'Embroidery'],
   '[{"location":"Full front","maxSize":"12 × 14 in","method":"DTG (direct to garment)"},{"location":"Full back","maxSize":"12 × 14 in","method":"DTG (direct to garment)"},{"location":"Left chest","maxSize":"4 × 4 in","method":"Embroidery"}]'),
  ('Classic tee (printed)', array['DTG (direct to garment)'],
   '[{"location":"Full front","maxSize":"12 × 14 in","method":""},{"location":"Full back","maxSize":"12 × 14 in","method":""}]'),
  ('Embroidered snapback', array['Embroidery'],
   '[{"location":"Front","maxSize":"4.5 × 2.25 in","method":""},{"location":"Left side","maxSize":"2 × 1.5 in","method":""}]'),
  ('Heavyweight hoodie (blank)', array['DTF transfer', 'Screen print', 'Embroidery', 'Heat transfer vinyl'],
   '[{"location":"Full front","maxSize":"12 × 14 in","method":""},{"location":"Full back","maxSize":"12 × 16 in","method":""},{"location":"Left chest","maxSize":"4 × 4 in","method":""},{"location":"Left sleeve","maxSize":"3 × 12 in","method":"DTF transfer"}]'),
  ('Hi-vis work tee (blank)', array['DTF transfer', 'Heat transfer vinyl'],
   '[{"location":"Left chest","maxSize":"4 × 4 in","method":"DTF transfer"},{"location":"Full back","maxSize":"10 × 10 in","method":"DTF transfer"}]'),
  ('Custom crew hoodie (cut and sew)', array['Screen print', 'Embroidery', 'Patch (woven, leather, PVC)'],
   '[{"location":"Full front","maxSize":"12 × 14 in","method":"Screen print"},{"location":"Left chest","maxSize":"4 × 4 in","method":"Embroidery"},{"location":"Hood","maxSize":"3 × 3 in","method":"Patch (woven, leather, PVC)"}]'),
  ('Insulated work jacket', array['Embroidery', 'Patch (woven, leather, PVC)'],
   '[{"location":"Left chest","maxSize":"4 × 4 in","method":"Embroidery"},{"location":"Full back","maxSize":"10 × 12 in","method":"Patch (woven, leather, PVC)"}]'),
  ('Commuter laptop backpack', array['Embroidery', 'Patch (woven, leather, PVC)'],
   '[{"location":"Front pocket","maxSize":"5 × 4 in","method":""}]'),
  ('Stretch work pants', array['Embroidery'],
   '[{"location":"Left thigh","maxSize":"3 × 3 in","method":""}]'),
  ('6" composite-toe work boot', array['Deboss / emboss'],
   '[{"location":"Tongue","maxSize":"30 × 20 mm","method":""}]'),
  ('Insulated tumbler', array['Laser engraving', 'UV print'],
   '[{"location":"One side","maxSize":"2.5 × 3 in","method":"Laser engraving"},{"location":"Wrap-around","maxSize":"9 × 3 in","method":"UV print"}]'),
  ('Metal click pen with stylus', array['Laser engraving', 'Pad print'],
   '[{"location":"Barrel","maxSize":"40 × 8 mm","method":"Laser engraving"}]'),
  ('Executive gift set', array['Deboss / emboss', 'Laser engraving', 'UV print'],
   '[{"location":"Lid","maxSize":"4 × 3 in","method":"Deboss / emboss"},{"location":"Front","maxSize":"3 × 3 in","method":"Deboss / emboss"}]')
) as v (name, methods, areas)
where p.is_sample and p.name = v.name;
