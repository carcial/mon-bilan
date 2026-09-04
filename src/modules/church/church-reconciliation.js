import { amountHtml } from "../../components/amount.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { ROUTES } from "../../router.js";
import {
  createReconciliation,
  getChurchBalances,
  getChurchFundBalance,
  getChurchFunds,
  getCombinedChurchBalance,
  getReconciliations,
} from "../../services/supabase/church.js";
import { formatFcfa, toFcfaInteger } from "../../utils/money.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { displayDateFr, formatNumericDateFr, todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  calculateReconciliationDifference,
  classifyReconciliation,
} from "../../utils/church-calc.js";
import {
  bindMoneyInput,
  CHURCH_LINKS,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
} from "./church-ui.js";

const ALL_FUNDS = "__all__";

/**
 * @param {HTMLElement} root
 * @param {{ onChanged?: () => void }} [ctx]
 */
export function renderChurchReconciliation(root, ctx = {}) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title: "Vérifier la caisse",
        subtitle: "Comparer l'argent enregistré avec l'argent réellement présent.",
        backHref: ROUTES.church,
        backLabel: "Retour à Église",
      })}
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;

  loadReconciliation(root.querySelector('[data-role="body"]'), ctx);
}

async function loadReconciliation(body, ctx) {
  if (!body) return;
  try {
    const [funds, balances] = await Promise.all([
      getChurchFunds(),
      getChurchBalances(),
    ]);
    body.innerHTML = reconciliationHtml({ funds, balances });
    bindReconciliation(body, { funds, balances, ...ctx });
    await renderHistory(body.querySelector('[data-role="history"]'), ALL_FUNDS);
  } catch (err) {
    console.warn("[church] reconciliation load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadReconciliation(body, ctx);
    });
  }
}

function reconciliationHtml({ funds, balances }) {
  return `
    <article class="card">
      <p class="home-metric-label">Solde théorique actuel</p>
      <div>${amountHtml(balances.total, { className: "amount-sm" })}</div>
      <p class="field-hint">Toutes les caisses actives, aujourd'hui.</p>
    </article>

    <form class="church-form stack" data-role="form" novalidate>
      ${
        funds.length > 1
          ? choiceFieldHtml({
              id: "recon-fund",
              name: "fundId",
              label: "Caisse",
              options: [{ id: ALL_FUNDS, name: "Toutes les caisses" }, ...funds],
              selectedId: ALL_FUNDS,
              labelFn: (row) => row.name || fundName(row),
            })
          : `<input type="hidden" name="fundId" value="${funds[0]?.id || ALL_FUNDS}" />
             ${funds[0] ? `<div class="field"><p class="field-label">Caisse</p><p class="readonly-value">${escapeHtml(fundName(funds[0]))}</p></div>` : ""}`
      }

      ${dateFieldHtml({ id: "recon-date", name: "date", label: "Date de la vérification", value: todayIso() })}

      <div class="field">
        <label class="field-label" for="recon-actual">Argent compté</label>
        <input
          id="recon-actual"
          name="actual"
          class="field-input field-input-amount"
          inputmode="numeric"
          autocomplete="off"
          placeholder="ex. 1 250 000"
          required
        />
        <p class="field-hint">Montant entier en FCFA réellement présent dans la caisse.</p>
        <p class="field-error" data-error="actual" hidden></p>
      </div>

      <div class="field">
        <label class="field-label" for="recon-note">Note <span class="field-optional">(facultatif)</span></label>
        <textarea id="recon-note" name="note" class="field-input field-textarea" rows="3" maxlength="500"></textarea>
      </div>

      <div class="card recon-preview" data-role="preview" hidden></div>
      <p class="form-alert" data-role="form-error" hidden></p>

      <button type="submit" class="btn btn-primary btn-block" data-role="submit">
        Vérifier
      </button>
    </form>

    <section class="recon-history-block">
      <h2 class="section-title">Vérifications précédentes</h2>
      <div data-role="history">${skeletonHtml(2)}</div>
    </section>
  `;
}

