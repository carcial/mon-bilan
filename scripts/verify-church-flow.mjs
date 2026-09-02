/**
 * Safe Church Phase 2 end-to-end check against the linked Supabase project.
 * Creates an obviously labeled temporary record, then deletes it.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const MARKER = "[TEST-PHASE2] temporaire — à supprimer";

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("xxxxxxxx")) {
    fail("configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: funds, error: fundsError } = await sb
    .from("church_funds")
    .select("id, code, name, opening_balance_fcfa")
    .eq("is_active", true)
    .order("sort_order");
  if (fundsError) fail(`funds: ${fundsError.message}`);
  if (!funds?.length) fail("no active church funds");
  console.log("OK   funds:", funds.map((f) => f.code).join(", "));

  const fund = funds[0];
  const { data: beforeBalance, error: beforeError } = await sb.rpc("church_fund_balance", {
    p_fund_id: fund.id,
  });
  if (beforeError) fail(`balance before: ${beforeError.message}`);
  console.log("OK   balance before:", beforeBalance);

  let createdId = null;
  try {
    const { data: created, error: createError } = await sb
      .from("church_transactions")
      .insert({
        fund_id: fund.id,
        transaction_type: "income",
        amount_fcfa: 1234,
        transaction_date: "2026-09-02",
        reason: MARKER,
        note: "Phase 2 verification — delete immediately",
      })
      .select("id, amount_fcfa, reason")
      .single();
    if (createError) fail(`create: ${createError.message}`);
    createdId = created.id;
    console.log("OK   created:", created.id);

    const { data: readBack, error: readError } = await sb
      .from("church_transactions")
      .select("id, amount_fcfa, reason")
      .eq("id", created.id)
      .single();
    if (readError || readBack?.amount_fcfa !== 1234) {
      fail(`read: ${readError?.message || "amount mismatch"}`);
    }
    console.log("OK   read amount:", readBack.amount_fcfa);

    const { data: afterCreate, error: afterCreateError } = await sb.rpc("church_fund_balance", {
      p_fund_id: fund.id,
    });
    if (afterCreateError) fail(`balance after create: ${afterCreateError.message}`);
    if (afterCreate !== beforeBalance + 1234) {
      fail(`balance did not increase by 1234 (${beforeBalance} → ${afterCreate})`);
    }
    console.log("OK   balance after create:", afterCreate);

    const { data: updated, error: updateError } = await sb
      .from("church_transactions")
      .update({ amount_fcfa: 123 })
      .eq("id", created.id)
      .select("id, amount_fcfa")
      .single();
    if (updateError || updated?.amount_fcfa !== 123) {
      fail(`update: ${updateError?.message || "amount mismatch"}`);
    }
    console.log("OK   updated amount:", updated.amount_fcfa);

    const { error: auditError } = await sb.from("audit_events").insert({
      entity_table: "church_transactions",
      entity_id: created.id,
      action: "update",
      previous_values: { amount_fcfa: 1234, reason: MARKER },
      new_values: { amount_fcfa: 123, reason: MARKER },
    });
    if (auditError) fail(`audit update: ${auditError.message}`);
    console.log("OK   audit update written");

    const { error: auditDeleteError } = await sb.from("audit_events").insert({
      entity_table: "church_transactions",
      entity_id: created.id,
      action: "delete",
      previous_values: { amount_fcfa: 123, reason: MARKER },
    });
    if (auditDeleteError) fail(`audit delete: ${auditDeleteError.message}`);
  } finally {
    if (createdId) {
      await sb.from("church_transactions").delete().eq("id", createdId);
      await sb.from("audit_events").delete().eq("entity_id", createdId);
    }
    await sb.from("church_transactions").delete().eq("reason", MARKER);
  }

  const { data: leftover } = await sb
    .from("church_transactions")
    .select("id")
    .eq("reason", MARKER);
  if (leftover?.length) fail("test transaction still present");

  const { data: finalBalance, error: finalError } = await sb.rpc("church_fund_balance", {
    p_fund_id: fund.id,
  });
  if (finalError) fail(`final balance: ${finalError.message}`);
  if (finalBalance !== beforeBalance) {
    fail(`balance not restored (${beforeBalance} → ${finalBalance})`);
  }
  console.log("OK   cleaned test records");
  console.log("OK   balance restored:", finalBalance);
  console.log("PASS church phase 2 verification");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
