import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createCustomer,
  createProduct,
  createSupplier,
  createSupplierPayment,
  getCustomerDetail,
  getCustomerBalances,
  getProductInventory,
  getSupplierBalances,
  getSupplierDetail,
} from "../../services/supabase/business.js";
import { applyCustomerPayment, customerCashEvents, CUSTOMER_CASH_SOURCE, formatDueExpectation, saleItemsTotal, validateMoneyPayment } from "../../utils/business-calc.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { displayDateFr, formatNumericDateFr, todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  bindMethodCards,
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  emptyStateHtml,
  errorStateHtml,
  METHOD_LABELS,
  methodCardsHtml,
  moneyInputHtml,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
} from "./business-ui.js";
import {
  businessCustomerPath,
  businessSalePath,
  businessSupplierPath,
  businessBordereauPath,
} from "./business-routes.js";

export function renderCustomerList(root) {
  listPage(root, {
    title: "Clients",
    load: getCustomerBalances,
    empty: "Aucun client pour le moment.",
    createHref: BUSINESS_LINKS.customerNew,
    createLabel: "Nouveau client",
    card: (row) => `
      <a class="list-row" href="#${businessCustomerPath(row.customer.id)}">
        <span class="list-row-body">
          <span class="list-row-title">${escapeHtml(row.customer.name)}</span>
          <span class="list-row-meta">À recevoir</span>
        </span>
        <span class="list-row-amount">${amountHtml(row.outstanding, { className: "amount-sm" })}</span>
      </a>
    `,
  });
}

export function renderSupplierList(root) {
  listPage(root, {
    title: "Fournisseurs",
    load: getSupplierBalances,
    empty: "Aucun fournisseur.",
    createHref: BUSINESS_LINKS.supplierNew,
    createLabel: "Nouveau fournisseur",
    card: (row) => `
      <a class="list-row" href="#${businessSupplierPath(row.supplier.id)}">
        <span class="list-row-body">
          <span class="list-row-title">${escapeHtml(supplierDisplayLabel(row.supplier))}</span>
          <span class="list-row-meta">À payer</span>
        </span>
        <span class="list-row-amount">${amountHtml(row.outstanding, { className: "amount-sm" })}</span>
      </a>
    `,
  });
}

export function renderProductList(root) {
  listPage(root, {
    title: "Produits",
    load: getProductInventory,
    empty: "Aucun produit.",
    createHref: BUSINESS_LINKS.productNew,
    createLabel: "Nouveau produit",
    card: (row) => `
      <article class="list-row">
        <span class="list-row-body">
          <span class="list-row-title">${escapeHtml(row.product_name)}</span>
          <span class="list-row-meta">${escapeHtml(row.unit_type)}</span>
        </span>
        <span class="list-row-amount">${row.quantity_available}</span>
      </article>
    `,
  });
}

