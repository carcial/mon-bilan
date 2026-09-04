import { amountHtml } from "../../components/amount.js";
import { bindCustomerCombobox, customerComboboxHtml } from "../../components/customer-combobox.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { getHashQuery, navigate } from "../../router.js";
import {
  createCustomerPayment,
  getCustomerBalances,
} from "../../services/supabase/business.js";
import { applyCustomerPayment, formatDueExpectation, validateMoneyPayment } from "../../utils/business-calc.js";
import { displayDateFr, todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  bindMethodCards,
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  errorStateHtml,
  METHOD_LABELS,
  methodCardsHtml,
  moneyInputHtml,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
} from "./business-ui.js";
import { businessCustomerPath } from "./business-routes.js";

export function renderCustomerPaymentForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Enregistrer un paiement",
        backHref: BUSINESS_LINKS.receivables,
        backLabel: "Retour aux paiements",
      })}
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;
  loadPaymentForm(root.querySelector('[data-role="body"]'), ctx);
}

async function loadPaymentForm(body, ctx) {
  try {
    const balances = await getCustomerBalances();
    const debtors = balances.filter((row) => row.outstanding > 0);
    const requestedId = getHashQuery().get("customer") || "";
    const requested = balances.find((row) => row.customer.id === requestedId);
    body.innerHTML = paymentFormHtml({ debtors, requested });
    bindPaymentPage(body, { debtors, requested, balances, onChanged: ctx.onChanged });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadPaymentForm(body, ctx);
    });
  }
}

function paymentFormHtml({ debtors, requested }) {
  const selected = requested?.outstanding > 0 ? requested : null;
  const noDebt = requested && requested.outstanding <= 0;
  return `
    <form class="church-form sale-form stack" data-role="pay-form" novalidate>
      <section class="form-section">
        ${
          noDebt
            ? `<p class="field-hint">Aucune somme à recevoir pour ce client.</p>`
            : customerComboboxHtml({
                id: "pay-customer-query",
                customers: debtors.map((row) => ({
                  ...row.customer,
                  outstanding: row.outstanding,
                  dueSale: row.dueSale,
                })),
                selectedId: selected?.customer.id || "",
                hideLabel: false,
                allowCreate: false,
                placeholder: "Rechercher un client qui doit de l'argent",
              })
        }
      </section>
      <section class="form-section${selected ? "" : " is-hidden"}" data-role="pay-details">
        <div data-role="customer-summary">${selected ? customerSummaryHtml(selected) : ""}</div>
        ${moneyInputHtml("pay-amount", "amount", "Montant reçu")}
        <button type="button" class="btn btn-secondary btn-block" data-action="pay-all">Tout rembourser</button>
        ${methodCardsHtml("cash")}
        ${dateFieldHtml({ id: "pay-date", name: "date", label: "Date", value: todayIso() })}
        <div class="field">
          <label class="field-label" for="pay-note">Note <span class="field-optional">(facultatif)</span></label>
          <input id="pay-note" name="note" class="field-input" placeholder="Ex. Reçu ce soir" />
        </div>
        <div class="card form-summary" data-role="pay-preview"></div>
        <p class="form-alert" data-role="form-error" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </section>
    </form>
  `;
}

function customerSummaryHtml(row) {
  const due = formatDueExpectation(row.dueSale);
  const dueText =
    due.kind === "exact" && due.date
      ? displayDateFr(due.date)
      : due.kind === "approximate"
        ? due.text
        : "Indéterminée";
  return `
    <h3 class="tx-fund">${escapeHtml(row.customer.name)}</h3>
    <p class="home-metric-label">Dette actuelle</p>
    <div>${amountHtml(row.outstanding, { className: "amount-sm" })}</div>
    <p class="field-hint">Prochaine échéance : ${escapeHtml(dueText)}</p>
  `;
}

