"use client";

import { useRef, useState, useTransition } from "react";
import { cancelInvite, inviteUser, removeUser, setRole } from "@/app/(app)/settings/actions";
import type { PendingInvite, Person } from "@/lib/data/settings";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", viewer: "Viewer", production: "Production only" };

const card = "rounded-2xl border border-line bg-surface p-5";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", year: "numeric" }) : "never";

function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage(r.message ? { ok: r.ok, text: r.message } : null);
    });
  return { pending, message, run };
}

function PersonRow({ p, me }: { p: Person; me: boolean }) {
  const { pending, message, run } = useAction();
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="font-semibold">
          {p.name ?? p.email}
          {me && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
        </p>
        <p className="text-xs text-muted">
          {p.email} · joined {when(p.joined)} · last signed in {when(p.lastSignIn)}
        </p>
        {message && <p className={`text-xs ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</p>}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={p.role}
          disabled={pending}
          onChange={(e) => run(() => setRole(p.id, e.target.value))}
          aria-label={`Role for ${p.email}`}
          className="h-9 rounded-lg border border-line bg-page px-2 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
          <option value="production">Production only</option>
        </select>
        {!me && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm(`Remove ${p.email}'s access to Pulse?`) && run(() => removeUser(p.id))}
            className="h-9 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-bad"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function InviteRow({ i }: { i: PendingInvite }) {
  const { pending, run } = useAction();
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 py-2 ${pending ? "opacity-60" : ""}`}>
      <p className="text-sm">
        <span className="font-medium">{i.email}</span>
        <span className="text-muted"> · {ROLE_LABEL[i.role] ?? "Viewer"} · invited {when(i.invitedOn)}, hasn&apos;t signed in yet</span>
      </p>
      <button type="button" disabled={pending} onClick={() => run(() => cancelInvite(i.email))} className="text-sm text-ink-2 hover:text-bad">
        Cancel invite
      </button>
    </li>
  );
}

/** The team: roles, removing access, pending invites, and inviting someone new. */
export function People({ people, invites, meId }: { people: Person[]; invites: PendingInvite[]; meId: string }) {
  const { pending, message, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <div className={`${card} flex flex-col gap-4`}>
      <ul className="divide-y divide-line">
        {people.map((p) => (
          <PersonRow key={p.id} p={p} me={p.id === meId} />
        ))}
      </ul>
      {invites.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-1 text-sm font-semibold text-ink-2">Invited, not signed in yet</p>
          <ul>
            {invites.map((i) => (
              <InviteRow key={i.email} i={i} />
            ))}
          </ul>
        </div>
      )}
      <form
        ref={form}
        action={(fd) =>
          run(async () => {
            const r = await inviteUser(fd);
            if (r.ok) form.current?.reset();
            return r;
          })
        }
        className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
      >
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted">
          Invite by email (their Google account)
          <input name="email" type="email" required placeholder="name@example.com" className="h-9 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Role
          <select name="role" defaultValue="viewer" className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
            <option value="production">Production only</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Inviting…" : "Invite"}
        </button>
      </form>
      {message && <p className={`text-sm ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</p>}
      <p className="text-xs text-muted">
        Admins can change settings, goals and keywords. Viewers see everything and can add notes and action items and accept ideas. Production only sees the print queue and nothing else. Pulse doesn&apos;t send
        emails yet, so let people know yourself.
      </p>
    </div>
  );
}
