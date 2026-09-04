import { amountHtml } from "../../components/amount.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import { bindCustomerCombobox, customerComboboxHtml } from "../../components/customer-combobox.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createSale,
  getAvailableBatches,
  getCustomers,
  getProducts,
} from "../../services/supabase/business.js";
import {
  calculateLineMargin,
  calculateSaleReceivable,
  calculateSaleTotal,
  inferSettlementStatus,
  isSaleAtLoss,
  paidNowForSettlement,
  validateSale,
} from "../../utils/business-calc.js";
import { displayDateFr, todayIso } from "../../utils/dates.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa, toFcfaInteger } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import { businessSuccessPath } from "./business-routes.js";
import {
  bindIntegerInput,
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  errorStateHtml,
  METHOD_LABELS,
  methodCardsHtml,
  moneyInputHtml,
  pageHeaderHtml,
  SETTLEMENT_LABELS,
  setFieldError,
  skeletonHtml,
  supplierAmountPerUnitLabel,
  unitLabel,
} from "./business-ui.js";

const draft = { current: null };

export function renderSaleForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Nouvelle vente", backHref: ROUTES.business, backLabel: "Retour au commerce" })}
      <div data-role="body">${skeletonHtml(5)}</div>
    </section>
  `;
  loadForm(root.querySelector('[data-role="body"]'), ctx);
}

async function loadForm(body, ctx) {
  if (!body) return;
  try {
    const [customers, products] = await Promise.all([getCustomers(), getProducts()]);
    const productId = draft.current?.productId || (products.length === 1 ? products[0].id : "");
    const batches = productId ? await getAvailableBatches(productId) : [];
    body.innerHTML = formHtml({ customers, products, batches, draft: draft.current });
    bindForm(body, { customers, products, batches, onChanged: ctx.onChanged });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(5);
      loadForm(body, ctx);
    });
  }
}

function formHtml({ customers, products, batches, draft: d }) {
  const selectedProduct = d?.productId || (products.length === 1 ? products[0].id : "");
  const settlement = d?.settlementStatus || "paid";
  const method = d?.paymentMethod || "cash";
  return `
    <form class="church-form sale-form stack" data-role="form" novalidate>
      <section class="form-section">
        <h2 class="form-section-title">Client</h2>
        ${customerComboboxHtml({
          customers,
          selectedId: d?.customerId || "",
          query: d?.newCustomerName || "",
          hideLabel: true,
        })}
      </section>

      <section class="form-section">
        <h2 class="form-section-title">Marchandise</h2>
        ${choiceFieldHtml({
          id: "sale-product",
          name: "productId",
          label: "Produit",
          options: products,
          selectedId: selectedProduct,
          placeholder: "Choisir un produit",
          labelFn: (p) => p.name,
          emptyTitle: "Aucun produit disponible.",
          emptyHref: BUSINESS_LINKS.productNew,
          emptyLabel: "Ajouter",
        })}
        <div data-role="batch-field">
          ${batchFieldHtml(batches, d?.arrivalId)}
        </div>
        <div class="field">
          <label class="field-label" for="sale-qty">Quantité</label>
          <input id="sale-qty" name="quantity" class="field-input" inputmode="numeric" data-int="true" placeholder="Ex. 5" value="${escapeHtml(d?.quantity || "")}" />
          <p class="field-error" data-error="quantity" hidden></p>
        </div>
        ${moneyInputHtml("sale-price", "unitPrice", "Prix de vente")}
      </section>

      <section class="form-section">
        <h2 class="form-section-title">Paiement</h2>
        <p class="field-label">Statut</p>
        <div class="segmented" role="radiogroup" aria-label="Statut">
          ${[
            ["paid", "Payé"],
            ["partial", "Partiel"],
            ["credit", "Crédit"],
          ]
            .map(
              ([value, label]) => `
            <button type="button" class="segmented-btn${settlement === value ? " is-active" : ""}" data-settlement="${value}">
              ${escapeHtml(label)}
            </button>
          `,
            )
            .join("")}
        </div>
        <input type="hidden" name="settlementStatus" value="${escapeHtml(settlement)}" />
        <p class="field-error" data-error="settlementStatus" hidden></p>

        <div data-role="paid-field">
          ${moneyInputHtml("sale-paid", "amountPaid", "Montant payé maintenant")}
        </div>

        <div data-role="method-field">
          ${methodCardsHtml(method)}
        </div>

        <div class="stack-sm" data-role="repay-fields">
          <p class="field-label">Échéance</p>
          <div class="segmented segmented-wrap" role="radiogroup" aria-label="Type d'échéance">
            ${[
              ["exact", "Date précise"],
              ["approximate", "Date approximative"],
              ["undetermined", "Indéterminée"],
            ]
              .map(
                ([value, label]) => `
              <button type="button" class="segmented-btn${(d?.repaymentExpectation || "undetermined") === value ? " is-active" : ""}" data-due="${value}">
                ${escapeHtml(label)}
              </button>
            `,
              )
              .join("")}
          </div>
          <input type="hidden" name="repaymentExpectation" value="${escapeHtml(d?.repaymentExpectation || "undetermined")}" />
          <div class="is-hidden" data-role="exact-date">
            ${dateFieldHtml({
              id: "sale-exact",
              name: "repaymentExactDate",
              label: "Date prévue",
              value: d?.repaymentExactDate || "",
              defaultToday: false,
            })}
          </div>
          <div class="field is-hidden" data-role="approx-text">
            <label class="field-label" for="sale-approx">Période approximative</label>
            <input id="sale-approx" name="repaymentApproxText" class="field-input" placeholder="Ex. Début octobre" value="${escapeHtml(d?.repaymentApproxText || "")}" />
            <p class="field-error" data-error="repaymentApproxText" hidden></p>
          </div>
        </div>
      </section>

      <section class="form-section">
        <h2 class="form-section-title">Date et note</h2>
        ${dateFieldHtml({
          id: "sale-date",
          name: "date",
          label: "Date",
          value: d?.date || todayIso(),
        })}
        <div class="field">
          <label class="field-label" for="sale-note">Note <span class="field-optional">(facultatif)</span></label>
          <textarea id="sale-note" name="note" class="field-input field-textarea" rows="2" placeholder="Ex. Paiement prévu vendredi"></textarea>
        </div>
      </section>

      <div class="card recon-preview form-summary" data-role="preview"></div>
      <p class="form-alert" data-role="form-error" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Continuer</button>
    </form>
  `;
}

function batchFieldHtml(batches, selectedId) {
  return choiceFieldHtml({
    id: "sale-batch",
    name: "arrivalId",
    label: "Lot",
    options: batches,
    selectedId: selectedId || (batches.length === 1 ? batches[0].id : ""),
    placeholder: "Choisir un lot",
    labelFn: (b) => `${supplierDisplayLabel(b.suppliers) || "Lot"} · ${b.quantity_remaining} dispo`,
    emptyTitle: "Aucun lot disponible.",
    emptyHref: BUSINESS_LINKS.arrival,
    emptyLabel: "Arrivage",
  });
}

function readForm(form) {
  const money = (name) => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.dataset.amount || el.value : "";
  };
  return {
    customerId: String(form.elements.namedItem("customerId")?.value || ""),
    newCustomerName: String(form.elements.namedItem("newCustomerName")?.value || ""),
    productId: String(form.elements.namedItem("productId")?.value || ""),
    arrivalId: String(form.elements.namedItem("arrivalId")?.value || ""),
    quantity: form.elements.namedItem("quantity")?.dataset?.amount
      || form.elements.namedItem("quantity")?.value,
    unitPrice: money("unitPrice"),
    date: String(form.elements.namedItem("date")?.value || ""),
    settlementStatus: String(form.elements.namedItem("settlementStatus")?.value || "paid"),
    paymentMethod: String(form.elements.namedItem("paymentMethod")?.value || "cash"),
    amountPaid: money("amountPaid"),
    repaymentExpectation: String(form.elements.namedItem("repaymentExpectation")?.value || "undetermined"),
    repaymentExactDate: String(form.elements.namedItem("repaymentExactDate")?.value || ""),
    repaymentApproxText: String(form.elements.namedItem("repaymentApproxText")?.value || ""),
    note: String(form.elements.namedItem("note")?.value || ""),
  };
}

function bindForm(body, ctx) {
  const form = body.querySelector('[data-role="form"]');
  if (!form) return;
  form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
  form.querySelectorAll("[data-int]").forEach((el) => bindIntegerInput(el));
  bindCustomerCombobox(form, ctx.customers);
  bindChoiceFields(form);
  bindDateFields(form);
  const guard = createSubmitGuard();

  const syncUi = async () => {
    const values = readForm(form);
    draft.current = values;
    const expect = values.repaymentExpectation;
    const hasBalance = values.settlementStatus !== "paid";
    form.querySelector('[data-role="exact-date"]')?.classList.toggle("is-hidden", expect !== "exact");
    form.querySelector('[data-role="approx-text"]')?.classList.toggle("is-hidden", expect !== "approximate");
    form.querySelector('[data-role="paid-field"]')?.classList.toggle("is-hidden", values.settlementStatus !== "partial");
    form.querySelector('[data-role="method-field"]')?.classList.toggle("is-hidden", values.settlementStatus === "credit");
    form.querySelector('[data-role="repay-fields"]')?.classList.toggle("is-hidden", !hasBalance);

    const batch = ctx.batches.find((b) => b.id === values.arrivalId);
    const preview = form.querySelector('[data-role="preview"]');
    if (preview) preview.innerHTML = salePreviewHtml(values, batch);
  };

  form.querySelectorAll("[data-settlement]").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.elements.namedItem("settlementStatus").value = btn.getAttribute("data-settlement");
      form.querySelectorAll("[data-settlement]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      syncUi();
    });
  });
  form.querySelectorAll("[data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.elements.namedItem("paymentMethod").value = btn.getAttribute("data-method");
      form.querySelectorAll("[data-method]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      syncUi();
    });
  });
  form.querySelectorAll("[data-due]").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.elements.namedItem("repaymentExpectation").value = btn.getAttribute("data-due");
      form.querySelectorAll("[data-due]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      syncUi();
    });
  });

  form.elements.namedItem("productId")?.addEventListener("change", async () => {
    const productId = form.elements.namedItem("productId")?.value;
    ctx.batches = productId ? await getAvailableBatches(productId) : [];
    const holder = form.querySelector('[data-role="batch-field"]');
    if (holder) {
      holder.innerHTML = batchFieldHtml(ctx.batches, ctx.batches[0]?.id);
      bindChoiceFields(holder);
    }
    syncUi();
  });

  form.addEventListener("input", syncUi);
  form.addEventListener("change", syncUi);
  syncUi();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(() => handleSubmit(form, ctx));
  });
}

function salePreviewHtml(values, batch) {
  const qty = toFcfaInteger(values.quantity);
  if (!qty || !values.unitPrice) return `<p class="field-hint">Le résumé apparaîtra après la quantité et le prix de vente.</p>`;
  const total = calculateSaleTotal(values.quantity, values.unitPrice);
  const settlement = values.settlementStatus || inferSettlementStatus(total, values.amountPaid);
  const paidNow = paidNowForSettlement(settlement, total, values.amountPaid);
  const recv = calculateSaleReceivable({
    quantity: values.quantity,
    unitPrice: values.unitPrice,
    amountPaid: paidNow,
  });
  const supplierAmount = batch?.supplier_unit_price_fcfa;
  const unitType = batch?.products?.unit_type;
  const loss = supplierAmount != null && isSaleAtLoss(values.unitPrice, supplierAmount);
  const margin =
    supplierAmount == null
      ? null
      : calculateLineMargin(qty, values.unitPrice, supplierAmount);
  return `
    ${loss ? saleLossHtml() : ""}
    ${
      supplierAmount == null
        ? ""
        : `<p>${escapeHtml(supplierAmountPerUnitLabel(unitType))} : ${escapeHtml(formatFcfa(supplierAmount))}</p>`
    }
    <p>Prix de vente : ${escapeHtml(formatFcfa(values.unitPrice))}</p>
    <p>Total vente : <strong>${escapeHtml(formatFcfa(total))}</strong></p>
    <p>Payé maintenant : ${escapeHtml(formatFcfa(recv.paid))}</p>
    <p>Reste à payer : ${escapeHtml(formatFcfa(recv.remaining))}</p>
    ${margin == null ? "" : `<p>Marge estimée : ${escapeHtml(formatFcfa(margin))}</p>`}
  `;
}

function saleLossHtml() {
  return `
    <div class="alert-card alert-card-danger" role="alert">
      <p class="warning-box-title">Vente à perte</p>
      <p>Cette vente est inférieure au montant fournisseur par sac.</p>
    </div>
  `;
}

async function handleSubmit(form, ctx) {
  clearFieldErrors(form);
  const values = readForm(form);
  const batch = ctx.batches.find((b) => b.id === values.arrivalId);
  const validated = validateSale({
    ...values,
    available: batch?.quantity_remaining ?? 0,
  });
  if (!validated.ok) {
    Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
    return;
  }

  const product = ctx.products.find((p) => p.id === values.productId);
  const customer = ctx.customers.find((c) => c.id === values.customerId);
  const supplierAmount = batch?.supplier_unit_price_fcfa;
  const unitType = product?.unit_type;
  const loss = supplierAmount != null && isSaleAtLoss(validated.unitPrice, supplierAmount);
  const amountPaid = validated.amountPaid;
  const recv = calculateSaleReceivable({
    quantity: validated.quantity,
    unitPrice: validated.unitPrice,
    amountPaid,
  });
  const margin =
    supplierAmount == null
      ? null
      : calculateLineMargin(validated.quantity, validated.unitPrice, supplierAmount);

  const extraHtml = loss ? saleLossHtml() : "";

  const result = await confirmAndWrite(
    {
      title: "Confirmer la vente",
      amountHtml: amountHtml(recv.total),
      extraHtml,
      confirmLabel: "Confirmer",
      cancelLabel: "Modifier",
      rows: [
        { label: "Client", value: customer?.name || values.newCustomerName || "Nouveau client" },
        { label: "Produit", value: product?.name || "—" },
        { label: "Lot", value: supplierDisplayLabel(batch?.suppliers) || "—" },
        { label: "Quantité", value: `${validated.quantity} ${unitLabel(unitType, validated.quantity)}` },
        {
          label: supplierAmountPerUnitLabel(unitType),
          value: supplierAmount == null ? "—" : formatFcfa(supplierAmount),
        },
        { label: "Prix de vente", value: formatFcfa(validated.unitPrice) },
        { label: "Marge estimée", value: margin == null ? "—" : formatFcfa(margin) },
        { label: "Statut", value: SETTLEMENT_LABELS[validated.settlement] || validated.settlement },
        {
          label: "Mode",
          value: validated.method ? METHOD_LABELS[validated.method] || validated.method : "—",
        },
        { label: "Payé maintenant", value: formatFcfa(amountPaid) },
        { label: "Reste", value: formatFcfa(recv.remaining) },
        { label: "Date", value: displayDateFr(values.date) },
      ],
    },
    async () =>
      createSale({
        customerId: values.customerId || null,
        newCustomerName: values.newCustomerName,
        productId: values.productId,
        arrivalId: values.arrivalId,
        quantity: validated.quantity,
        unitPrice: validated.unitPrice,
        effectiveUnitCost: batch?.effective_unit_cost_fcfa ?? null,
        date: values.date,
        settlementStatus: validated.settlement,
        paymentMethod: validated.method,
        amountPaid,
        repaymentExpectation: values.settlementStatus === "paid" ? "undetermined" : values.repaymentExpectation,
        repaymentExactDate: values.repaymentExactDate || null,
        repaymentApproxText: values.repaymentApproxText || null,
        note: values.note,
      }),
  );

  if (result.status === "confirm" && result.data) {
    draft.current = null;
    ctx.onChanged?.();
    navigate(businessSuccessPath("vente", result.data.id));
  }
}
