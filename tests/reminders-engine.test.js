import { describe, expect, it } from "vitest";
import {
  DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO,
  DEFAULT_TIMEZONE,
  REMINDER_TYPES,
  computeDueReminders,
  dedupKey,
  everyNDaysDue,
  getLocalDateISO,
  isAroundLocalHour,
  isFcmInvalidTokenStatus,
  isSundayOnLocalDate,
  reminderTargetHashRoute,
} from "../supabase/functions/_shared/reminders.js";
import {
  buildPushDeviceUpsertPayload,
  interpretReminderFunctionResponse,
  mapNotificationTestError,
} from "../src/services/supabase/notifications.js";
import {
  FCM_OAUTH_GRANT_TYPE,
  FCM_OAUTH_SCOPE,
  FCM_OAUTH_TOKEN_URL,
  FIREBASE_WEB_REGISTRATION_API,
  PRODUCTION_REMINDER_CRON,
  SMOKE_PUSH_COPY,
  TEMPORARY_SMOKE_CRON,
  TEST_PUSH_COPY,
  buildDeepLinkUrl,
  buildSmokeDedupKey,
  shouldStopSmokeAfterMaxSends,
  buildEdgeCorsHeaders,
  buildFcmHttpV1Message,
  buildFcmHttpV1SendUrl,
  cronMatchesDouala1900,
  diagnosticPushDoesNotRequireAppBaseUrl,
  isNormalizedPemPrivateKey,
  missingPublicFirebaseEnvNames,
  normalizeServiceAccountPrivateKey,
  rappelsViewState,
} from "../supabase/functions/_shared/fcm-auth.js";
import { supplierDisplayLabel } from "../src/utils/supplier-label.js";
import { matchBusinessRoute } from "../src/modules/business/business-routes.js";

describe("Africa/Douala local date + Sunday detection", () => {
  it("detects a Sunday using the configured timezone", () => {
    const now = new Date("2026-09-06T18:00:00Z"); // Local time = 19:00, Sunday in Douala
    expect(getLocalDateISO(now, DEFAULT_TIMEZONE)).toBe("2026-09-06");
    expect(isSundayOnLocalDate(now, DEFAULT_TIMEZONE)).toBe(true);
  });
});

describe("deduplication keys", () => {
  it("builds stable reminder keys", () => {
    expect(dedupKey(REMINDER_TYPES.businessDaily, "2026-09-10")).toBe("business_daily:2026-09-10");
  });
});