function listPage(root, { title, load, empty, createHref, createLabel, card }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref: ROUTES.business, backLabel: "Retour au commerce" })}
      <div class="page-body">
        <a class="btn btn-primary btn-block" href="#${createHref}" data-role="create">${escapeHtml(createLabel)}</a>
        <div data-role="body">${skeletonHtml(3)}</div>
      </div>
    </section>
  `;
  const body = root.querySelector('[data-role="body"]');
  const createBtn = root.querySelector("[data-role=create]");
  load()
    .then((rows) => {
      if (!rows.length) {
        if (createBtn) createBtn.hidden = true;
        body.innerHTML = emptyStateHtml({ title: empty, actionHref: createHref, actionLabel: createLabel });
        return;
      }
      if (createBtn) createBtn.hidden = false;
      body.innerHTML = `<div class="list-card">${rows.map(card).join("")}</div>`;
    })
    .catch((err) => {
      body.innerHTML = errorStateHtml(friendlyError(err));
    });
}

export function renderCustomerNew(root, ctx) {
  simpleCreateForm(root, {
    title: "Nouveau client",
    backHref: BUSINESS_LINKS.customers,
    backLabel: "Retour aux clients",
    fields: `
      <div class="field"><label class="field-label" for="c-name">Nom</label><input id="c-name" name="name" class="field-input" placeholder="Ex. Maman Jeanne" required /><p class="field-error" data-error="name" hidden></p></div>
      <div class="field"><label class="field-label" for="c-phone">Téléphone <span class="field-optional">(facultatif)</span></label><input id="c-phone" name="phone" class="field-input" /></div>
      <div class="field"><label class="field-label" for="c-note">Note <span class="field-optional">(facultatif)</span></label><textarea id="c-note" name="note" class="field-input field-textarea" rows="3"></textarea></div>
    `,
    confirmTitle: "CONFIRMER LE CLIENT",
    write: (values) => createCustomer(values),
    after: (data) => {
      ctx.onChanged?.();
      navigate(businessCustomerPath(data.id));
    },
  });
}

export function renderSupplierNew(root, ctx) {
  simpleCreateForm(root, {
    title: "Nouveau fournisseur",
    backHref: BUSINESS_LINKS.suppliers,
    backLabel: "Retour aux fournisseurs",
    fields: `
      <div class="field"><label class="field-label" for="s-code">Code</label><input id="s-code" name="code" class="field-input" placeholder="Ex. SOA" required /></div>
      <div class="field"><label class="field-label" for="s-name">Nom</label><input id="s-name" name="name" class="field-input" placeholder="Ex. SOA" required /></div>
      <div class="field"><label class="field-label" for="s-phone">Téléphone <span class="field-optional">(facultatif)</span></label><input id="s-phone" name="phone" class="field-input" /></div>
    `,
    confirmTitle: "CONFIRMER LE FOURNISSEUR",
    write: (values) => createSupplier(values),
    after: (data) => {
      ctx.onChanged?.();
      navigate(businessSupplierPath(data.id));
    },
  });
}

export function renderProductNew(root, ctx) {
  simpleCreateForm(root, {
    title: "Nouveau produit",
    backHref: BUSINESS_LINKS.products,
    backLabel: "Retour aux produits",
    fields: `
      <div class="field"><label class="field-label" for="p-name">Nom</label><input id="p-name" name="name" class="field-input" placeholder="Ex. Pommes" required /></div>
      <div class="field"><label class="field-label" for="p-unit">Unité</label><input id="p-unit" name="unitType" class="field-input" value="sac" /></div>
    `,
    confirmTitle: "CONFIRMER LE PRODUIT",
    write: (values) => createProduct(values),
    after: () => {
      ctx.onChanged?.();
      navigate(BUSINESS_LINKS.products);
    },
  });
}

function simpleCreateForm(root, { title, backHref, backLabel, fields, confirmTitle, write, after }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref, backLabel })}
      <form class="church-form stack" data-role="form">
        ${fields}
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </form>
    </section>
  `;
  const form = root.querySelector("form");
  const guard = createSubmitGuard();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(async () => {
      const values = Object.fromEntries(new FormData(form).entries());
      if (values.name && !String(values.name).trim()) return;
      const result = await confirmAndWrite(
        { title: confirmTitle, rows: Object.entries(values).filter(([, v]) => v).map(([k, v]) => ({ label: k, value: String(v) })) },
        () => write(values),
      );
      if (result.status === "confirm" && result.data) after(result.data);
    });
  });
}

