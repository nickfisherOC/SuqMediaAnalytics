import "server-only";
import type { BrandSettings } from "@/config/brands";
import type { Series } from "@/config/series";
import { createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { querySeries } from "./queries";
import { getAppContext, type AppContext, type Role } from "./source";

export interface Person {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  joined: string;
  lastSignIn: string | null;
}

export interface PendingInvite {
  email: string;
  role: Role;
  invitedOn: string;
}

export interface SettingsPage {
  ctx: AppContext;
  people: Person[];
  invites: PendingInvite[];
  /** Every brand, archived ones included. */
  brands: (BrandSettings & { active: boolean })[];
  series: Series[];
}

/** Everything Settings shows. Admins only; returns null for anyone else. */
export async function loadSettings(): Promise<SettingsPage | null> {
  const ctx = await getAppContext();
  if (ctx.mode !== "live" || ctx.viewer.role !== "admin") return null;
  const db = await createUserClient();
  const [{ data: profiles }, { data: invites }, { data: brandRows }] = await Promise.all([
    db.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    db.from("invites").select("email, role, created_at").is("accepted_at", null).order("created_at"),
    db.from("brands").select("*").order("sort_order"),
  ]);

  // Last sign-in lives on the sign-in accounts, which only the server can read.
  const lastSignIn = new Map<string, string | null>();
  try {
    const { data } = await createServiceClient().auth.admin.listUsers({ perPage: 200 });
    for (const u of data.users) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  } catch {
    // Optional detail.
  }

  const brands = (brandRows ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortName: r.short_name,
    website: r.website,
    accent: { light: r.accent_light, dark: r.accent_dark },
    platforms: r.platforms,
    cadence: { postsPerWeek: Number(r.cadence_posts_per_week) },
    scoreboard: r.scoreboard,
    funnel: r.funnel,
    active: r.active,
  })) as (BrandSettings & { active: boolean })[];

  return {
    ctx,
    people: (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      name: p.full_name,
      role: p.role,
      joined: p.created_at.slice(0, 10),
      lastSignIn: lastSignIn.get(p.id) ?? null,
    })),
    invites: (invites ?? []).map((i) => ({ email: i.email, role: i.role, invitedOn: i.created_at.slice(0, 10) })),
    brands,
    series: await querySeries(db, brands),
  };
}