function bindReconciliation(body, ctx) {
  const form = body.querySelector('[data-role="form"]');
  const actualInput = form?.querySelector("#recon-actual");
  if (!form || !(actualInput instanceof HTMLInputElement)) return;

  bindMoneyInput(actualInput);
  bindChoiceFields(form);
  bindDateFields(form);
  const guard = createSubmitGuard();
  const preview = body.querySelector('[data-role="preview"]');

  const refreshPreview = async () => {
    const actual = toFcfaInteger(actualInput.dataset.amount || actualInput.value);
    const date = String(form.elements.namedItem("date")?.value || todayIso());
    const fundValue = String(form.elements.namedItem("fundId")?.value || ALL_FUNDS);
    if (actual < 0 || !date) return;
    try {
      const theoretical = await theoreticalFor(fundValue, date);
      const difference = calculateReconciliationDifference({
        theoreticalBalance: theoretical,
        actualBalance: actual,
      });
      if (preview) {
        preview.hidden = false;
        preview.innerHTML = resultHtml({ theoretical, actual, difference });
      }
    } catch (err) {
      console.warn("[church] preview failed", err);
    }
  };

  actualInput.addEventListener("input", () => {
    window.clearTimeout(refreshPreview._t);
    refreshPreview._t = window.setTimeout(refreshPreview, 280);
  });
  form.elements.namedItem("fundId")?.addEventListener("change", () => {
    refreshPreview();
    renderHistory(body.querySelector('[data-role="history"]'), form.elements.namedItem("fundId")?.value);
  });
  form.elements.namedItem("date")?.addEventListener("change", refreshPreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(async () => {
      await handleReconSubmit(form, ctx, body);
    });
  });
}

async function theoreticalFor(fundValue, date) {
  if (fundValue === ALL_FUNDS) {
    return getCombinedChurchBalance(date);
  }
  return getChurchFundBalance(fundValue, date);
}