export function renderCustomerDetail(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Client", backHref: BUSINESS_LINKS.customers, backLabel: "Retour aux clients" })}
      <div data-role="body" class="page-body">${skeletonHtml(4)}</div>
    </section>
  `;
  loadCustomer(root.querySelector('[data-role="body"]'), ctx);
}

async function loadCustomer(body, ctx) {
  try {
    const detail = await getCustomerDetail(ctx.id);
    if (!detail.customer) {
      body.innerHTML = errorStateHtml("Client introuvable.");
      return;
    }
    const openSales = (detail.remainders || []).filter((row) => row.remaining > 0);
    const cashEvents = detail.cashEvents
      || customerCashEvents({ sales: detail.sales || [], payments: detail.payments || [] });
    body.innerHTML = `
      <article class="card detail-hero-card">
        <h2 class="detail-entity-name">${escapeHtml(detail.customer.name)}</h2>
        ${detail.customer.phone ? `<p class="detail-entity-meta">${escapeHtml(detail.customer.phone)}</p>` : ""}
        ${detail.customer.note ? `<p class="detail-entity-meta">${escapeHtml(detail.customer.note)}</p>` : ""}
        <p class="home-metric-label">${detail.outstanding > 0 ? "Reste à recevoir" : "Dette"}</p>
        <div>${amountHtml(detail.outstanding)}</div>
        ${detail.outstanding <= 0 ? `<p class="recon-banner recon-banner-ok">✓ Dette réglée</p>` : ""}
        <div class="detail-metrics">
          <div>
            <span>Achats</span>
            <strong>${escapeHtml(formatFcfa(detail.purchases))}</strong>
          </div>
          <div>
            <span>Payé</span>
            <strong>${escapeHtml(formatFcfa(detail.paid))}</strong>
          </div>
        </div>
      </article>
      ${
        openSales.length
          ? `<section class="section-block"><h2 class="section-title">Ventes à crédit</h2>
        <div class="list-card">${openSales
          .map((row) => {
            const due = formatDueExpectation(row.sale);
            const dueText =
              due.kind === "exact" && due.date
                ? formatNumericDateFr(due.date)
                : due.kind === "approximate"
                  ? due.text
                  : "Indéterminée";
            const saleId = row.sale?.id || row.saleId;
            const inner = `
              <span class="list-row-body">
                <span class="list-row-title">Reste ${escapeHtml(formatFcfa(row.remaining))}</span>
                <span class="list-row-meta">${escapeHtml(formatNumericDateFr(row.saleDate))} · Échéance ${escapeHtml(dueText)}</span>
              </span>`;
            return saleId
              ? `<a class="list-row" href="#${businessSalePath(saleId)}">${inner}</a>`
              : `<article class="list-row">${inner}</article>`;
          })
          .join("")}</div></section>`
          : ""
      }
      ${
        detail.outstanding > 0
          ? `<a class="btn btn-primary btn-block" href="#${BUSINESS_LINKS.paymentNew}?customer=${escapeHtml(detail.customer.id)}">+ Enregistrer un paiement</a>`
          : `<p class="field-hint">Aucune somme à recevoir pour ce client.</p>`
      }
      <section class="section-block">
      <h2 class="section-title">Paiements</h2>
      ${
          cashEvents.length
            ? `<div class="list-card">${cashEvents
                .map((pay) => {
                  const atSale = pay.source === CUSTOMER_CASH_SOURCE.atSale;
                  const bits = [
                    formatNumericDateFr(pay.payment_date),
                    METHOD_LABELS[pay.payment_method] || pay.payment_method || "",
                    atSale ? "À la vente" : "",
                    pay.note && !atSale ? pay.note : "",
                  ].filter(Boolean);
                  return `
            <article class="list-row">
              <span class="list-row-body">
                <span class="list-row-title">${escapeHtml(formatFcfa(pay.amount_fcfa))}</span>
                <span class="list-row-meta">${escapeHtml(bits.join(" · "))}</span>
              </span>
            </article>
          `;
                })
                .join("")}</div>`
            : `<p class="field-hint">Aucun paiement enregistré.</p>`
        }
      </section>
      <section class="section-block">
      <h2 class="section-title">Ventes récentes</h2>
      ${
          detail.sales.length
            ? `<div class="list-card">${detail.sales
                .map((sale) => {
                  const total = saleItemsTotal(sale);
                  const paidNow = Number(sale.amount_paid_fcfa) || 0;
                  return `
            <a class="list-row" href="#${businessSalePath(sale.id)}">
              <span class="list-row-body">
                <span class="list-row-title">${escapeHtml(formatFcfa(total))}</span>
                <span class="list-row-meta">${escapeHtml(formatNumericDateFr(sale.sale_date))} · Payé à la vente ${escapeHtml(formatFcfa(paidNow))}</span>
              </span>
            </a>
          `;
                })
                .join("")}</div>`
            : emptyStateHtml({ title: "Aucune vente.", actionHref: BUSINESS_LINKS.sale, actionLabel: "Nouvelle vente" })
        }
      </section>
    `;
    // Customer payments go through the dedicated Payments form.
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

export function renderSupplierDetail(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Fournisseur", backHref: BUSINESS_LINKS.suppliers, backLabel: "Retour aux fournisseurs" })}
      <div data-role="body" class="page-body">${skeletonHtml(4)}</div>
    </section>
  `;
  loadSupplier(root.querySelector('[data-role="body"]'), ctx);
}