describe("computeDueReminders preference behavior", () => {
  it("returns nothing when master is disabled", () => {
    const now = new Date("2026-09-06T18:00:00Z");
    const due = computeDueReminders({
      now,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        enabled: false,
        church_sunday_income_enabled: true,
        church_withdrawal_check_enabled: true,
        business_daily_enabled: true,
      },
      churchIncomeRecorded: false,
      churchExpenseRecorded: false,
    });
    expect(due).toHaveLength(0);
  });

  it("suppresses Church Sunday income when already recorded", () => {
    const now = new Date("2026-09-06T18:00:00Z");
    const due = computeDueReminders({
      now,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        enabled: true,
        church_sunday_income_enabled: true,
        church_withdrawal_check_enabled: false,
        business_daily_enabled: false,
      },
      churchIncomeRecorded: true,
      churchExpenseRecorded: false,
    });
    expect(due).toHaveLength(0);
  });

  it("sends Church Sunday income when not recorded", () => {
    const now = new Date("2026-09-06T18:00:00Z");
    const due = computeDueReminders({
      now,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        enabled: true,
        church_sunday_income_enabled: true,
        church_withdrawal_check_enabled: false,
        business_daily_enabled: false,
      },
      churchIncomeRecorded: false,
      churchExpenseRecorded: false,
    });
    expect(due).toHaveLength(1);
    expect(due[0].reminderType).toBe(REMINDER_TYPES.churchSundayIncome);
    expect(due[0].targetHashRoute).toBe("/eglise/entree");
    expect(due[0].dedupKey).toBe("church_sunday_income:2026-09-06");
  });

  it("sends Church withdrawal reminder every 2 days", () => {
    const now = new Date("2026-09-03T18:00:00Z"); // localDateISO = 2026-09-03
    expect(everyNDaysDue("2026-09-03", 2, DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO)).toBe(true);
    expect(everyNDaysDue("2026-09-04", 2, DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO)).toBe(false);

    const due = computeDueReminders({
      now,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        enabled: true,
        church_sunday_income_enabled: false,
        church_withdrawal_check_enabled: true,
        business_daily_enabled: false,
      },
      churchIncomeRecorded: false,
      churchExpenseRecorded: false,
    });
    expect(due).toHaveLength(1);
    expect(due[0].reminderType).toBe(REMINDER_TYPES.churchWithdrawalCheck);
    expect(due[0].targetHashRoute).toBe("/eglise/sortie");
    expect(due[0].dedupKey).toBe("church_withdrawal_check:2026-09-03");
  });

  it("generates a single Business daily reminder", () => {
    const now = new Date("2026-09-04T18:00:00Z");
    const due = computeDueReminders({
      now,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        enabled: true,
        church_sunday_income_enabled: false,
        church_withdrawal_check_enabled: false,
        business_daily_enabled: true,
      },
      churchIncomeRecorded: false,
      churchExpenseRecorded: false,
    });
    expect(due).toHaveLength(1);
    expect(due[0].reminderType).toBe(REMINDER_TYPES.businessDaily);
    expect(due[0].targetHashRoute).toBe("/commerce/quick-actions");
    expect(due[0].dedupKey).toBe(`business_daily:${getLocalDateISO(now, DEFAULT_TIMEZONE)}`);
  });
});

describe("business quick-actions route", () => {
  it("matches the reminder deep link", () => {
    expect(matchBusinessRoute("/commerce/quick-actions").name).toBe("quick-actions");
  });
});

describe("notification route mapping helper", () => {
  it("keeps route mapping consistent", () => {
    expect(reminderTargetHashRoute(REMINDER_TYPES.churchSundayIncome)).toBe("/eglise/entree");
    expect(reminderTargetHashRoute(REMINDER_TYPES.churchWithdrawalCheck)).toBe("/eglise/sortie");
    expect(reminderTargetHashRoute(REMINDER_TYPES.businessDaily)).toBe("/commerce/quick-actions");
  });
});

describe("FCM invalid token detection", () => {
  it("recognizes common invalid token statuses", () => {
    expect(isFcmInvalidTokenStatus("UNREGISTERED")).toBe(true);
    expect(isFcmInvalidTokenStatus("invalid_argument")).toBe(true);
    expect(isFcmInvalidTokenStatus("SOME_OTHER")).toBe(false);
  });
});

describe("supplier display labels", () => {
  it("shows stored SOA / DJS / SO without invented suffixes", () => {
    expect(supplierDisplayLabel({ code: "SOA", name: "SOA" })).toBe("SOA");
    expect(supplierDisplayLabel({ code: "DJS", name: "DJS" })).toBe("DJS");
    expect(supplierDisplayLabel({ code: "SO", name: "SO" })).toBe("SO");
    expect(supplierDisplayLabel({ code: "SO", name: "SO" })).not.toContain("Supplier");
  });
});

describe("Firebase public config validation", () => {
  it("reports only missing VITE_FIREBASE_* names", () => {
    expect(
      missingPublicFirebaseEnvNames({
        VITE_FIREBASE_API_KEY: "x",
        VITE_FIREBASE_AUTH_DOMAIN: "x",
        VITE_FIREBASE_PROJECT_ID: "x",
        VITE_FIREBASE_STORAGE_BUCKET: "x",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "x",
        VITE_FIREBASE_APP_ID: "x",
      }),
    ).toEqual(["VITE_FIREBASE_VAPID_KEY"]);
  });
});

