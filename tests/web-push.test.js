import { describe, expect, it } from "vitest";
import {
  PUSH_PROVIDERS,
  buildNotificationShowOptions,
  buildWebPushDeviceUpsertPayload,
  buildWebPushMessagePayload,
  detectWebPushSupport,
  endpointsToDisableFromResults,
  isCompletePushSubscription,
  isRappelsWebPushEnabled,
  isStalePushStatus,
  isWebPushPublicKeyConfigured,
  missingWebPushServerEnvNames,
  normalizeWebPushSubject,
  parsePushEventPayload,
  pathFromPushClickUrl,
  resolveNotificationClickAction,
  resolveNotificationClickUrl,
  selectDevicesForSend,
  serializePushSubscription,
  uint8ArrayToUrlBase64,
  urlBase64ToUint8Array,
  vapidKeysToJwk,
  vapidPublicKeyToApplicationServerKey,
} from "../supabase/functions/_shared/web-push.js";
import { TEST_PUSH_COPY, isDiagnosticPushType, rappelsViewState } from "../supabase/functions/_shared/fcm-auth.js";
import { reminderTargetHashRoute, REMINDER_TYPES } from "../supabase/functions/_shared/reminders.js";

const SAMPLE_UNCOMPRESSED = (() => {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04;
  for (let i = 1; i < 65; i++) bytes[i] = i;
  return uint8ArrayToUrlBase64(bytes);
})();

const SAMPLE_PRIVATE = uint8ArrayToUrlBase64(new Uint8Array(32).map((_, i) => i + 1));

describe("VAPID key conversion", () => {
  it("converts a URL-safe public key into an uncompressed P-256 applicationServerKey", () => {
    const bytes = vapidPublicKeyToApplicationServerKey(SAMPLE_UNCOMPRESSED);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
    expect(uint8ArrayToUrlBase64(bytes)).toBe(SAMPLE_UNCOMPRESSED);
  });

  it("round-trips url-safe base64 without using Node Buffer in the helper", () => {
    const again = urlBase64ToUint8Array(SAMPLE_UNCOMPRESSED);
    expect(uint8ArrayToUrlBase64(again)).toBe(SAMPLE_UNCOMPRESSED);
  });

  it("builds a JWK pair from standard VAPID keys", () => {
    const jwk = vapidKeysToJwk(SAMPLE_UNCOMPRESSED, SAMPLE_PRIVATE);
    expect(jwk.publicKey.kty).toBe("EC");
    expect(jwk.publicKey.crv).toBe("P-256");
    expect(jwk.privateKey.d).toBeTruthy();
    expect(jwk.privateKey.x).toBe(jwk.publicKey.x);
    expect(jwk.privateKey.y).toBe(jwk.publicKey.y);
  });

  it("rejects a non-uncompressed public key", () => {
    const bad = uint8ArrayToUrlBase64(new Uint8Array([0x03, 1, 2, 3]));
    expect(() => vapidPublicKeyToApplicationServerKey(bad)).toThrow(/uncompressed/i);
  });
});

describe("PushSubscription serialization", () => {
  it("serializes the full browser subscription (endpoint + p256dh + auth)", () => {
    const serialized = serializePushSubscription({
      endpoint: "https://web.push.apple.com/abc",
      keys: { p256dh: "p256", auth: "auth-secret" },
      toJSON() {
        return { endpoint: this.endpoint, keys: this.keys };
      },
    });
    expect(serialized).toEqual({
      endpoint: "https://web.push.apple.com/abc",
      p256dh: "p256",
      auth: "auth-secret",
    });
    expect(isCompletePushSubscription(serialized)).toBe(true);
    expect(isCompletePushSubscription({ endpoint: "x", p256dh: "", auth: "y" })).toBe(false);
  });
});