async function handleReconSubmit(form, ctx, body) {
  const formError = form.querySelector('[data-role="form-error"]');
  if (formError) {
    formError.hidden = true;
    formError.textContent = "";
  }
  setFieldError(form, "actual", "");
  setFieldError(form, "date", "");

  const actualInput = form.elements.namedItem("actual");
  const actual = toFcfaInteger(
    actualInput instanceof HTMLInputElement
      ? actualInput.dataset.amount || actualInput.value
      : "",
  );
  const date = String(form.elements.namedItem("date")?.value || "");
  const fundValue = String(form.elements.namedItem("fundId")?.value || ALL_FUNDS);
  const note = String(form.elements.namedItem("note")?.value || "").trim();

  if (!date) {
    setFieldError(form, "date", "Indiquez une date.");
    return;
  }
  if (!(actualInput instanceof HTMLInputElement) || !String(actualInput.value).trim()) {
    setFieldError(form, "actual", "Indiquez l'argent compté.");
    return;
  }
  if (actual < 0) {
    setFieldError(form, "actual", "Le montant compté ne peut pas être négatif.");
    return;
  }

  const submitBtn = form.querySelector('[data-role="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const theoretical = await theoreticalFor(fundValue, date);
    const difference = calculateReconciliationDifference({
      theoreticalBalance: theoretical,
      actualBalance: actual,
    });
    const classified = classifyReconciliation(difference);
    const fund =
      fundValue === ALL_FUNDS
        ? { name: "Toutes les caisses" }
        : ctx.funds.find((f) => f.id === fundValue);

    const reconciledAt = localNoonIso(date);

    const result = await confirmAndWrite(
      {
        title: "Confirmer la vérification",
        amountHtml: amountHtml(actual),
        extraHtml: resultHtml({ theoretical, actual, difference }),
        rows: [
          { label: "Caisse", value: fundName(fund) },
          { label: "Date", value: displayDateFr(date) },
          { label: "Théorique", value: formatFcfa(theoretical) },
          { label: "Écart", value: formatFcfa(difference) },
          ...(note ? [{ label: "Note", value: note }] : []),
        ],
        confirmLabel: "Confirmer",
        cancelLabel: "Modifier",
        cancelLabel: "Modifier",
      },
      async () =>
        createReconciliation({
          fundId: fundValue === ALL_FUNDS ? null : fundValue,
          theoreticalBalance: theoretical,
          actualCash: actual,
          difference,
          note: note || null,
          reconciledAt,
        }),
    );

    if (result.status === "confirm" && result.data) {
      ctx.onChanged?.();
      const preview = form.querySelector('[data-role="preview"]');
      if (preview) {
        preview.hidden = false;
        preview.innerHTML = resultHtml({
          theoretical,
          actual,
          difference,
          saved: true,
          status: classified.status,
        });
      }
      await renderHistory(
        body.querySelector('[data-role="history"]'),
        fundValue,
      );
    }
  } catch (err) {
    if (formError) {
      formError.hidden = false;
      formError.textContent = friendlyError(err);
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resultHtml({ theoretical, actual, difference, saved = false }) {
  const classified = classifyReconciliation(difference);
  let banner = "";
  if (classified.status === "balanced") {
    banner = `
      <p class="recon-banner recon-banner-ok">
        ✓ Caisse correcte
      </p>
      <p>0 FCFA d'écart</p>
    `;
  } else if (classified.status === "shortage") {
    banner = `
      <p class="recon-banner recon-banner-warn">
        ⚠ Argent manquant
      </p>
      <p>${escapeHtml(formatFcfa(classified.absoluteDifference))}</p>
    `;
  } else {
    banner = `
      <p class="recon-banner recon-banner-info">
        ↑ Argent en plus
      </p>
      <p>${escapeHtml(formatFcfa(classified.absoluteDifference))}</p>
    `;
  }

  return `
    ${saved ? `<p class="success-inline">Vérification enregistrée</p>` : ""}
    ${banner}
    <p class="field-hint">Théorique : ${escapeHtml(formatFcfa(theoretical))} · Compté : ${escapeHtml(formatFcfa(actual))}</p>
  `;
}

async function renderHistory(container, fundValue) {
  if (!container) return;
  container.innerHTML = skeletonHtml(2);
  try {
    const fundId = fundValue === ALL_FUNDS ? undefined : fundValue || undefined;
    const rows = await getReconciliations({
      fundId: fundValue === ALL_FUNDS ? undefined : fundId,
      limit: 20,
    });

    if (!rows.length) {
      container.innerHTML = emptyStateHtml({
        title: "Aucune vérification enregistrée.",
        body: "Le premier contrôle de caisse apparaîtra ici.",
        actionHref: CHURCH_LINKS.reconciliation,
        actionLabel: "Vérifier la caisse",
      });
      return;
    }

    container.innerHTML = rows
      .map((row, index) => {
        const previous = rows[index + 1];
        return reconCardHtml(row, previous);
      })
      .join("");
  } catch (err) {
    console.warn("[church] recon history failed", err);
    container.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function reconCardHtml(row, previous) {
  const classified = classifyReconciliation(row.difference_fcfa);
  const fundLabel = row.fund_id ? fundName(row.church_funds) : "Toutes les caisses";
  let previousNote = "";
  if (previous) {
    previousNote = `<p class="field-hint">Vérification précédente : ${escapeHtml(formatNumericDateFr(previous.reconciled_at))} · écart ${escapeHtml(formatFcfa(previous.difference_fcfa))}. L'écart actuel a pu apparaître après cette date — sans cause précise connue.</p>`;
  }

  return `
    <article class="card recon-card">
      <p class="tx-date">${escapeHtml(formatNumericDateFr(row.reconciled_at))}</p>
      <p class="tx-fund">${escapeHtml(fundLabel)}</p>
      <p>Théorique : ${escapeHtml(formatFcfa(row.theoretical_balance_fcfa))}</p>
      <p>Compté : ${escapeHtml(formatFcfa(row.actual_cash_fcfa))}</p>
      <p>Écart : <strong>${escapeHtml(formatFcfa(row.difference_fcfa))}</strong></p>
      <p class="recon-status">${statusLabel(classified.status)}</p>
      ${row.note ? `<p class="tx-reason">${escapeHtml(row.note)}</p>` : ""}
      ${previousNote}
    </article>
  `;
}

function statusLabel(status) {
  if (status === "balanced") return "✓ Caisse correcte";
  if (status === "shortage") return "⚠ Argent manquant";
  return "↑ Argent en plus";
}

function localNoonIso(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
