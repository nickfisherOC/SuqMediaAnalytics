-- Goals: repeating weekly/monthly targets as well as one-off ones with a
-- deadline, and whether the number should stay above or below the target.
alter table public.goals
  add column cadence   text not null default 'deadline' check (cadence in ('week', 'month', 'deadline')),
  add column direction text check (direction in ('at_least', 'at_most'));

-- A weekly or monthly goal repeats, so its deadline is just a far-off placeholder.
alter table public.goals alter column deadline drop not null;
alter table public.goals add constraint goals_deadline_needed check (cadence <> 'deadline' or deadline is not null);