function bindPaymentPage(body, { debtors, requested, onChanged }) {
  const form = body.querySelector('[data-role="pay-form"]');
  if (!form) return;
  const details = form.querySelector('[data-role="pay-details"]');
  const customers = debtors.map((row) => ({
    ...row.customer,
    outstanding: row.outstanding,
    dueSale: row.dueSale,
  }));
  let current = requested?.outstanding > 0 ? requested : null;

  const showDetails = (row) => {
    current = row;
    const summary = form.querySelector('[data-role="customer-summary"]');
    if (summary) summary.innerHTML = row ? customerSummaryHtml(row) : "";
    details?.classList.toggle("is-hidden", !row);
    updatePreview();
  };

  bindCustomerCombobox(form, customers, {
    allowCreate: false,
    metaFn: (row) => `Reste : ${formatFcfa(row.outstanding || 0)}`,
    onSelect: (customer) => {
      if (!customer) {
        showDetails(null);
        return;
      }
      const row = debtors.find((item) => item.customer.id === customer.id);
      showDetails(row || null);
    },
  });
  form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
  bindMethodCards(form);
  bindDateFields(form);

  form.querySelector('[data-action="pay-all"]')?.addEventListener("click", () => {
    if (!current) return;
    const amountEl = form.elements.namedItem("amount");
    if (amountEl instanceof HTMLInputElement) {
      amountEl.dataset.amount = String(current.outstanding);
      amountEl.value = formatFcfa(current.outstanding, { showCurrency: false });
      amountEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  const updatePreview = () => {
    const preview = form.querySelector('[data-role="pay-preview"]');
    if (!preview || !current) return;
    const amountEl = form.elements.namedItem("amount");
    const amount = Number(amountEl instanceof HTMLInputElement ? amountEl.dataset.amount || 0 : 0);
    if (!amount) {
      preview.innerHTML = `<p>Dette actuelle : <strong>${escapeHtml(formatFcfa(current.outstanding))}</strong></p>`;
      return;
    }
    if (amount > current.outstanding) {
      preview.innerHTML = `<p class="field-error">Le montant dépasse la somme due.</p>`;
      return;
    }
    const next = applyCustomerPayment(current.outstanding, amount);
    preview.innerHTML = `
      <p>Dette actuelle : <strong>${escapeHtml(formatFcfa(current.outstanding))}</strong></p>
      <p>Paiement : ${escapeHtml(formatFcfa(amount))}</p>
      <p>Nouveau reste : <strong>${escapeHtml(formatFcfa(next.remaining))}</strong></p>
    `;
  };

  form.addEventListener("input", updatePreview);
  updatePreview();

  const guard = createSubmitGuard();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(async () => {
      clearFieldErrors(form);
      if (!current) {
        setFieldError(form, "customerId", "Choisissez un client qui doit de l'argent.");
        return;
      }
      if (current.outstanding <= 0) {
        setFieldError(form, "amount", "Aucune somme à recevoir pour ce client.");
        return;
      }
      const amountEl = form.elements.namedItem("amount");
      const values = {
        amount: amountEl instanceof HTMLInputElement ? amountEl.dataset.amount || amountEl.value : "",
        date: form.elements.namedItem("date")?.value,
        note: form.elements.namedItem("note")?.value,
        paymentMethod: form.elements.namedItem("paymentMethod")?.value,
        outstanding: current.outstanding,
      };
      const validated = validateMoneyPayment(values);
      if (!validated.ok) {
        Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
        return;
      }
      const next = applyCustomerPayment(current.outstanding, validated.amount);
      const result = await confirmAndWrite(
        {
          title: "CONFIRMER LE PAIEMENT",
          amountHtml: amountHtml(validated.amount),
          confirmLabel: "Confirmer et enregistrer",
          cancelLabel: "Modifier",
          rows: [
            { label: "Client", value: current.customer.name },
            { label: "Montant reçu", value: formatFcfa(validated.amount) },
            { label: "Mode", value: METHOD_LABELS[values.paymentMethod] || values.paymentMethod },
            { label: "Date", value: displayDateFr(values.date) },
            { label: "Dette avant", value: formatFcfa(current.outstanding) },
            { label: "Reste après paiement", value: formatFcfa(next.remaining) },
          ],
        },
        () =>
          createCustomerPayment({
            customerId: current.customer.id,
            amount: validated.amount,
            date: values.date,
            note: values.note,
            paymentMethod: values.paymentMethod,
          }),
      );
      if (result.status === "confirm") {
        onChanged?.();
        if (next.remaining <= 0) {
          navigate(`${BUSINESS_LINKS.receivables}`);
        } else {
          navigate(`${businessCustomerPath(current.customer.id)}`);
        }
      }
    });
  });
}

export function paymentPagePath(customerId) {
  return customerId
    ? `${BUSINESS_LINKS.paymentNew}?customer=${customerId}`
    : BUSINESS_LINKS.paymentNew;
}
