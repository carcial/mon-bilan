/**
 * Read-only audit trail for the Activity UI.
 */

import { getSupabaseOrThrow } from "./client.js";
import { auditTablesForDomain, formatAuditEvent } from "../../utils/audit-format.js";

export const AUDIT_PAGE_SIZE = 25;

export async function getAuditEvents({
  offset = 0,
  limit = AUDIT_PAGE_SIZE,
  domain = "business",
} = {}) {
  const sb = getSupabaseOrThrow();
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await sb
    .from("audit_events")
    .select("id, entity_table, entity_id, action, previous_values, new_values, created_at")
    .in("entity_table", auditTablesForDomain(domain))
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = data ?? [];
  return {
    items: rows.map((row) => ({
      ...row,
      formatted: formatAuditEvent(row),
    })),
    offset,
    limit,
    hasMore: rows.length === limit,
  };
}
