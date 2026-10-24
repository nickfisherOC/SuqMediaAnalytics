# Pulse

The weekly growth review for PeopleSuq, SUQ Media and (later) the MKK Foundation.
Hosted at **reports.peoplesuq.com**. Invite only.

Next.js 16 (App Router, Cache Components) · Supabase (Postgres, Auth, RLS, Vault) ·
Tailwind 4 · Vercel. All dates are America/Edmonton, weeks run Monday to Sunday,
money is CAD.

## Run it

```bash
npm install
npm run dev
```

With no Supabase variables set, Pulse runs in **preview mode**: built-in sample data,
no sign-in, a "Preview · sample data" badge. Preview mode never runs in production.

To run against Supabase, copy `.env.example` to `.env.local`, fill it in, and follow
[docs/SETUP.md](docs/SETUP.md).

```bash
npm test            # metric maths, periods and comparisons
npm run typecheck
npm run lint
```

## Environment variables

| Name | Where | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Supabase publishable key (RLS applies) |
| `SUPABASE_SECRET_KEY` | server only | Service key for sync jobs and seeding. Bypasses RLS. |
| `NEXT_PUBLIC_PULSE_EMAIL_DOMAIN` | browser | Optional. Steers Google's account picker to your Workspace. |
| `PULSE_ADMIN_EMAILS`, `PULSE_VIEWER_EMAILS` | seed script | Who gets invited |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server only | Connect Google and the Google sync (same OAuth client as sign-in) |
| `CRON_SECRET` | server only | Protects the nightly sync URL; Vercel Cron sends it |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | server only | AI layer (phase 5) |

## How it fits together

```
connectors ──► raw_ingest (every API response, untouched)
           └─► metric_daily, content_*, ads_daily, site_daily, leads …
                         │
                         ▼
          src/lib/metrics/engine.ts   one place for all metric maths
                         │
                         ▼
          src/lib/pack.ts  ──►  week pack (JSON)  ──►  screens
                                                 ├──►  AI (cites figure ids only)
                                                 └──►  locked week snapshot
```

- **Metric dictionary**: [src/config/metrics.ts](src/config/metrics.ts). Every number's
  name, plain-English definition, source platforms, how it adds up (sum, last value,
  ratio), whether it's comparable across platforms, and its caveats. The ⓘ on every tile
  reads from here.
- **Brands**: [src/config/brands.ts](src/config/brands.ts) holds the defaults the
  database is seeded with. After seeding, the `brands` table is the source of truth.
- **Periods**: [src/lib/periods.ts](src/lib/periods.ts). Last complete week by default
  (the meeting is on Mondays), and comparisons always use same-length windows.
- **Schema and security**: [supabase/migrations](supabase/migrations). Invite-only sign-up
  is enforced in the database. Tokens live in Supabase Vault and are readable only by
  the service role. Lead contact details are admin-only. Locked weeks are immutable.

## Connectors and the nightly sync

Live connectors: Facebook Pages, Instagram and Meta Ads (one never-expiring system-user token),
Shopify (Dev Dashboard app, client credentials), Lead Rescue (workspace API key) and Google
(Analytics 4, Search Console, YouTube) via the **Connect Google** button on the Connections page,
which stores a refresh token per account and backfills from Sep 1. TikTok comes next. Code lives in [src/lib/connectors](src/lib/connectors); the engine that writes
results, logs `sync_runs` and keeps every response in `raw_ingest` is [src/lib/sync/engine.ts](src/lib/sync/engine.ts).

```bash
npm run connect                          # move credentials from .env.local into Supabase Vault
npm run sync -- --from 2026-10-01        # backfill
npm run sync -- --platform shopify       # one platform, last 4 days
```

Vercel Cron calls `/api/cron/sync` every day at 10:00 UTC (about 4am in Edmonton) and re-pulls
the last 4 days, since platforms revise recent numbers. It needs `CRON_SECRET` set in Vercel.
Admins can also press **Refresh now** on the Connections page.

## Add a brand

1. Insert a row into `brands` (slug, name, accent colours, platforms, cadence,
   scoreboard and funnel as JSON). For the MKK Foundation, you can also add it to
   `DEFAULT_BRANDS` and run `npm run seed`, which only adds brands that don't exist yet.
2. Connect its accounts on the Connections page.

No code changes are needed: every screen reads its brands from the table.

## Add a metric

1. Add an entry to `METRICS` in [src/config/metrics.ts](src/config/metrics.ts). For a
   ratio, define it from other metrics (`numerator` / `denominator`). Never store a
   pre-computed ratio, because it can't be added up over days.
2. Have the connector write it to `metric_daily` under that `metric_key`.
3. To show it on the Weekly Review, add it to a brand's `scoreboard`.

## Reconnect an account

Connections page → the source's card → **Reconnect**. (Connectors arrive in phases 3
and 4.) Pulse emails admins before a token expires and after two failed syncs in a row.

## Sample data

`npm run seed -- --sample` loads realistic sample numbers from Oct 1, and
`npm run seed -- --clear-sample` removes them. Every sample row is flagged `is_sample`,
and any screen showing it is badged.
