import { config } from "../../config.js";
import {
  PUSH_PROVIDERS,
  buildWebPushDeviceUpsertPayload,
  isCompletePushSubscription,
  serializePushSubscription,
} from "../../../supabase/functions/_shared/web-push.js";
import { getSupabase, getSupabaseOrThrow } from "./client.js";

const PREF_PROFILE_KEY = "default";

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  church_sunday_income_enabled: true,
  church_withdrawal_check_enabled: true,
  business_daily_enabled: true,
  timezone: "Africa/Douala",
};

export function getNotificationSettingsFromRow(row) {
  return {
    enabled: Boolean(row?.enabled),
    church_sunday_income_enabled: Boolean(row?.church_sunday_income_enabled),
    church_withdrawal_check_enabled: Boolean(row?.church_withdrawal_check_enabled),
    business_daily_enabled: Boolean(row?.business_daily_enabled),
    timezone: row?.timezone || DEFAULT_NOTIFICATION_SETTINGS.timezone,
  };
}

export async function fetchNotificationPreferences() {
  const sb = getSupabase();
  if (!sb) return { ...DEFAULT_NOTIFICATION_SETTINGS };

  const { data, error } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("profile_key", PREF_PROFILE_KEY)
    .maybeSingle();

  if (error) throw error;
  return getNotificationSettingsFromRow(data);
}

