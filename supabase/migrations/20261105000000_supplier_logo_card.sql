-- A logo and a business card on each supplier's profile. Both are storage
-- paths in the private "inventory" bucket, under supplier-files/<supplier id>/.

alter table public.suppliers
  add column logo          text,
  add column business_card text;
