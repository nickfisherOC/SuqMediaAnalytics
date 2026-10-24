# Pulse setup checklist

Work through this in order. Part A gets the shell live on `reports.peoplesuq.com`.
Part B is the platform access with the longest lead times; start it now so the
connectors have something to connect to in phases 3 and 4.

Keys and secrets go into `.env.local` (on your machine) and Vercel's environment
variables yourself. Don't paste them into chat.

Connector redirect URIs follow one pattern, so you can register them all now:

```
https://reports.peoplesuq.com/api/connect/<source>/callback
http://localhost:3000/api/connect/<source>/callback
```

`<source>` is `google`, `meta`, `tiktok` or `shopify`.

---

## Part A: get the shell live

### A1. Supabase

1. Create a project named **pulse**. Region: **Canada (Central)**.
2. **Project Settings → API Keys**: copy the project URL, the **publishable** key and
   the **secret** key into `.env.local` (see `.env.example`).
3. **Authentication → Sign In / Providers**: turn **Email** off. Pulse uses Google only.
4. **Authentication → URL Configuration**:
   - Site URL: `https://reports.peoplesuq.com`
   - Redirect URLs: `http://localhost:3000/**`, `https://reports.peoplesuq.com/**`
5. Apply the schema and seed (from this folder):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   npm run seed -- --sample
   ```
   The seed creates both brands and invites everyone in `PULSE_ADMIN_EMAILS` /
   `PULSE_VIEWER_EMAILS` (admins: nick@nickfisher.dev and info@suqmedia.com; viewer:
   eric@soulmanmarketing.com). It also loads sample data from Sep 27, matched to the Oct 19
   reports. Sample data is badged in the app and removed with `npm run seed -- --clear-sample`.

### A2. Google sign-in

The team signs in from three domains (suqmedia.com, nickfisher.dev,
soulmanmarketing.com), so the Google app has to be **External**. That's fine: the
invite list in Pulse decides who gets in, not Google.

Sign in to Google Cloud as **nick@nickfisher.dev**. That account owns the YouTube
channel, and the same project is reused for GA4, Search Console and YouTube in B3.

1. [console.cloud.google.com](https://console.cloud.google.com) → new project **Pulse**.
2. **Google Auth Platform → Branding**: app name *Pulse*, support email, and the
   authorized domains `peoplesuq.com` and `supabase.co`.
3. **Audience**: user type **External**, then **Publish app** (status *In production*).
   Sign-in only asks for name and email, so Google doesn't review it. Don't leave it in
   *Testing*: Google expires connections after 7 days in that mode.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `https://reports.peoplesuq.com`, `http://localhost:3000`
   - Authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on and
   paste the client ID and secret.

### A3. GitHub and Vercel