export async function upsertNotificationPreferences(next) {
  const sb = getSupabaseOrThrow();
  const payload = buildNotificationPreferencesUpsertPayload(next);

  const { data, error } = await sb
    .from("notification_preferences")
    .upsert(payload, { onConflict: "profile_key" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return getNotificationSettingsFromRow(data);
}

export async function upsertPushDevice({
  platform,
  fcmToken,
  enabled = true,
  provider,
  endpoint,
  p256dh,
  auth,
}) {
  const sb = getSupabaseOrThrow();
  const payload = buildPushDeviceUpsertPayload({
    platform,
    fcmToken,
    enabled,
    provider,
    endpoint,
    p256dh,
    auth,
  });
  const onConflict = payload.provider === PUSH_PROVIDERS.webpush ? "endpoint" : "fcm_token";

  const { error } = await sb.from("push_devices").upsert(payload, { onConflict });
  if (error) throw error;
  return payload;
}

export async function upsertWebPushDevice({ platform, subscription, enabled = true }) {
  const serialized = serializePushSubscription(subscription);
  return upsertPushDevice({
    platform,
    provider: PUSH_PROVIDERS.webpush,
    endpoint: serialized.endpoint,
    p256dh: serialized.p256dh,
    auth: serialized.auth,
    enabled,
  });
}

export function buildPushDeviceUpsertPayload({
  platform,
  fcmToken,
  enabled = true,
  lastSeenAtIso,
  provider,
  endpoint,
  p256dh,
  auth,
}) {
  const resolvedProvider =
    provider || (endpoint ? PUSH_PROVIDERS.webpush : PUSH_PROVIDERS.firebase);
  if (resolvedProvider === PUSH_PROVIDERS.webpush) {
    return buildWebPushDeviceUpsertPayload({
      platform,
      endpoint,
      p256dh,
      auth,
      enabled,
      lastSeenAtIso,
    });
  }
  return {
    platform: String(platform || "web"),
    provider: PUSH_PROVIDERS.firebase,
    fcm_token: String(fcmToken),
    enabled: Boolean(enabled),
    last_seen_at: lastSeenAtIso || new Date().toISOString(),
  };
}

export function buildNotificationPreferencesUpsertPayload(next) {
  return {
    profile_key: PREF_PROFILE_KEY,
    enabled: Boolean(next.enabled),
    church_sunday_income_enabled: Boolean(next.church_sunday_income_enabled),
    church_withdrawal_check_enabled: Boolean(next.church_withdrawal_check_enabled),
    business_daily_enabled: Boolean(next.business_daily_enabled),
    timezone: next.timezone || DEFAULT_NOTIFICATION_SETTINGS.timezone,
  };
}

export async function disablePushDeviceToken({ fcmToken }) {
  const sb = getSupabaseOrThrow();
  const { error } = await sb.from("push_devices").update({ enabled: false }).eq("fcm_token", fcmToken);
  if (error) throw error;
}

export function interpretReminderFunctionResponse(payload, httpOk) {
  const body = payload && typeof payload === "object" ? payload : {};
  if (body.code === "no_device") {
    return { ok: false, code: "no_device", sent: 0 };
  }
  if (!httpOk || body.ok === false) {
    return {
      ok: false,
      code: body.code || "send_failed",
      sent: 0,
      error: body.error || "Test notification failed",
    };
  }
  const sent = Number(body.sent) || 0;
  if (sent === 0) {
    return { ok: false, code: "send_failed", sent: 0, error: body.error || "Test notification failed" };
  }
  return { ok: true, sent, code: body.code || "sent" };
}

export function mapNotificationTestError(error) {
  const code = error && typeof error === "object" ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();

  if (code === "no_device" || /aucun appareil/i.test(message)) {
    return "Aucun appareil n'a encore activé les rappels.";
  }
  if (code === "not_registered" || /pas encore enregistré/i.test(message)) {
    return "Les rappels sont autorisés, mais cet appareil n'est pas encore enregistré.";
  }
  if (code === "fcm_failed" || code === "webpush_failed" || /n'a pas pu être envoyée/i.test(message)) {
    return "La notification n'a pas pu être envoyée. Réessayez.";
  }
  if (code === "config_incomplete" || /pas encore complètement configurés/i.test(message)) {
    return "Les rappels ne sont pas encore complètement configurés.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower === "network error"
  ) {
    return "Connexion indisponible. L'opération n'a pas été enregistrée.";
  }
  return message && /[àâäéèêëïîôùûüç]/i.test(message) ? message : "La notification n'a pas pu être envoyée. Réessayez.";
}

export async function fetchEnabledPushDevice({ endpoint, provider } = {}) {
  const sb = getSupabase();
  if (!sb) {
    return { present: false, enabled: false, platform: null, provider: null, endpoint: null, lastSeenAt: null };
  }

  let query = sb
    .from("push_devices")
    .select("platform, provider, endpoint, p256dh, auth, enabled, last_seen_at")
    .eq("enabled", true);

  if (provider) query = query.eq("provider", provider);
  if (endpoint) query = query.eq("endpoint", endpoint);
  else if (!provider) query = query.eq("provider", PUSH_PROVIDERS.webpush);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;

  const serialized = {
    endpoint: data?.endpoint || "",
    p256dh: data?.p256dh || "",
    auth: data?.auth || "",
  };
  const isWebPush = data?.provider === PUSH_PROVIDERS.webpush;
  const present = Boolean(data) && (!isWebPush || isCompletePushSubscription(serialized));

  return {
    present,
    enabled: Boolean(data?.enabled) && present,
    platform: data?.platform || null,
    provider: data?.provider || null,
    endpoint: data?.endpoint || null,
    lastSeenAt: data?.last_seen_at || null,
  };
}

export async function sendNotificationTest() {
  const url = `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/send-push-reminders`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
      },
      body: JSON.stringify({ type: "test" }),
    });
  } catch (err) {
    const error = new Error(err instanceof Error ? err.message : String(err));
    error.code = "network";
    throw error;
  }

  const payload = await res.json().catch(() => ({}));
  const interpreted = interpretReminderFunctionResponse(payload, res.ok);
  if (import.meta.env.DEV) {
    console.info("[rappels-test]", {
      httpStatus: res.status,
      code: interpreted.code,
      sent: interpreted.sent,
      ok: interpreted.ok,
    });
  }
  if (interpreted.code === "no_device") {
    const error = new Error("Aucun appareil n'a encore activé les rappels.");
    error.code = "no_device";
    throw error;
  }
  if (!interpreted.ok) {
    const error = new Error(interpreted.error || `Test notification failed (${res.status})`);
    error.code = interpreted.code || "send_failed";
    throw error;
  }
  return interpreted;
}

export function buildTargetPlatform() {
  return "web";
}

