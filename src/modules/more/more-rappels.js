import { pageHeaderHtml } from "./more-ui.js";
import { friendlyError } from "../../utils/errors.js";
import { showToast } from "../../utils/toast.js";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  buildTargetPlatform,
  fetchEnabledPushDevice,
  fetchNotificationPreferences,
  mapNotificationTestError,
  sendNotificationTest,
  upsertNotificationPreferences,
  upsertWebPushDevice,
} from "../../services/supabase/notifications.js";
import {
  detectWebPushSupport,
  getLocalPushSubscription,
  inspectConfiguredVapidPublicKey,
  isRappelsWebPushEnabled,
  isWebPushConfigured,
  serializePushSubscription,
  subscribeStandardWebPush,
  waitForActiveServiceWorker,
} from "../../push/web-push.js";
import { ensureServiceWorkerRegistration } from "../../pwa.js";
import { rappelsViewState } from "../../../supabase/functions/_shared/fcm-auth.js";
import { isCompletePushSubscription } from "../../../supabase/functions/_shared/web-push.js";

let current = { ...DEFAULT_NOTIFICATION_SETTINGS };
let viewState = "disabled";
let hasEnabledDevice = false;
let rootRef = null;

function currentPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function syncViewState() {
  viewState = rappelsViewState({
    permission: currentPermission(),
    prefsEnabled: Boolean(current.enabled),
    hasEnabledDevice,
  });
}

function renderView() {
  if (!rootRef) return;
  syncViewState();

  if (viewState === "permission_denied") {
    rootRef.innerHTML = `
      <section class="page more-page more-rappels" aria-labelledby="rappels-title">
        ${pageHeaderHtml({
          kicker: "Plus",
          title: "Rappels",
          subtitle: "Notifications importantes",
          backHref: "/plus",
          backLabel: "Retour à Plus",
          titleId: "rappels-title",
        })}
        <article class="card">
          <h2 class="section-title" style="margin-top:0">Permission refusée</h2>
          <p class="card-meta">
            Les notifications sont bloquées dans le navigateur. Autorisez-les dans les paramètres du site, puis revenez ici.
          </p>
        </article>
      </section>
    `;
    return;
  }

  if (viewState === "registration_missing") {
    rootRef.innerHTML = `
      <section class="page more-page more-rappels" aria-labelledby="rappels-title">
        ${pageHeaderHtml({
          kicker: "Plus",
          title: "Rappels",
          subtitle: "Notifications importantes",
          backHref: "/plus",
          backLabel: "Retour à Plus",
          titleId: "rappels-title",
        })}
        <article class="card">
          <h2 class="section-title" style="margin-top:0">Appareil non enregistré</h2>
          <p class="card-meta">
            Les rappels sont autorisés, mais cet appareil n'est pas encore enregistré.
          </p>
          <button type="button" class="btn btn-primary btn-block rappels-action" data-action="activate">
            Réessayer l'enregistrement
          </button>
        </article>
      </section>
    `;
    rootRef.querySelector('[data-action="activate"]')?.addEventListener("click", onActivateClick);
    return;
  }

  if (viewState !== "activated") {
    rootRef.innerHTML = `
      <section class="page more-page more-rappels" aria-labelledby="rappels-title">
        ${pageHeaderHtml({
          kicker: "Plus",
          title: "Rappels",
          subtitle: "Notifications importantes",
          backHref: "/plus",
          backLabel: "Retour à Plus",
          titleId: "rappels-title",
        })}
        <article class="card">
          <h2 class="section-title" style="margin-top:0">🔔 Rappels désactivés</h2>
          <p class="card-meta">
            Activez les rappels pour recevoir les notifications importantes même lorsque l'application n'est pas ouverte.
          </p>
          <button type="button" class="btn btn-primary btn-block rappels-action" data-action="activate">
            Activer les rappels
          </button>
        </article>
        <p class="field-hint">
          Vous pourrez ensuite choisir ce que vous voulez recevoir.
        </p>
      </section>
    `;
    rootRef.querySelector('[data-action="activate"]')?.addEventListener("click", onActivateClick);
    return;
  }

  const webPushOk = isWebPushConfigured();
  rootRef.innerHTML = `
    <section class="page more-page more-rappels" aria-labelledby="rappels-title">
        ${pageHeaderHtml({
          kicker: "Plus",
          title: "Rappels",
        subtitle: "Vos préférences",
        backHref: "/plus",
        backLabel: "Retour à Plus",
        titleId: "rappels-title",
      })}
      <article class="card">
        <h2 class="section-title" style="margin-top:0">✓ Rappels activés</h2>
        <p class="card-meta">Choisissez les rappels à recevoir.</p>
        <h3 class="section-title rappels-group-title">Église</h3>
        <div class="stack-sm rappels-checks">
          <label class="field-check">
            <input type="checkbox" name="church_sunday_income_enabled" ${current.church_sunday_income_enabled ? "checked" : ""} />
            Entrées du dimanche
          </label>
          <label class="field-check">
            <input type="checkbox" name="church_withdrawal_check_enabled" ${current.church_withdrawal_check_enabled ? "checked" : ""} />
            Sorties / retraits
          </label>
        </div>
        <h3 class="section-title rappels-group-title">Commerce</h3>
        <div class="stack-sm rappels-checks">
          <label class="field-check">
            <input type="checkbox" name="business_daily_enabled" ${current.business_daily_enabled ? "checked" : ""} />
            Rappel du soir
          </label>
        </div>
        <div class="rappels-test-wrap">
          <button type="button" class="btn btn-secondary btn-block" data-action="test" ${webPushOk ? "" : "disabled"}>
            Envoyer une notification test
          </button>
          ${!webPushOk ? `<p class="field-hint">Le test n’est pas disponible pour le moment.</p>` : ""}
        </div>
      </article>
    </section>
  `;

  rootRef.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.addEventListener("change", onToggleChanged);
  });
  rootRef.querySelector('[data-action="test"]')?.addEventListener("click", onTestClick);
}