describe("current Firebase registration API", () => {
  it("uses register/onRegistered and FID targeting", () => {
    expect(FIREBASE_WEB_REGISTRATION_API.client).toBe("register + onRegistered");
    expect(FIREBASE_WEB_REGISTRATION_API.identifier).toBe("fid");
    expect(FIREBASE_WEB_REGISTRATION_API.deprecatedClient).toBe("getToken");
  });
});

describe("service-account private key newlines", () => {
  it("turns escaped \\n into a PEM that WebCrypto can parse", () => {
    const escaped =
      "-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n";
    const pem = normalizeServiceAccountPrivateKey(escaped);
    expect(pem).toContain("-----BEGIN PRIVATE KEY-----\n");
    expect(pem).not.toContain("\\n");
    expect(isNormalizedPemPrivateKey(escaped)).toBe(true);
    expect(isNormalizedPemPrivateKey("not-a-key")).toBe(false);
  });
});

describe("FCM HTTP v1 request shape", () => {
  it("builds the v1 send URL and fid payload, not a legacy token endpoint", () => {
    const url = buildFcmHttpV1SendUrl("demo-project");
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/demo-project/messages:send");
    expect(url).not.toContain("fcm/send");
    const body = buildFcmHttpV1Message({
      fid: "fid-1",
      title: "Église",
      body: "Test",
      targetUrl: "https://example.pages.dev#/eglise/entree",
      reminderType: "church_sunday_income",
      dedupKey: "church_sunday_income:2026-09-06",
    });
    expect(body.message.fid).toBe("fid-1");
    expect(body.message.token).toBeUndefined();
  });
});

describe("19:00 Africa/Douala cron", () => {
  it("matches a single 18:00 UTC schedule", () => {
    expect(cronMatchesDouala1900("0 18 * * *")).toBe(true);
    expect(cronMatchesDouala1900("0 19 * * *")).toBe(false);
    const now = new Date("2026-09-06T18:00:00Z");
    expect(getLocalDateISO(now, DEFAULT_TIMEZONE)).toBe("2026-09-06");
    expect(isAroundLocalHour(now, 19, 1, DEFAULT_TIMEZONE)).toBe(true);
  });
});

describe("test notification without a device", () => {
  it("does not report success when no device is registered", () => {
    expect(interpretReminderFunctionResponse({ ok: false, sent: 0, code: "no_device" }, true)).toEqual({
      ok: false,
      code: "no_device",
      sent: 0,
    });
    expect(interpretReminderFunctionResponse({ ok: true, sent: 0 }, true)).toMatchObject({
      ok: false,
      code: "send_failed",
    });
  });
});

describe("OAuth service-account request shape", () => {
  it("uses Google JWT-bearer token exchange for FCM, not a legacy server key", () => {
    expect(FCM_OAUTH_TOKEN_URL).toBe("https://oauth2.googleapis.com/token");
    expect(FCM_OAUTH_SCOPE).toBe("https://www.googleapis.com/auth/firebase.messaging");
    expect(FCM_OAUTH_GRANT_TYPE).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
  });
});

describe("APP_BASE_URL deep links", () => {
  it("does not invent localhost when the production URL is still missing", () => {
    expect(buildDeepLinkUrl("", "/eglise/entree")).toBe("#/eglise/entree");
    expect(buildDeepLinkUrl("https://app.pages.dev/", "/commerce/quick-actions")).toBe(
      "https://app.pages.dev#/commerce/quick-actions",
    );
  });
});

describe("token upsert payload", () => {
  it("builds a stable push_devices upsert payload", () => {
    const payload = buildPushDeviceUpsertPayload({
      platform: "web",
      fcmToken: "tok_123",
      enabled: true,
      lastSeenAtIso: "2026-01-01T10:00:00.000Z",
    });
    expect(payload).toEqual({
      platform: "web",
      provider: "firebase",
      fcm_token: "tok_123",
      enabled: true,
      last_seen_at: "2026-01-01T10:00:00.000Z",
    });
  });
});

