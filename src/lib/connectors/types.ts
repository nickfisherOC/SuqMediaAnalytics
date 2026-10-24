import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "@/config/platforms";
import type { ISODate } from "@/lib/dates";

/** A connected account as the sync engine sees it. */
export interface AccountRecord {
  id: string;
  brandId: string;
  brandSlug: string;
  platform: Platform;
  externalId: string;
  displayName: string | null;
  settings: Record<string, unknown>;
}

export interface MetricPoint {
  date: ISODate;
  metric: string;
  value: number;
}

/** An API response kept untouched in `raw_ingest`. */
export interface RawCapture {
  endpoint: string;
  params?: Record<string, unknown>;
  forDate?: ISODate;
  payload: unknown;
}

export interface FlagInput {
  kind: string;
  severity: "info" | "warning" | "serious";
  dateFrom: ISODate;
  dateTo: ISODate;
  title: string;
  detail: string;
  /** Identifies the flag so re-running a sync updates it instead of adding a duplicate. */
  key: string;
}

export interface SyncContext {
  db: SupabaseClient;
  account: AccountRecord;
  from: ISODate;
  to: ISODate;
  /** Decrypted credential from Supabase Vault. */
  secret(kind: "access" | "refresh"): Promise<string>;
  capture(raw: RawCapture): void;
  flag(flag: FlagInput): void;
  syncRunId: number;
}

export interface ConnectorResult {
  metrics: MetricPoint[];
  /** Rows written to other tables (ads, leads, …), for the sync log. */
  extraRows?: number;
}

export type Connector = (ctx: SyncContext) => Promise<ConnectorResult>;

/** Thrown for problems the person has to fix (revoked access, missing setting), not transient errors. */
export class ConnectorConfigError extends Error {}
