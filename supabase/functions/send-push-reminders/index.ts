import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@2.0.0";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO,
  computeDueReminders,
  everyNDaysDue,
  getChurchWithdrawalExpenseWindowISO,
  getLocalDateISO,
  isAroundLocalHour,
  isFcmInvalidTokenStatus,
  isSundayOnLocalDate,
} from "../_shared/reminders.js";
import {
  FCM_OAUTH_GRANT_TYPE,
  FCM_OAUTH_SCOPE,
  FCM_OAUTH_TOKEN_URL,
  SMOKE_PUSH_COPY,
  TEST_PUSH_COPY,
  buildDeepLinkUrl,
  buildEdgeCorsHeaders,
  buildFcmHttpV1Message,
  buildFcmHttpV1SendUrl,
  isDiagnosticPushType,
  normalizeServiceAccountPrivateKey,
} from "../_shared/fcm-auth.js";
import {
  PUSH_PROVIDERS,
  buildWebPushMessagePayload,
  endpointsToDisableFromResults,
  interpretWebPushSendStatus,
  isStalePushStatus,
  missingWebPushServerEnvNames,
  normalizeWebPushSubject,
  selectDevicesForSend,
} from "../_shared/web-push.js";

function corsHeaders(req: Request) {
  return buildEdgeCorsHeaders(req.headers.get("Origin") || "*");
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function base64UrlEncode(input: Uint8Array) {
  let str = "";
  for (let i = 0; i < input.length; i++) str += String.fromCharCode(input[i]);
  const b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToPkcs8Der(pem: string) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signJwtRS256({
  privateKeyPem,
  clientEmail,
  scope,
}: {
  privateKeyPem: string;
  clientEmail: string;
  scope: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const claimBytes = new TextEncoder().encode(JSON.stringify(claim));

  const headerB64 = base64UrlEncode(headerBytes);
  const claimB64 = base64UrlEncode(claimBytes);
  const unsigned = `${headerB64}.${claimB64}`;

  const der = pemToPkcs8Der(privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getFirebaseAccessToken() {
  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizeServiceAccountPrivateKey(getEnv("FIREBASE_PRIVATE_KEY"));
  const jwt = await signJwtRS256({
    privateKeyPem: privateKey,
    clientEmail,
    scope: FCM_OAUTH_SCOPE,
  });

  const body = new URLSearchParams();
  body.set("grant_type", FCM_OAUTH_GRANT_TYPE);
  body.set("assertion", jwt);

  const res = await fetch(FCM_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Firebase access token error (${res.status}): ${t}`);
  }

  const json = await res.json();
  if (!json?.access_token) throw new Error("Firebase access token missing from response");
  return String(json.access_token);
}

function readWebPushVapidConfig() {
  const publicKey = String(Deno.env.get("WEB_PUSH_PUBLIC_KEY") || "").trim();
  const privateKey = String(Deno.env.get("WEB_PUSH_PRIVATE_KEY") || "").trim();
  const subject = normalizeWebPushSubject(Deno.env.get("WEB_PUSH_SUBJECT") || "");
  const missing = missingWebPushServerEnvNames({
    WEB_PUSH_PUBLIC_KEY: publicKey,
    WEB_PUSH_PRIVATE_KEY: privateKey,
    WEB_PUSH_SUBJECT: subject,
  });
  if (missing.length) return null;
  return { publicKey, privateKey, subject };
}

async function sendWebPushToSubscription({
  vapid,
  device,
  payload,
}: {
  vapid: { publicKey: string; privateKey: string; subject: string };
  device: { endpoint: string; p256dh: string; auth: string };
  payload: Record<string, string>;
}) {
  const subscription = {
    endpoint: device.endpoint,
    expirationTime: null,
    keys: { p256dh: device.p256dh, auth: device.auth },
  };
  const request = await buildPushPayload(
    {
      data: JSON.stringify(payload),
      options: { ttl: 60 * 60, urgency: "high" },
    },
    subscription,
    vapid,
  );
  const res = await fetch(subscription.endpoint, request);
  const interpreted = interpretWebPushSendStatus(res.status);
  console.info("[web-push-send]", { status: res.status, reason: interpreted.reason, stale: interpreted.stale });
  return {
    ok: interpreted.ok,
    status: res.status,
    reason: interpreted.reason,
    endpoint: device.endpoint,
    stale: interpreted.stale || isStalePushStatus(res.status),
  };
}

async function sendFcmDataMessage({
  accessToken,
  projectId,
  fcmToken,
  title,
  body,
  targetUrl,
  reminderType,
  dedupKeyValue,
}: {
  accessToken: string;
  projectId: string;
  fcmToken: string;
  title: string;
  body: string;
  targetUrl: string;
  reminderType: string;
  dedupKeyValue: string;
}) {
  const res = await fetch(buildFcmHttpV1SendUrl(projectId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildFcmHttpV1Message({
        fid: fcmToken,
        title,
        body,
        targetUrl,
        reminderType,
        dedupKey: dedupKeyValue,
      }),
    ),
  });

  if (res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: true, messageId: json?.name ? String(json.name) : null };
  }

  const json = await res.json().catch(() => null);
  return {
    ok: false,
    status: String(json?.error?.status || ""),
    details: json?.error?.message ? String(json.error.message) : null,
  };
}

serve(async (req) => {
  try {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { ok: true });
  }

  const payload = await req.json().catch(() => ({}));
  const requestType = String(payload?.type || "cron");

  if (requestType === "auth") {
    await getFirebaseAccessToken();
    return json(req, { ok: true, oauth: true });
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const appBaseUrl = String(Deno.env.get("APP_BASE_URL") || "").replace(/\/+$/, "");
  const vapid = readWebPushVapidConfig();

  if (requestType !== "test") {
    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString();
    const { error: pruneError } = await supabase
      .from("notification_logs")
      .delete()
      .lt("created_at", cutoff);
    void pruneError;
  }

  const prefsRow = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_key", "default")
    .maybeSingle();
  if (prefsRow.error) throw new Error(`preferences fetch error: ${prefsRow.error.message}`);

  const prefs = prefsRow.data;
  const timezone = prefs?.timezone || DEFAULT_TIMEZONE;
  const enabled = Boolean(prefs?.enabled);
  const churchSundayEnabled = Boolean(prefs?.church_sunday_income_enabled);
  const churchWithdrawalEnabled = Boolean(prefs?.church_withdrawal_check_enabled);
  const businessDailyEnabled = Boolean(prefs?.business_daily_enabled);

  const devicesRes = await supabase
    .from("push_devices")
    .select("fcm_token, platform, enabled, provider, endpoint, p256dh, auth")
    .eq("enabled", true);
  if (devicesRes.error) throw new Error(`devices fetch error: ${devicesRes.error.message}`);
  const plan = selectDevicesForSend(devicesRes.data ?? []);
  const devices = plan.devices;
  if (!devices.length) {
    const noDevice = isDiagnosticPushType(requestType);
    return json(req, {
      ok: !noDevice,
      sent: 0,
      code: noDevice ? "no_device" : "no_device_cron",
      error: noDevice ? "Aucun appareil n'a encore activé les rappels." : undefined,
    });
  }

  const now = new Date();
  const localDateISO = getLocalDateISO(now, timezone);
  const within19 = isAroundLocalHour(now, 19, 1, timezone);
  const needsDelivery = isDiagnosticPushType(requestType) || within19;

  if (plan.preferredProvider === PUSH_PROVIDERS.webpush && !vapid) {
    return json(
      req,
      {
        ok: false,
        sent: 0,
        code: "config_incomplete",
        error: "Les rappels ne sont pas encore complètement configurés.",
      },
      500,
    );
  }

  let firebaseProjectId = "";
  let accessToken = "";
  if (plan.preferredProvider === PUSH_PROVIDERS.firebase && needsDelivery) {
    firebaseProjectId = getEnv("FIREBASE_PROJECT_ID");
    accessToken = await getFirebaseAccessToken();
  }
  let sentCount = 0;

  async function insertDedupLog({
    dedup,
    reminderType,
    domain,
    scheduledForDateISO,
    targetHashRoute,
  }: {
    dedup: string;
    reminderType: string;
    domain: string;
    scheduledForDateISO: string;
    targetHashRoute: string;
  }) {
    try {
      const { data, error } = await supabase
        .from("notification_logs")
        .insert({
          dedup_key: dedup,
          reminder_type: reminderType,
          domain,
          scheduled_for_date: scheduledForDateISO,
          target_route: targetHashRoute,
          status: "sending",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { ok: true, id: data?.id ? String(data.id) : null };
    } catch (e) {
      const msg = String((e as any)?.message || "");
      const code = String((e as any)?.code || "");
      const isDup = code === "23505" || msg.toLowerCase().includes("duplicate");
      if (isDup) return { ok: false, duplicate: true };
      throw e;
    }
  }

  async function markLogStatus(logId: string, status: "sent" | "failed", errorMessage?: string) {
    await supabase
      .from("notification_logs")
      .update({
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        error_message: errorMessage || null,
      })
      .eq("id", logId);
  }

  async function sendToDevices({
    reminderType,
    domain,
    title,
    body,
    targetHashRoute,
    dedup,
    scheduledForDateISO,
  }: {
    reminderType: string;
    domain: string;
    title: string;
    body: string;
    targetHashRoute: string;
    dedup: string;
    scheduledForDateISO: string;
  }) {
    const targetUrl = buildDeepLinkUrl(appBaseUrl, targetHashRoute);

    const logInsert = await insertDedupLog({
      dedup,
      reminderType,
      domain,
      scheduledForDateISO,
      targetHashRoute,
    });

    if (!logInsert.ok && (logInsert as any).duplicate) return;
    const logId = (logInsert as any).id;
    if (!logId) return;

    let anySuccess = false;
    const invalidTokens: string[] = [];
    const sendResults: Array<{ endpoint?: string; stale?: boolean; status?: number }> = [];

    for (const d of devices) {
      if (plan.preferredProvider === PUSH_PROVIDERS.webpush && vapid) {
        const res = await sendWebPushToSubscription({
          vapid,
          device: d as { endpoint: string; p256dh: string; auth: string },
          payload: buildWebPushMessagePayload({
            title,
            body,
            targetUrl,
            reminderType,
            dedupKeyValue: dedup,
          }),
        });
        sendResults.push(res);
        if (res.ok) anySuccess = true;
      } else {
        const token = d.fcm_token;
        const res = await sendFcmDataMessage({
          accessToken,
          projectId: firebaseProjectId,
          fcmToken: token,
          title,
          body,
          targetUrl,
          reminderType,
          dedupKeyValue: dedup,
        });

        if (res.ok) anySuccess = true;
        else if (isFcmInvalidTokenStatus(res.status)) invalidTokens.push(token);
      }
    }

    const staleEndpoints = endpointsToDisableFromResults(sendResults);
    if (staleEndpoints.length) {
      await supabase.from("push_devices").update({ enabled: false }).in("endpoint", staleEndpoints);
    }
    if (invalidTokens.length) {
      await supabase.from("push_devices").update({ enabled: false }).in("fcm_token", invalidTokens);
    }

    if (anySuccess) {
      await markLogStatus(logId, "sent");
      sentCount += 1;
    } else {
      await markLogStatus(
        logId,
        "failed",
        plan.preferredProvider === PUSH_PROVIDERS.webpush
          ? "Web Push send failed (all subscriptions stale or unreachable)"
          : "FCM send failed (all tokens invalid or unreachable)",
      );
    }
  }

  if (isDiagnosticPushType(requestType)) {
    const copy = requestType === "smoke" ? SMOKE_PUSH_COPY : TEST_PUSH_COPY;
    // Test/smoke must work before Cloudflare: never require APP_BASE_URL.
    const targetUrl = buildDeepLinkUrl("", copy.targetHashRoute);
    const dedupKeyValue =
      requestType === "smoke"
        ? `push_smoke_test:${localDateISO}T${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
        : `test:${localDateISO}:${now.getTime()}`;

    let smokeLogId: string | null = null;
    if (requestType === "smoke") {
      const logInsert = await insertDedupLog({
        dedup: dedupKeyValue,
        reminderType: copy.reminderType,
        domain: "system",
        scheduledForDateISO: localDateISO,
        targetHashRoute: copy.targetHashRoute,
      });
      if (!logInsert.ok && (logInsert as { duplicate?: boolean }).duplicate) {
        return json(req, { ok: true, sent: 0, code: "smoke_duplicate" });
      }
      smokeLogId = (logInsert as { id?: string | null }).id || null;
    }

    let anySuccess = false;
    const invalidTokens: string[] = [];
    const sendResults: Array<{ endpoint?: string; stale?: boolean; status?: number }> = [];
    let lastFailure = "";
    let lastHttpStatus = 0;

    for (const d of devices) {
      if (plan.preferredProvider === PUSH_PROVIDERS.webpush && vapid) {
        const res = await sendWebPushToSubscription({
          vapid,
          device: d as { endpoint: string; p256dh: string; auth: string },
          payload: buildWebPushMessagePayload({
            title: copy.title,
            body: copy.body,
            targetUrl,
            reminderType: copy.reminderType,
            dedupKeyValue,
          }),
        });
        sendResults.push(res);
        lastHttpStatus = Number(res.status) || lastHttpStatus;
        if (res.ok) anySuccess = true;
        else lastFailure = String(res.reason || res.status || "webpush_failed");
      } else {
        const token = d.fcm_token;
        const res = await sendFcmDataMessage({
          accessToken,
          projectId: firebaseProjectId,
          fcmToken: token,
          title: copy.title,
          body: copy.body,
          targetUrl,
          reminderType: copy.reminderType,
          dedupKeyValue,
        });

        if (res.ok) anySuccess = true;
        else {
          lastFailure = res.status || "fcm_failed";
          if (isFcmInvalidTokenStatus(res.status)) invalidTokens.push(token);
        }
      }
    }

    const staleEndpoints = endpointsToDisableFromResults(sendResults);
    if (staleEndpoints.length) {
      await supabase.from("push_devices").update({ enabled: false }).in("endpoint", staleEndpoints);
    }
    if (invalidTokens.length) {
      await supabase.from("push_devices").update({ enabled: false }).in("fcm_token", invalidTokens);
    }

    if (smokeLogId) {
      await markLogStatus(smokeLogId, anySuccess ? "sent" : "failed", anySuccess ? undefined : lastFailure);
    }

    if (!anySuccess) {
      const failedCode = plan.preferredProvider === PUSH_PROVIDERS.webpush ? "webpush_failed" : "fcm_failed";
      return json(req, {
        ok: false,
        sent: 0,
        code: failedCode,
        error: "La notification n'a pas pu être envoyée. Réessayez.",
        http_status: lastHttpStatus || undefined,
        send_reason: lastFailure || undefined,
        fcm_status: lastFailure || undefined,
      });
    }

    return json(req, {
      ok: true,
      sent: 1,
      code: requestType === "smoke" ? "smoke_sent" : "sent",
      provider: plan.preferredProvider,
      http_status: lastHttpStatus || 201,
    });
  }

  if (!enabled) {
    return json(req, { ok: true, sent: 0 });
  }
  if (!within19) {
    return json(req, { ok: true, sent: 0, skipped: "outside_window" });
  }

  let churchIncomeRecorded = false;
  if (churchSundayEnabled && isSundayOnLocalDate(now, timezone)) {
    const existingIncome = await supabase
      .from("church_transactions")
      .select("id")
      .eq("transaction_type", "income")
      .eq("transaction_date", localDateISO)
      .limit(1);
    if (existingIncome.error) throw new Error(existingIncome.error.message);
    churchIncomeRecorded = Boolean(existingIncome.data?.length);
  }

  let churchExpenseRecorded = false;
  if (churchWithdrawalEnabled && everyNDaysDue(localDateISO, 2, DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO)) {
    const window = getChurchWithdrawalExpenseWindowISO(localDateISO);
    const existingExpense = await supabase
      .from("church_transactions")
      .select("id")
      .eq("transaction_type", "expense")
      .gte("transaction_date", window.fromISO)
      .lte("transaction_date", window.toISO)
      .limit(1);
    if (existingExpense.error) throw new Error(existingExpense.error.message);
    churchExpenseRecorded = Boolean(existingExpense.data?.length);
  }

  const due = computeDueReminders({
    now,
    timezone,
    withdrawalAnchorDateISO: DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO,
    preferences: {
      enabled,
      church_sunday_income_enabled: churchSundayEnabled,
      church_withdrawal_check_enabled: churchWithdrawalEnabled,
      business_daily_enabled: businessDailyEnabled,
    },
    churchIncomeRecorded,
    churchExpenseRecorded,
  });

  for (const r of due) {
    await sendToDevices({
      reminderType: r.reminderType,
      domain: r.domain,
      title: r.title,
      body: r.body,
      targetHashRoute: r.targetHashRoute,
      dedup: r.dedupKey,
      scheduledForDateISO: r.scheduledForDateISO,
    });
  }

  return json(req, { ok: true, sent: sentCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const configIncomplete =
      lower.includes("missing env var") ||
      lower.includes("web_push") ||
      (lower.includes("firebase") && (lower.includes("private") || lower.includes("client") || lower.includes("project")));
    return json(
      req,
      {
        ok: false,
        code: configIncomplete ? "config_incomplete" : "send_failed",
        error: configIncomplete
          ? "Les rappels ne sont pas encore complètement configurés."
          : message,
      },
      500,
    );
  }
});