describe("Plus rappels active state", () => {
  it("requires granted permission and a synchronized device, not prefs alone", () => {
    expect(
      rappelsViewState({ permission: "granted", prefsEnabled: true, hasEnabledDevice: false }),
    ).toBe("registration_missing");
    expect(
      rappelsViewState({ permission: "granted", prefsEnabled: true, hasEnabledDevice: true }),
    ).toBe("activated");
    expect(
      rappelsViewState({ permission: "default", prefsEnabled: true, hasEnabledDevice: true }),
    ).toBe("disabled");
  });
});

describe("notification test error mapping", () => {
  it("keeps the generic connection message only for real network failures", () => {
    expect(mapNotificationTestError({ code: "no_device", message: "x" })).toBe(
      "Aucun appareil n'a encore activé les rappels.",
    );
    expect(mapNotificationTestError({ code: "not_registered", message: "x" })).toBe(
      "Les rappels sont autorisés, mais cet appareil n'est pas encore enregistré.",
    );
    expect(mapNotificationTestError({ code: "fcm_failed", message: "x" })).toBe(
      "La notification n'a pas pu être envoyée. Réessayez.",
    );
    expect(mapNotificationTestError({ code: "webpush_failed", message: "x" })).toBe(
      "La notification n'a pas pu être envoyée. Réessayez.",
    );
    expect(mapNotificationTestError({ code: "config_incomplete", message: "x" })).toBe(
      "Les rappels ne sont pas encore complètement configurés.",
    );
    expect(mapNotificationTestError(new Error("Failed to fetch"))).toBe(
      "Connexion indisponible. L'opération n'a pas été enregistrée.",
    );
  });
});

describe("test-only push without APP_BASE_URL", () => {
  it("can build a Home deep link without a production origin", () => {
    expect(diagnosticPushDoesNotRequireAppBaseUrl()).toBe(true);
    expect(buildDeepLinkUrl("", TEST_PUSH_COPY.targetHashRoute)).toBe("#/");
    expect(TEST_PUSH_COPY.title).toBe("Mon Bilan");
    expect(SMOKE_PUSH_COPY.body).toBe("Rappel automatique de test.");
  });
});

describe("temporary smoke cron helper", () => {
  it("keeps the production daily cron unchanged", () => {
    expect(TEMPORARY_SMOKE_CRON.name).toBe("webpush-smoke-test-every-minute");
    expect(TEMPORARY_SMOKE_CRON.schedule).toBe("* * * * *");
    expect(PRODUCTION_REMINDER_CRON.name).toBe("send-push-reminders-daily");
    expect(PRODUCTION_REMINDER_CRON.schedule).toBe("0 18 * * *");
    expect(cronMatchesDouala1900(PRODUCTION_REMINDER_CRON.schedule)).toBe(true);
    expect(TEMPORARY_SMOKE_CRON.name).not.toBe(PRODUCTION_REMINDER_CRON.name);
  });

  it("uses a per-minute smoke key, not a production reminder dedup key", () => {
    const key = buildSmokeDedupKey("2026-09-04", new Date("2026-09-04T18:07:00Z"));
    expect(key).toBe("push_smoke_test:2026-09-04T18:07");
    expect(key).not.toMatch(/^church_|^business_/);
    expect(shouldStopSmokeAfterMaxSends(2)).toBe(false);
    expect(shouldStopSmokeAfterMaxSends(3)).toBe(true);
  });
});

describe("browser CORS headers for the Edge Function", () => {
  it("echoes the page origin so localhost can call the function", () => {
    const headers = buildEdgeCorsHeaders("http://localhost:5173");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("authorization");
  });
});

