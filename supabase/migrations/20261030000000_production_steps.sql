-- Production steps: Prep becomes Prep/Prime, and Shipped follows Done.
-- Shipped is now the finished step; Done jobs still count as on the go
-- (and can be late) until they ship.
update public.production_steps set name = 'Prep/Prime' where name = 'Prep';
update public.production_steps set is_done = false where name = 'Done';
insert into public.production_steps (name, position, is_done)
select 'Shipped', coalesce(max(position), 0) + 1, true from public.production_steps
where not exists (select 1 from public.production_steps where name = 'Shipped');