async function loadSupplier(body, ctx) {
  try {
    const detail = await getSupplierDetail(ctx.id);
    if (!detail.supplier) {
      body.innerHTML = errorStateHtml("Fournisseur introuvable.");
      return;
    }
    const fees = (detail.arrivals || []).reduce(
      (sum, row) =>
        sum
        + (Number(row.transport_fcfa) || 0)
        + (Number(row.unloading_fcfa) || 0)
        + (Number(row.other_expenses_fcfa) || 0),
      0,
    );
    body.innerHTML = `
      <article class="card detail-hero-card">
        <h2 class="detail-entity-name">${escapeHtml(supplierDisplayLabel(detail.supplier))}</h2>
        <p class="home-metric-label">Reste à payer</p>
        <div>${amountHtml(detail.outstanding)}</div>
        <div class="detail-metrics">
          <div>
            <span>Marchandise reçue</span>
            <strong>${escapeHtml(formatFcfa(detail.merchandise))}</strong>
          </div>
          <div>
            <span>Déjà payé</span>
            <strong>${escapeHtml(formatFcfa(detail.paid))}</strong>
          </div>
          ${
            fees > 0
              ? `<div>
            <span>Frais d'arrivage</span>
            <strong>${escapeHtml(formatFcfa(fees))}</strong>
          </div>`
              : ""
          }
        </div>
        <p class="field-hint">${detail.arrivals.length} arrivage${detail.arrivals.length > 1 ? "s" : ""}</p>
      </article>
      ${paymentFormHtml("supplier")}
      ${
        detail.payments?.length
          ? `<section class="section-block">
              <h2 class="section-title">Paiements</h2>
              <div class="list-card">${detail.payments
                .map(
                  (pay) => `
                <article class="list-row">
                  <span class="list-row-body">
                    <span class="list-row-title">${escapeHtml(formatFcfa(pay.amount_fcfa))}</span>
                    <span class="list-row-meta">${escapeHtml(formatNumericDateFr(pay.payment_date))}${pay.note ? ` · ${escapeHtml(pay.note)}` : ""}</span>
                  </span>
                </article>`,
                )
                .join("")}</div>
            </section>`
          : ""
      }
      <section class="section-block">
      <h2 class="section-title">Arrivages</h2>
      <div class="list-card">
        ${detail.arrivals
          .map(
            (a) => `
          <a class="list-row" href="#${businessBordereauPath(a.id)}">
            <span class="list-row-body">
              <span class="list-row-title">${escapeHtml(a.products?.name || "Arrivage")}</span>
              <span class="list-row-meta">${escapeHtml(formatNumericDateFr(a.arrival_date))} · ${a.quantity_received}</span>
            </span>
          </a>
        `,
          )
          .join("")}
      </div>
      </section>
    `;
    bindPaymentForm(body, {
      kind: "supplier",
      outstanding: detail.outstanding,
      write: (input) => createSupplierPayment({ ...input, supplierId: ctx.id }),
      onChanged: ctx.onChanged,
      reload: () => loadSupplier(body, ctx),
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function paymentFormHtml(_kind) {
  return `
    <form class="church-form stack form-section" data-role="pay-form">
      <h2 class="form-section-title">Enregistrer un paiement</h2>
      ${moneyInputHtml("pay-amount", "amount", "Montant reçu")}
      ${methodCardsHtml("cash")}
      ${dateFieldHtml({ id: "pay-date", name: "date", label: "Date", value: todayIso() })}
      <div class="field">
        <label class="field-label" for="pay-note">Note <span class="field-optional">(facultatif)</span></label>
        <input id="pay-note" name="note" class="field-input" />
      </div>
      <p class="field-hint" data-role="pay-preview"></p>
      <button class="btn btn-primary btn-block" type="submit">Continuer</button>
    </form>
  `;
}

function bindPaymentForm(body, { outstanding, write, onChanged, reload }) {
  const form = body.querySelector('[data-role="pay-form"]');
  if (!form) return;
  form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
  bindMethodCards(form);
  bindDateFields(form);
  const preview = form.querySelector('[data-role="pay-preview"]');
  const amountInput = form.elements.namedItem("amount");
  const updatePreview = () => {
    if (!preview || !(amountInput instanceof HTMLInputElement)) return;
    const amount = Number(amountInput.dataset.amount || 0);
    if (!amount) {
      preview.textContent = `Dette actuelle : ${formatFcfa(outstanding)}`;
      return;
    }
    const next = applyCustomerPayment(outstanding, amount);
    preview.textContent =
      amount > outstanding
        ? "Le montant dépasse la somme due."
        : `Dette actuelle : ${formatFcfa(outstanding)} · Paiement : ${formatFcfa(amount)} · Reste : ${formatFcfa(next.remaining)}`;
  };
  amountInput?.addEventListener("input", updatePreview);
  updatePreview();
  const guard = createSubmitGuard();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(async () => {
      clearFieldErrors(form);
      const amountEl = form.elements.namedItem("amount");
      const values = {
        amount: amountEl instanceof HTMLInputElement ? amountEl.dataset.amount || amountEl.value : "",
        date: form.elements.namedItem("date")?.value,
        note: form.elements.namedItem("note")?.value,
        paymentMethod: form.elements.namedItem("paymentMethod")?.value,
        outstanding,
      };
      const validated = validateMoneyPayment(values);
      if (!validated.ok) {
        Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
        return;
      }
      if (outstanding <= 0) {
        setFieldError(form, "amount", "Aucun reste à encaisser.");
        return;
      }
      const next = applyCustomerPayment(outstanding, validated.amount);
      const result = await confirmAndWrite(
        {
          title: "CONFIRMER LE PAIEMENT",
          amountHtml: amountHtml(validated.amount),
          rows: [
            { label: "Dette actuelle", value: formatFcfa(outstanding) },
            { label: "Paiement", value: formatFcfa(validated.amount) },
            { label: "Mode", value: METHOD_LABELS[values.paymentMethod] || values.paymentMethod },
            { label: "Date", value: displayDateFr(values.date) },
            { label: "Reste", value: formatFcfa(next.remaining) },
          ],
        },
        () =>
          write({
            amount: validated.amount,
            date: values.date,
            note: values.note,
            paymentMethod: values.paymentMethod,
          }),
      );
      if (result.status === "confirm") {
        onChanged?.();
        reload();
      }
    });
  });
}