1. Push this repo to a private GitHub repository (I can create it for you with `gh` if you'd like).
2. Vercel → **Add New → Project** → import the repo. It detects Next.js automatically.
3. **Settings → Environment Variables**: add everything from `.env.local` except
   `PULSE_*_EMAILS`.
4. **Settings → Domains → Add** `reports.peoplesuq.com`. Vercel shows the record it wants.

### A4. DNS at Network Solutions

**Domain Management → peoplesuq.com → Manage → Advanced DNS records → Add record**:

| Type | Host / Alias | Points to | TTL |
|---|---|---|---|
| CNAME | `reports` | `cname.vercel-dns.com` (or the exact value Vercel shows) | 1 hour |

Leave the existing `peoplesuq.com` and `www` records alone. Vercel issues the HTTPS
certificate once the record resolves, usually within an hour.

---

## Part B: platform access (start now)

### B1. Meta: Facebook Pages, Instagram, Meta Ads

You don't need Meta App Review. Pulse only reads assets you own, and an app in
Development mode, used only by people with a role on it, has Standard Access to
those. App Review and Business Verification only apply when an app serves accounts
you don't own or manage.

1. Check that both Instagram accounts (PeopleSuq, SUQ Media) are **professional
   (Business)** accounts and each is linked to its Facebook Page.
2. In [business.facebook.com](https://business.facebook.com), make sure both Pages, both
   Instagram accounts and the CAD ad account are in a business portfolio you admin.
3. [developers.facebook.com](https://developers.facebook.com) → **Create app** →
   type **Business** → connect it to that portfolio. Name: *Pulse Reporting*.
   Add **Facebook Login for Business**, **Instagram** (API setup with Facebook Login)
   and **Marketing API**. **Keep the app in Development mode.**
4. Valid OAuth redirect URIs: the two `meta` URIs above.
5. **Recommended:** a system user, so the token doesn't expire every 60 days.
   Business Settings → **Users → System users → Add** "Pulse" (admin) → **Assign assets**:
   both Pages, both Instagram accounts, the ad account → **Generate token** for the
   Pulse app with these permissions:
   `pages_show_list, pages_read_engagement, pages_read_user_content, read_insights,
   instagram_basic, instagram_manage_insights, ads_read, business_management`.
   Keep the token; you'll add it on the Connections page in phase 4.
6. Turn on Instagram story insights if they're off. Story numbers are only kept for
   24 hours, so Pulse will collect them several times a day.

### B2. TikTok

1. [developers.tiktok.com](https://developers.tiktok.com): sign in with the account
   that owns PeopleSuq's TikTok, then **Manage apps → Connect an app**.
2. Add **Login Kit** and **Display API**. Scopes: `user.info.basic`, `user.info.profile`,
   `user.info.stats`, `video.list`. Nothing else, since review checks that every scope is used.
3. Redirect URI: `https://reports.peoplesuq.com/api/connect/tiktok/callback`.
4. **Sandbox**: add the PeopleSuq TikTok account as a target user. We build against
   the sandbox while review runs.
5. Review needs a privacy policy URL and terms URL (peoplesuq.com pages are fine) and a
   demo video. I'll record the demo against the sandbox in phase 4.

**What TikTok won't give us:** the Display API returns followers and lifetime views,
likes, comments and shares per video. It **doesn't** return traffic sources (For You %),
profile views, or whether a video is stuck in review. Pulse will say "not available
from TikTok" for those. It will also infer "stuck" when a video's views stay at zero.
The fuller TikTok API for Business only works with a TikTok **Business** account. Is
PeopleSuq's TikTok a Business or Creator account?

### B3. Google: GA4, Search Console, YouTube

Same Google Cloud project as A2.

1. **APIs & Services → Enable**: Google Analytics Data API, Google Analytics Admin API,
   Google Search Console API, YouTube Data API v3, YouTube Analytics API.
2. On the same OAuth client, add the redirect URIs for `google`.
3. **Data access → Add scopes**: `analytics.readonly`, `webmasters.readonly`,
   `youtube.readonly`, `yt-analytics.readonly`.
4. Confirm that **nick@nickfisher.dev** can see:
   - a GA4 property for **peoplesuq.com** (the Vercel storefront) and one for **suqmedia.com**
   - verified Search Console **domain** properties for both
   - the PeopleSuq YouTube channel (it owns it, so this one's done).

**One warning screen to expect:** these data scopes are "sensitive", and we won't put
Pulse through Google's verification for a private tool. So when you connect Google in
phase 3, Google says *"Google hasn't verified this app"*. Click **Advanced → Go to
Pulse**. You only do this once; the connection then keeps working. Team members
signing in never see it.

### B4. Shopify

1. Shopify admin → **Settings → Apps → Develop apps** (or the Dev Dashboard if Shopify
   sends you there) → create **Pulse**.
2. Admin API scopes: `read_orders`, `read_products`, `read_analytics`, `read_reports`.
   No customer scopes: Pulse doesn't need names or emails.
3. Install it on the store, then keep the Admin API access token for phase 3.

### B5. Lead Rescue (Growtheon)

Yes, Pulse needs an API key: a **read-only** one is enough. It doesn't need to change
anything in Lead Rescue. Keep the key yourself and add it on the Connections page in
phase 4; don't send it in chat or email. There's no public documentation for
Growtheon's API, so first check which kind of key it offers:

1. Log in at app.leadrescue.pro → **Settings**. Is there an item called **Private
   Integrations**, **API Keys** or **Integrations**? A screenshot of the Settings
   menu is perfect.
   - If you see **Private Integrations**, it's built on HighLevel, which has a full API.
     Create one named *Pulse* with read-only scopes for contacts, opportunities,
     pipelines, forms and locations. Also send the **Location ID** (Settings → Business Profile).
2. **Automation → Workflows → add action**: is there a **Webhook** action? That gives us
   real-time stage changes either way.
3. **SUQ Media site:** the quote forms on suqmedia.com should pass `utm_source`,
   `utm_campaign`, `utm_content` and `fbclid` into hidden fields. Otherwise Pulse can
   only attribute leads from the self-reported "How did you find us?" answer. I can
   make that change in the suqmedia.com repo.

### B6. Later (no rush)

- **Anthropic API key** for the AI layer (phase 5): [console.anthropic.com](https://console.anthropic.com).
- **Resend** (or Postmark) account and a sending address such as `pulse@peoplesuq.com`,
  for token-expiry alerts and the Monday brief.
