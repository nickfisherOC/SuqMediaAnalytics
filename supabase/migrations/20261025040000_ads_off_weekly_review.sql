-- Ad numbers live on the Ads page now: take Meta ads tiles and funnel steps
-- (and cost per lead / leads from ads) off each brand's Weekly Review.
update public.brands
set
  scoreboard = (
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
    from jsonb_array_elements(scoreboard) with ordinality as t (e, ord)
    where e ->> 'platform' <> 'meta_ads' and e ->> 'metric' not in ('cost_per_lead', 'leads_from_ads')
  ),
  funnel = (
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
    from jsonb_array_elements(funnel) with ordinality as t (e, ord)
    where e ->> 'platform' <> 'meta_ads' and e ->> 'metric' not in ('cost_per_lead', 'leads_from_ads')
  );