describe("subscription upsert", () => {
  it("builds a webpush upsert keyed by endpoint, not FID", () => {
    const payload = buildWebPushDeviceUpsertPayload({
      platform: "web",
      endpoint: "https://fcm.googleapis.com/fcm/send/sub-1",
      p256dh: "p256",
      auth: "auth",
      enabled: true,
      lastSeenAtIso: "2026-09-04T10:00:00.000Z",
    });
    expect(payload.provider).toBe(PUSH_PROVIDERS.webpush);
    expect(payload.endpoint).toContain("fcm/send/sub-1");
    expect(payload.p256dh).toBe("p256");
    expect(payload.auth).toBe("auth");
    expect(payload.fcm_token).toBeUndefined();
  });

  it("rejects an incomplete subscription", () => {
    expect(() =>
      buildWebPushDeviceUpsertPayload({ endpoint: "https://x", p256dh: "", auth: "a" }),
    ).toThrow(/incomplète/i);
  });
});

describe("provider selection", () => {
  it("prefers webpush and skips firebase to avoid duplicate notifications", () => {
    const plan = selectDevicesForSend([
      {
        enabled: true,
        provider: "webpush",
        endpoint: "https://web.push.apple.com/a",
        p256dh: "p",
        auth: "a",
      },
      { enabled: true, provider: "firebase", fcm_token: "fid-1" },
    ]);
    expect(plan.preferredProvider).toBe("webpush");
    expect(plan.devices).toHaveLength(1);
    expect(plan.devices[0].endpoint).toContain("web.push.apple.com");
    expect(plan.skippedFirebase).toBe(true);
  });

  it("falls back to firebase only when no webpush subscription exists", () => {
    const plan = selectDevicesForSend([{ enabled: true, provider: "firebase", fcm_token: "fid-1" }]);
    expect(plan.preferredProvider).toBe("firebase");
    expect(plan.devices).toHaveLength(1);
    expect(plan.skippedFirebase).toBe(false);
  });
});

describe("service worker push payload", () => {
  it("always produces a visible notification payload (Safari-safe)", () => {
    const parsed = parsePushEventPayload({
      data: { json: () => ({ title: "Église", body: "Entrées ?", url: "#/eglise/entree", dedup_key: "k1" }) },
    });
    const options = buildNotificationShowOptions(parsed, "https://app.example");
    expect(parsed.title).toBe("Église");
    expect(options.body).toBe("Entrées ?");
    expect(options.icon).toContain("/icons/icon-192.png");
    expect(options.badge).toContain("/icons/icon-192.png");
    expect(options.tag).toBe("k1");
    expect(options.data.url).toBe("#/eglise/entree");
  });

  it("reads FCM-shaped data envelopes without dropping title/body", () => {
    const parsed = parsePushEventPayload({
      data: {
        json: () => ({
          data: { title: "Commerce", body: "Soir", url: "#/commerce/quick-actions" },
        }),
      },
    });
    expect(parsed.title).toBe("Commerce");
    expect(parsed.url).toBe("#/commerce/quick-actions");
  });
});

describe("notification click route", () => {
  it("focuses an existing window and maps church / business / test routes", () => {
    const church = resolveNotificationClickAction({
      url: "#/eglise/entree",
      origin: "https://app.example",
      hasOpenClient: true,
    });
    expect(church.closeNotification).toBe(true);
    expect(church.focusExisting).toBe(true);
    expect(church.openWindow).toBe(false);
    expect(church.path).toBe("/eglise/entree");
    expect(church.path).toBe(reminderTargetHashRoute(REMINDER_TYPES.churchSundayIncome));

    const business = resolveNotificationClickAction({
      url: "https://app.example#/commerce/quick-actions",
      origin: "https://app.example",
      hasOpenClient: false,
    });
    expect(business.openWindow).toBe(true);
    expect(business.path).toBe("/commerce/quick-actions");

    const test = resolveNotificationClickAction({
      url: TEST_PUSH_COPY.targetHashRoute,
      origin: "https://app.example",
      hasOpenClient: false,
    });
    expect(test.path).toBe("/");
    expect(resolveNotificationClickUrl("#/", "https://app.example")).toBe("https://app.example/#/");
    expect(pathFromPushClickUrl("https://app.example/#/")).toBe("/");
  });
});