async function persistWebPushSubscription(subscription) {
  return upsertWebPushDevice({
    platform: buildTargetPlatform(),
    subscription,
    enabled: true,
  });
}

async function resolveLocalWebPushEnabled() {
  if (currentPermission() !== "granted") return false;
  if (!detectWebPushSupport().supported) return false;

  let registration = null;
  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch {
    registration = null;
  }
  const localSub = await getLocalPushSubscription(registration);
  const serialized = serializePushSubscription(localSub);
  if (!isCompletePushSubscription(serialized)) return false;

  const remote = await fetchEnabledPushDevice({
    endpoint: serialized.endpoint,
    provider: "webpush",
  });
  return isRappelsWebPushEnabled({
    permission: currentPermission(),
    localSubscription: serialized,
    remoteDevice: remote,
  });
}

async function onActivateClick() {
  try {
    const support = detectWebPushSupport();
    if (!support.supported) {
      showToast("Rappels indisponibles sur cet appareil.");
      return;
    }
    if (!isWebPushConfigured()) {
      showToast("Rappels indisponibles : configuration de notifications manquante.");
      return;
    }

    showToast("Activation…", { timeout: 2500 });
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Permission refusée. Les rappels restent désactivés.");
      renderView();
      return;
    }

    const registration = await waitForActiveServiceWorker(await ensureServiceWorkerRegistration());
    await navigator.serviceWorker.ready;
    const { subscription, diagnostics } = await subscribeStandardWebPush({
      serviceWorkerRegistration: registration,
    });
    if (!isCompletePushSubscription(serializePushSubscription(subscription))) {
      console.info("[rappels-register]", {
        ...diagnostics,
        vapidPublicPresent: inspectConfiguredVapidPublicKey().present,
        vapidPublicByteLength: inspectConfiguredVapidPublicKey().byteLength,
        upsertStatus: null,
      });
      throw new Error("Impossible d'obtenir un code de notification pour cet appareil.");
    }

    try {
      const persisted = await persistWebPushSubscription(subscription);
      console.info("[rappels-register]", {
        ...diagnostics,
        upsertStatus: persisted?._upsertStatus ?? 201,
      });
    } catch (upsertErr) {
      console.info("[rappels-register]", {
        ...diagnostics,
        upsertStatus: upsertErr?.httpStatus ?? "error",
        subscribe: diagnostics?.subscribe || "success",
      });
      throw upsertErr;
    }
    current = await upsertNotificationPreferences({ ...current, enabled: true });
    hasEnabledDevice = true;
    showToast("✓ Rappels activés");
    renderView();
  } catch (err) {
    if (err?.diagnostics) {
      console.info("[rappels-register]", err.diagnostics);
    }
    showToast(friendlyError(err));
    renderView();
  }
}

async function onToggleChanged(event) {
  const { name, checked } = event.target;
  const next = {
    ...current,
    [name]: Boolean(checked),
    enabled: true,
  };
  try {
    current = await upsertNotificationPreferences(next);
    showToast("Préférences enregistrées.");
  } catch (err) {
    showToast(friendlyError(err));
  }
  renderView();
}

async function onTestClick() {
  try {
    showToast("Envoi du test…", { timeout: 2500 });
    const result = await sendNotificationTest();
    if (result?.code === "no_device") {
      showToast("Aucun appareil n'a encore activé les rappels.");
      return;
    }
    if (!result?.ok || Number(result?.sent) === 0) {
      showToast("La notification n'a pas pu être envoyée. Réessayez.");
      return;
    }
    showToast("Test envoyé. Vérifiez votre écran.");
  } catch (err) {
    showToast(mapNotificationTestError(err));
  }
}

export function renderMoreRappels(root) {
  rootRef = root;
  rootRef.setAttribute("data-module", "more-rappels");
  hasEnabledDevice = false;

  rootRef.innerHTML = `
    <section class="page more-page more-rappels" aria-labelledby="rappels-title">
        ${pageHeaderHtml({
          kicker: "Plus",
          title: "Rappels",
        subtitle: "Chargement…",
        backHref: "/plus",
        backLabel: "Retour à Plus",
        titleId: "rappels-title",
      })}
      <div class="card">Chargement des paramètres…</div>
    </section>
  `;

  Promise.all([fetchNotificationPreferences(), resolveLocalWebPushEnabled()])
    .then(([prefs, synced]) => {
      current = prefs;
      hasEnabledDevice = Boolean(synced);
    })
    .catch((err) => {
      showToast(friendlyError(err));
      current = { ...DEFAULT_NOTIFICATION_SETTINGS };
      hasEnabledDevice = false;
    })
    .finally(() => {
      syncViewState();
      renderView();
    });
}
