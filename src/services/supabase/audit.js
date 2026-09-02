/**
 * Lightweight audit trail writes — uses the existing audit_events table.
 */

import { getSupabaseOrThrow } from "./client.js";

/**
 * @param {{
 *   entityTable: string,
 *   entityId: string,
 *   action: 'insert' | 'update' | 'delete',
 *   previousValues?: object | null,
 *   newValues?: object | null,
 * }} input
 */
export async function recordAuditEvent(input) {
  const sb = getSupabaseOrThrow();
  const { error } = await sb.from("audit_events").insert({
    entity_table: input.entityTable,
    entity_id: input.entityId,
    action: input.action,
    previous_values: input.previousValues ?? null,
    new_values: input.newValues ?? null,
  });
  if (error) throw error;
}

/**
 * Best-effort audit after a successful financial write.
 * Never throws — the money record is already saved.
 */
export async function recordAuditEventSafe(input) {
  try {
    await recordAuditEvent(input);
    return true;
  } catch (err) {
    console.error("[audit] write failed", err);
    return false;
  }
}
