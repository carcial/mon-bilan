import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createCustomer,
  createCustomerPayment,
  createProduct,
  createSupplier,
  createSupplierPayment,
  getCustomerDetail,
  getCustomerBalances,
  getProductInventory,
  getSupplierBalances,
  getSupplierDetail,
} from "../../services/supabase/business.js";
import { applyCustomerPayment, validateMoneyPayment } from "../../utils/business-calc.js";
import { formatNumericDateFr, todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  emptyStateHtml,
  errorStateHtml,
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
      <a class="card tx-card" href="#${businessCustomerPath(row.customer.id)}" style="text-decoration:none">
        <p class="tx-fund">${escapeHtml(row.customer.name)}</p>
        <div>${amountHtml(row.outstanding, { className: "amount-sm" })}</div>
        <p class="field-hint">À recevoir</p>
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
      <a class="card tx-card" href="#${businessSupplierPath(row.supplier.id)}" style="text-decoration:none">
        <p class="tx-fund">${escapeHtml(row.supplier.code)} — ${escapeHtml(row.supplier.name)}</p>
        <div>${amountHtml(row.outstanding, { className: "amount-sm" })}</div>
        <p class="field-hint">À payer</p>
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
      <article class="card">
        <p class="tx-fund">${escapeHtml(row.product_name)}</p>
        <p>${escapeHtml(row.unit_type)}</p>
        <p>Stock : <strong>${row.quantity_available}</strong></p>
      </article>
    `,
  });
}

function listPage(root, { title, load, empty, createHref, createLabel, card }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref: ROUTES.business })}
      <a class="btn btn-secondary btn-block" href="#${createHref}" style="margin-bottom:1rem">${escapeHtml(createLabel)}</a>
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  const body = root.querySelector('[data-role="body"]');
  load()
    .then((rows) => {
      if (!rows.length) {
        body.innerHTML = emptyStateHtml({ title: empty, actionHref: createHref, actionLabel: createLabel });
        return;
      }
      body.innerHTML = `<div class="tx-list">${rows.map(card).join("")}</div>`;
    })
    .catch((err) => {
      body.innerHTML = errorStateHtml(friendlyError(err));
    });
}

export function renderCustomerNew(root, ctx) {
  simpleCreateForm(root, {
    title: "Nouveau client",
    backHref: BUSINESS_LINKS.customers,
    fields: `
      <div class="field"><label class="field-label" for="c-name">Nom</label><input id="c-name" name="name" class="field-input" required /><p class="field-error" data-error="name" hidden></p></div>
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
    fields: `
      <div class="field"><label class="field-label" for="s-code">Code</label><input id="s-code" name="code" class="field-input" required /></div>
      <div class="field"><label class="field-label" for="s-name">Nom</label><input id="s-name" name="name" class="field-input" required /></div>
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
    fields: `
      <div class="field"><label class="field-label" for="p-name">Nom</label><input id="p-name" name="name" class="field-input" required /></div>
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

function simpleCreateForm(root, { title, backHref, fields, confirmTitle, write, after }) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title, backHref })}
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
      <div data-role="body">${skeletonHtml(4)}</div>
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
    body.innerHTML = `
      <article class="card">
        <h2 class="tx-fund">${escapeHtml(detail.customer.name)}</h2>
        <p>${escapeHtml(detail.customer.phone || "Pas de téléphone")}</p>
        ${detail.customer.note ? `<p>${escapeHtml(detail.customer.note)}</p>` : ""}
        <p class="home-metric-label">Achats</p>
        <div>${amountHtml(detail.purchases, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Payé</p>
        <div>${amountHtml(detail.paid, { className: "amount-sm" })}</div>
        <p class="home-metric-label">À recevoir</p>
        <div>${amountHtml(detail.outstanding, { className: "amount-sm" })}</div>
      </article>
      ${paymentFormHtml("customer")}
      <h2 class="section-title">Ventes récentes</h2>
      <div class="tx-list">
        ${
          detail.sales.length
            ? detail.sales
                .map(
                  (sale) => `
            <a class="card tx-card" href="#${businessSalePath(sale.id)}" style="text-decoration:none">
              <p class="tx-date">${escapeHtml(formatNumericDateFr(sale.sale_date))}</p>
              <p>${escapeHtml(formatFcfa(sale.amount_paid_fcfa))} payé</p>
            </a>
          `,
                )
                .join("")
            : emptyStateHtml({ title: "Aucune vente.", actionHref: BUSINESS_LINKS.sale, actionLabel: "Nouvelle vente" })
        }
      </div>
    `;
    bindPaymentForm(body, {
      kind: "customer",
      outstanding: detail.outstanding,
      write: (input) => createCustomerPayment({ ...input, customerId: ctx.id }),
      onChanged: ctx.onChanged,
      reload: () => loadCustomer(body, ctx),
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

export function renderSupplierDetail(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Fournisseur", backHref: BUSINESS_LINKS.suppliers, backLabel: "Retour aux fournisseurs" })}
      <div data-role="body">${skeletonHtml(4)}</div>
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
    body.innerHTML = `
      <article class="card">
        <h2 class="tx-fund">${escapeHtml(detail.supplier.code)} — ${escapeHtml(detail.supplier.name)}</h2>
        <p class="home-metric-label">Marchandise reçue</p>
        <div>${amountHtml(detail.merchandise, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Déjà payé</p>
        <div>${amountHtml(detail.paid, { className: "amount-sm" })}</div>
        <p class="home-metric-label">Reste à payer</p>
        <div>${amountHtml(detail.outstanding, { className: "amount-sm" })}</div>
        <p class="field-hint">${detail.arrivals.length} arrivage${detail.arrivals.length > 1 ? "s" : ""}</p>
      </article>
      ${paymentFormHtml("supplier")}
      <h2 class="section-title">Arrivages</h2>
      <div class="tx-list">
        ${detail.arrivals
          .map(
            (a) => `
          <a class="card tx-card" href="#${businessBordereauPath(a.id)}" style="text-decoration:none">
            <p class="tx-date">${escapeHtml(formatNumericDateFr(a.arrival_date))}</p>
            <p>${escapeHtml(a.products?.name || "")} · ${a.quantity_received}</p>
          </a>
        `,
          )
          .join("")}
      </div>
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

function paymentFormHtml(kind) {
  return `
    <form class="church-form stack" data-role="pay-form" style="margin:1.5rem 0">
      <h2 class="section-title">+ Enregistrer un paiement</h2>
      ${moneyInputHtml("pay-amount", "amount", "Montant")}
      <div class="field">
        <label class="field-label" for="pay-date">Date</label>
        <input id="pay-date" name="date" type="date" class="field-input" value="${todayIso()}" />
        <p class="field-error" data-error="date" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="pay-note">Note <span class="field-optional">(facultatif)</span></label>
        <input id="pay-note" name="note" class="field-input" />
      </div>
      <button class="btn btn-primary btn-block" type="submit">Continuer</button>
    </form>
  `;
}

function bindPaymentForm(body, { outstanding, write, onChanged, reload }) {
  const form = body.querySelector('[data-role="pay-form"]');
  if (!form) return;
  form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
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
      };
      const validated = validateMoneyPayment(values);
      if (!validated.ok) {
        Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
        return;
      }
      const next = applyCustomerPayment(outstanding, validated.amount);
      const result = await confirmAndWrite(
        {
          title: "CONFIRMER LE PAIEMENT",
          amountHtml: amountHtml(validated.amount),
          rows: [
            { label: "Reste actuel", value: formatFcfa(outstanding) },
            { label: "Paiement", value: formatFcfa(validated.amount) },
            { label: "Nouveau reste", value: formatFcfa(next.remaining) },
          ],
        },
        () => write({ amount: validated.amount, date: values.date, note: values.note }),
      );
      if (result.status === "confirm") {
        onChanged?.();
        reload();
      }
    });
  });
}
