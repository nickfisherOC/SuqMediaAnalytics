-- AI weekly summary and recommendations.

-- The date window an action item's baseline was measured over, so the
-- outcome check can compare a window of the same length later on.
alter table public.action_items
  add column baseline_from date,
  add column baseline_to   date;

create index recommendations_brand_week on public.recommendations (brand_id, week_start);
create index action_items_recommendation on public.action_items (recommendation_id);
