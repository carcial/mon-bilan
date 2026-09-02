import { amountHtml } from "../../components/amount.js";
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
  calculateUnitMargin,
  inferPaymentMethod,
  isSaleAtLoss,
  validateSale,
} from "../../utils/business-calc.js";
import { formatLongDateFr, todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import { businessSuccessPath } from "./business-routes.js";
import {
  bindIntegerInput,
  bindMoneyInput,
  clearFieldErrors,
  errorStateHtml,
  moneyInputHtml,
  pageHeaderHtml,
  PAYMENT_LABELS,
  selectHtml,
  setFieldError,
  skeletonHtml,
  unitLabel,
} from "./business-ui.js";

const draft = { current: null };

export function renderSaleForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Nouvelle vente",
        backHref: ROUTES.business,
      })}
      <div data-role="body">${skeletonHtml(5)}</div>
    </section>
  `;
  loadForm(root.querySelector('[data-role="body"]'), ctx);
}

async function loadForm(body, ctx) {
  if (!body) return;
  try {
    const [customers, products] = await Promise.all([getCustomers(), getProducts()]);
    const productId = draft.current?.productId || products[0]?.id || "";
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
  return `
    <form class="church-form stack" data-role="form" novalidate>
      <div class="field">
        <label class="field-label" for="sale-customer">Client</label>
        <select id="sale-customer" name="customerId" class="field-input">
          <option value="__new__">+ Nouveau client</option>
          ${selectHtml(customers, d?.customerId || customers[0]?.id)}
        </select>
        <p class="field-error" data-error="customerId" hidden></p>
      </div>
      <div class="stack-sm" data-role="new-customer" hidden>
        <div class="field">
          <label class="field-label" for="sale-new-name">Nom du client</label>
          <input id="sale-new-name" name="newCustomerName" class="field-input" value="${escapeHtml(d?.newCustomerName || "")}" />
        </div>
        <div class="field">
          <label class="field-label" for="sale-new-phone">Téléphone <span class="field-optional">(facultatif)</span></label>
          <input id="sale-new-phone" name="newCustomerPhone" class="field-input" value="${escapeHtml(d?.newCustomerPhone || "")}" />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="sale-product">Produit</label>
        <select id="sale-product" name="productId" class="field-input">
          ${selectHtml(products, d?.productId || products[0]?.id, {
            labelFn: (p) => `${p.name} (${p.unit_type})`,
          })}
        </select>
        <p class="field-error" data-error="productId" hidden></p>
      </div>

      <div class="field">
        <label class="field-label" for="sale-batch">Bordereau / lot</label>
        <select id="sale-batch" name="arrivalId" class="field-input">
          ${batchOptions(batches, d?.arrivalId)}
        </select>
        <p class="field-hint" data-role="batch-hint"></p>
        <p class="field-error" data-error="arrivalId" hidden></p>
      </div>

      <div class="field">
        <label class="field-label" for="sale-qty">Quantité</label>
        <input id="sale-qty" name="quantity" class="field-input" inputmode="numeric" data-int="true" value="${escapeHtml(d?.quantity || "")}" />
        <p class="field-error" data-error="quantity" hidden></p>
      </div>
      ${moneyInputHtml("sale-price", "unitPrice", "Prix de vente unitaire")}
      <div class="field">
        <label class="field-label" for="sale-date">Date</label>
        <input id="sale-date" name="date" type="date" class="field-input" value="${escapeHtml(d?.date || todayIso())}" />
        <p class="field-error" data-error="date" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="sale-method">Mode de paiement</label>
        <select id="sale-method" name="paymentMethod" class="field-input">
          <option value="cash">Espèces</option>
          <option value="credit">Crédit</option>
          <option value="partial">Paiement partiel</option>
        </select>
      </div>
      ${moneyInputHtml("sale-paid", "amountPaid", "Montant payé maintenant")}

      <div class="stack-sm" data-role="repay-fields">
        <div class="field">
          <label class="field-label" for="sale-repay">Remboursement prévu</label>
          <select id="sale-repay" name="repaymentExpectation" class="field-input">
            <option value="undetermined">Non déterminé</option>
            <option value="exact">Date exacte</option>
            <option value="approximate">Date approximative</option>
          </select>
        </div>
        <div class="field is-hidden" data-role="exact-date">
          <label class="field-label" for="sale-exact">Date exacte</label>
          <input id="sale-exact" name="repaymentExactDate" type="date" class="field-input" />
          <p class="field-error" data-error="repaymentExactDate" hidden></p>
        </div>
        <div class="field is-hidden" data-role="approx-text">
          <label class="field-label" for="sale-approx">Période approximative</label>
          <input id="sale-approx" name="repaymentApproxText" class="field-input" placeholder="Fin du mois, semaine prochaine…" />
          <p class="field-error" data-error="repaymentApproxText" hidden></p>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="sale-note">Note <span class="field-optional">(facultatif)</span></label>
        <textarea id="sale-note" name="note" class="field-input field-textarea" rows="3"></textarea>
      </div>
      <div class="card recon-preview" data-role="preview"></div>
      <p class="form-alert" data-role="form-error" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Continuer</button>
    </form>
  `;
}

function batchOptions(batches, selectedId) {
  if (!batches.length) {
    return `<option value="">Aucun lot disponible</option>`;
  }
  return batches
    .map((b) => {
      const selected = b.id === selectedId ? " selected" : "";
      const supplier = b.suppliers?.code || b.suppliers?.name || "Lot";
      return `<option value="${escapeHtml(b.id)}"${selected}>${escapeHtml(supplier)} — ${b.quantity_remaining} dispo</option>`;
    })
    .join("");
}

function readForm(form) {
  const money = (name) => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.dataset.amount || el.value : "";
  };
  const customerId = String(form.elements.namedItem("customerId")?.value || "");
  return {
    customerId: customerId === "__new__" ? "" : customerId,
    newCustomerName: String(form.elements.namedItem("newCustomerName")?.value || ""),
    newCustomerPhone: String(form.elements.namedItem("newCustomerPhone")?.value || ""),
    productId: String(form.elements.namedItem("productId")?.value || ""),
    arrivalId: String(form.elements.namedItem("arrivalId")?.value || ""),
    quantity: form.elements.namedItem("quantity")?.dataset?.amount
      || form.elements.namedItem("quantity")?.value,
    unitPrice: money("unitPrice"),
    date: String(form.elements.namedItem("date")?.value || ""),
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
  const guard = createSubmitGuard();

  const syncUi = async () => {
    const values = readForm(form);
    draft.current = values;
    const newBox = form.querySelector('[data-role="new-customer"]');
    if (newBox) {
      newBox.hidden = Boolean(form.elements.namedItem("customerId")?.value !== "__new__");
    }
    const expect = values.repaymentExpectation;
    form.querySelector('[data-role="exact-date"]')?.classList.toggle("is-hidden", expect !== "exact");
    form.querySelector('[data-role="approx-text"]')?.classList.toggle("is-hidden", expect !== "approximate");

    const batch = ctx.batches.find((b) => b.id === values.arrivalId);
    const hint = form.querySelector('[data-role="batch-hint"]');
    if (hint && batch) {
      hint.textContent = `${batch.suppliers?.code || ""} · ${batch.quantity_remaining} ${unitLabel(batch.products?.unit_type, batch.quantity_remaining)} disponibles · Coût réel : ${batch.effective_unit_cost_fcfa == null ? "—" : formatFcfa(batch.effective_unit_cost_fcfa)} / ${unitLabel(batch.products?.unit_type)}`;
    } else if (hint) {
      hint.textContent = "Aucun bordereau disponible pour ce produit.";
    }
    const preview = form.querySelector('[data-role="preview"]');
    if (preview) preview.innerHTML = salePreviewHtml(values, batch);
  };

  form.elements.namedItem("productId")?.addEventListener("change", async () => {
    const productId = form.elements.namedItem("productId")?.value;
    ctx.batches = productId ? await getAvailableBatches(productId) : [];
    const select = form.elements.namedItem("arrivalId");
    if (select) select.innerHTML = batchOptions(ctx.batches, ctx.batches[0]?.id);
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
  const qty = Number(values.quantity) || 0;
  if (!qty || !values.unitPrice) return `<p class="field-hint">Le résumé apparaîtra après la quantité et le prix.</p>`;
  const total = calculateSaleTotal(values.quantity, values.unitPrice);
  const recv = calculateSaleReceivable({
    quantity: values.quantity,
    unitPrice: values.unitPrice,
    amountPaid: values.amountPaid,
  });
  const cost = batch?.effective_unit_cost_fcfa;
  const loss = cost != null && isSaleAtLoss(values.unitPrice, cost);
  const margin = cost == null ? null : calculateLineMargin(qty, values.unitPrice, cost);
  return `
    ${
      loss
        ? `<div class="warning-box" role="alert">
            <p class="warning-box-title">⚠ VENTE À PERTE</p>
            <p>Coût réel : ${escapeHtml(formatFcfa(cost))} / unité</p>
            <p>Prix de vente : ${escapeHtml(formatFcfa(values.unitPrice))}</p>
            <p>Perte estimée : ${escapeHtml(formatFcfa(calculateUnitMargin(values.unitPrice, cost)))} / unité</p>
          </div>`
        : ""
    }
    <p>Total : <strong>${escapeHtml(formatFcfa(total))}</strong></p>
    <p>Payé maintenant : ${escapeHtml(formatFcfa(recv.paid))}</p>
    <p>Reste client : ${escapeHtml(formatFcfa(recv.remaining))}</p>
    ${margin == null ? "" : `<p>Marge estimée : ${escapeHtml(formatFcfa(margin))}</p>`}
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
  const cost = batch?.effective_unit_cost_fcfa;
  const loss = cost != null && isSaleAtLoss(validated.unitPrice, cost);
  let amountPaid = validated.amountPaid;
  if (values.paymentMethod === "cash" && amountPaid === 0) {
    amountPaid = validated.total;
  }
  const recv = calculateSaleReceivable({
    quantity: validated.quantity,
    unitPrice: validated.unitPrice,
    amountPaid,
  });
  const method =
    values.paymentMethod === "credit" && amountPaid === 0
      ? "credit"
      : inferPaymentMethod(recv.total, amountPaid);

  const extraHtml = loss
    ? `<div class="warning-box" role="alert">
        <p class="warning-box-title">⚠ VENTE À PERTE</p>
        <p>Coût réel : ${escapeHtml(formatFcfa(cost))} / ${escapeHtml(unitLabel(product?.unit_type))}</p>
        <p>Prix de vente : ${escapeHtml(formatFcfa(validated.unitPrice))}</p>
        <p>Perte / unité : ${escapeHtml(formatFcfa(calculateUnitMargin(validated.unitPrice, cost)))}</p>
        <p>Perte totale : ${escapeHtml(formatFcfa(calculateLineMargin(validated.quantity, validated.unitPrice, cost)))}</p>
      </div>`
    : "";

  const result = await confirmAndWrite(
    {
      title: "CONFIRMER LA VENTE",
      amountHtml: amountHtml(recv.total),
      extraHtml,
      rows: [
        { label: "Client", value: customer?.name || values.newCustomerName || "Nouveau client" },
        { label: "Produit", value: product?.name || "—" },
        { label: "Lot", value: batch?.suppliers?.code || "—" },
        { label: "Quantité", value: `${validated.quantity} ${unitLabel(product?.unit_type, validated.quantity)}` },
        { label: "Prix unitaire", value: formatFcfa(validated.unitPrice) },
        { label: "Paiement", value: PAYMENT_LABELS[method] || method },
        { label: "Payé maintenant", value: formatFcfa(amountPaid) },
        { label: "Reste", value: formatFcfa(recv.remaining) },
        { label: "Date", value: formatLongDateFr(values.date) },
      ],
    },
    async () =>
      createSale({
        customerId: values.customerId || null,
        newCustomerName: values.newCustomerName,
        newCustomerPhone: values.newCustomerPhone,
        productId: values.productId,
        arrivalId: values.arrivalId,
        quantity: validated.quantity,
        unitPrice: validated.unitPrice,
        effectiveUnitCost: cost,
        date: values.date,
        paymentMethod: method,
        amountPaid,
        repaymentExpectation: values.repaymentExpectation,
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
