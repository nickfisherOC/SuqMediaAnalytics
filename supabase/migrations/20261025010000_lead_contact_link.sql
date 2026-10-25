-- Names on the Sales Pipeline's follow-up list (admins only, via the
-- existing lead_contacts RLS) with a button to the contact in Lead Rescue.
alter table public.lead_contacts
  add column company text,
  add column url     text;
