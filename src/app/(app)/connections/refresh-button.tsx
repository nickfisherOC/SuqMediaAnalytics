"use client";

import { useActionState } from "react";
import { refreshNow, type RefreshState } from "./actions";

export function RefreshButton() {
  const [state, action, pending] = useActionState<RefreshState, FormData>(refreshNow, { message: null });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page disabled:opacity-60"
      >
        {pending ? "Refreshing… (about a minute)" : "Refresh now"}
      </button>
      {state.message && (
        <p className="text-sm text-ink-2" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