describe("stale endpoint cleanup", () => {
  it("disables 404 and 410 endpoints and keeps other failures", () => {
    expect(isStalePushStatus(404)).toBe(true);
    expect(isStalePushStatus(410)).toBe(true);
    expect(isStalePushStatus(429)).toBe(false);
    expect(
      endpointsToDisableFromResults([
        { endpoint: "https://dead/1", status: 410 },
        { endpoint: "https://dead/2", stale: true, status: 404 },
        { endpoint: "https://live/3", status: 429 },
      ]),
    ).toEqual(["https://dead/1", "https://dead/2"]);
  });
});

describe("iOS/Android feature detection", () => {
  it("uses Push API / Notification / service worker — not user-agent strings", () => {
    expect(
      detectWebPushSupport({
        Notification: function Notification() {},
        navigator: { serviceWorker: {} },
        window: { PushManager: function PushManager() {} },
      }).supported,
    ).toBe(true);
    expect(detectWebPushSupport({ navigator: {}, window: {} }).supported).toBe(false);
    expect(detectWebPushSupport.toString()).not.toMatch(/iPhone|iOS|Android|Safari|Chrome/i);
  });
});

describe("no duplicate Firebase + Web Push notification", () => {
  it("never returns both providers in the same send plan", () => {
    const mixed = selectDevicesForSend([
      { enabled: true, provider: "webpush", endpoint: "https://e", p256dh: "p", auth: "a" },
      { enabled: true, provider: "firebase", fcm_token: "fid" },
    ]);
    expect(mixed.devices.every((d) => d.provider === "webpush")).toBe(true);
    expect(mixed.devices.some((d) => d.provider === "firebase")).toBe(false);
  });
});

describe("test push behavior", () => {
  it("sends a real test notification without production reminder conditions", () => {
    expect(isDiagnosticPushType("test")).toBe(true);
    expect(TEST_PUSH_COPY.title).toBe("Mon Bilan");
    expect(TEST_PUSH_COPY.targetHashRoute).toBe("/");
    const payload = buildWebPushMessagePayload({
      title: TEST_PUSH_COPY.title,
      body: TEST_PUSH_COPY.body,
      targetUrl: "#/",
      reminderType: TEST_PUSH_COPY.reminderType,
      dedupKeyValue: "test:now",
    });
    expect(payload.provider).toBe("webpush");
    expect(payload.url).toBe("#/");
  });

  it("requires granted permission plus a synced webpush subscription to show enabled", () => {
    expect(
      isRappelsWebPushEnabled({
        permission: "granted",
        localSubscription: { endpoint: "https://e", p256dh: "p", auth: "a" },
        remoteDevice: { present: true, enabled: true, provider: "webpush" },
      }),
    ).toBe(true);
    expect(
      isRappelsWebPushEnabled({
        permission: "granted",
        localSubscription: { endpoint: "https://e", p256dh: "p", auth: "a" },
        remoteDevice: { present: true, enabled: true, provider: "firebase" },
      }),
    ).toBe(false);
    expect(
      rappelsViewState({ permission: "granted", prefsEnabled: true, hasEnabledDevice: false }),
    ).toBe("registration_missing");
  });
});

describe("web push env placement", () => {
  it("never treats a missing or placeholder public key as configured", () => {
    expect(isWebPushPublicKeyConfigured("")).toBe(false);
    expect(isWebPushPublicKeyConfigured("YOUR_VAPID_PUBLIC_KEY")).toBe(false);
    expect(isWebPushPublicKeyConfigured(SAMPLE_UNCOMPRESSED)).toBe(true);
    expect(missingWebPushServerEnvNames({})).toEqual([
      "WEB_PUSH_PUBLIC_KEY",
      "WEB_PUSH_PRIVATE_KEY",
      "WEB_PUSH_SUBJECT",
    ]);
    expect(normalizeWebPushSubject("owner@example.com")).toBe("mailto:owner@example.com");
  });
});
