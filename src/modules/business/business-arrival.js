import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createArrival,
  getProducts,
  getSuppliers,
} from "../../services/supabase/business.js";
import {
  calculateArrivalExpenses,
  calculateEffectiveBatchCost,
  calculateEffectiveUnitCost,
  calculateMerchandiseValue,
  calculateSupplierOutstanding,
  validateArrival,
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
  selectHtml,
  setFieldError,
  skeletonHtml,
  unitLabel,
} from "./business-ui.js";

const draft = { current: null };

export function renderArrivalForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Nouvel arrivage",
        subtitle: "Enregistrer un bordereau fournisseur.",
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
    const [suppliers, products] = await Promise.all([getSuppliers(), getProducts()]);
    body.innerHTML = formHtml({ suppliers, products, draft: draft.current });
    bindForm(body, { suppliers, products, onChanged: ctx.onChanged });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(5);
      loadForm(body, ctx);
    });
  }
}

function formHtml({ suppliers, products, draft: d }) {
  return `
    <form class="church-form stack" data-role="form" novalidate>
      <div class="field">
        <label class="field-label" for="arr-supplier">Fournisseur</label>
        <select id="arr-supplier" name="supplierId" class="field-input">
          ${selectHtml(suppliers, d?.supplierId || suppliers[0]?.id, {
            labelFn: (s) => `${s.code} — ${s.name}`,
          })}
        </select>
        <p class="field-error" data-error="supplierId" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="arr-product">Produit</label>
        <select id="arr-product" name="productId" class="field-input">
          ${selectHtml(products, d?.productId || products[0]?.id, {
            labelFn: (p) => `${p.name} (${p.unit_type})`,
          })}
        </select>
        <p class="field-error" data-error="productId" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="arr-date">Date</label>
        <input id="arr-date" name="date" type="date" class="field-input" value="${escapeHtml(d?.date || todayIso())}" />
        <p class="field-error" data-error="date" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="arr-qty">Quantité reçue</label>
        <input id="arr-qty" name="quantity" class="field-input" inputmode="numeric" value="${escapeHtml(d?.quantity || "")}" data-int="true" />
        <p class="field-error" data-error="quantity" hidden></p>
      </div>
      ${moneyInputHtml("arr-price", "unitPrice", "Prix unitaire fournisseur")}
      ${moneyInputHtml("arr-transport", "transport", "Transport")}
      ${moneyInputHtml("arr-unload", "unloading", "Déchargement")}
      ${moneyInputHtml("arr-other", "other", "Autres frais")}
      ${moneyInputHtml("arr-advance", "advance", "Avance payée au fournisseur")}
      <label class="field-check">
        <input type="checkbox" name="expensesOwed" ${d?.expensesOwed ? "checked" : ""} />
        Transport / déchargement dus au fournisseur
      </label>
      <div class="field">
        <label class="field-label" for="arr-note">Note <span class="field-optional">(facultatif)</span></label>
        <textarea id="arr-note" name="note" class="field-input field-textarea" rows="3">${escapeHtml(d?.note || "")}</textarea>
      </div>
      <div class="card recon-preview" data-role="preview"></div>
      <p class="form-alert" data-role="form-error" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Continuer</button>
    </form>
  `;
}

function readForm(form) {
  const money = (name) => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.dataset.amount || el.value : "";
  };
  return {
    supplierId: String(form.elements.namedItem("supplierId")?.value || ""),
    productId: String(form.elements.namedItem("productId")?.value || ""),
    date: String(form.elements.namedItem("date")?.value || ""),
    quantity: form.elements.namedItem("quantity")?.dataset?.amount
      || form.elements.namedItem("quantity")?.value,
    unitPrice: money("unitPrice"),
    transport: money("transport"),
    unloading: money("unloading"),
    other: money("other"),
    advance: money("advance"),
    expensesOwed: Boolean(form.elements.namedItem("expensesOwed")?.checked),
    note: String(form.elements.namedItem("note")?.value || ""),
  };
}

function bindForm(body, ctx) {
  const form = body.querySelector('[data-role="form"]');
  if (!form) return;
  form.querySelectorAll("[data-money]").forEach((el) => bindMoneyInput(el));
  form.querySelectorAll("[data-int]").forEach((el) => bindIntegerInput(el));
  const guard = createSubmitGuard();
  const preview = form.querySelector('[data-role="preview"]');

  const refresh = () => {
    draft.current = readForm(form);
    if (preview) preview.innerHTML = previewHtml(draft.current, ctx);
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  refresh();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;
    await guard.run(() => handleSubmit(form, ctx));
  });
}

function previewHtml(values, ctx) {
  const qty = Number(values.quantity) || 0;
  if (qty <= 0) return `<p class="field-hint">Le résumé apparaîtra après la quantité et le prix.</p>`;
  const merch = calculateMerchandiseValue(values.quantity, values.unitPrice);
  const expenses = calculateArrivalExpenses(values);
  const batch = calculateEffectiveBatchCost(values);
  const unit = calculateEffectiveUnitCost(batch, qty);
  const outstanding = calculateSupplierOutstanding({
    merchandiseValue: merch,
    arrivalExpenses: expenses,
    expensesOwedToSupplier: values.expensesOwed,
    advancePaid: values.advance,
  });
  const product = ctx.products.find((p) => p.id === values.productId);
  return `
    <p><strong>${escapeHtml(String(qty))} ${escapeHtml(unitLabel(product?.unit_type, qty))}</strong></p>
    <p>Marchandise : ${escapeHtml(formatFcfa(merch))}</p>
    <p>Frais : ${escapeHtml(formatFcfa(expenses))}</p>
    <p>Coût effectif : ${escapeHtml(formatFcfa(batch))}</p>
    <p>Coût / unité : ${escapeHtml(unit == null ? "—" : formatFcfa(unit))}</p>
    <p>Reste fournisseur : ${escapeHtml(formatFcfa(outstanding))}</p>
  `;
}

async function handleSubmit(form, ctx) {
  clearFieldErrors(form);
  const values = readForm(form);
  const validated = validateArrival(values);
  if (!validated.ok) {
    Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
    return;
  }
  const supplier = ctx.suppliers.find((s) => s.id === values.supplierId);
  const product = ctx.products.find((p) => p.id === values.productId);
  const merch = calculateMerchandiseValue(validated.quantity, validated.unitPrice);
  const expenses = calculateArrivalExpenses(validated);
  const batch = calculateEffectiveBatchCost({
    quantity: validated.quantity,
    unitPrice: validated.unitPrice,
    ...validated,
  });
  const unit = calculateEffectiveUnitCost(batch, validated.quantity);
  const outstanding = calculateSupplierOutstanding({
    merchandiseValue: merch,
    arrivalExpenses: expenses,
    expensesOwedToSupplier: values.expensesOwed,
    advancePaid: validated.advance,
  });

  const result = await confirmAndWrite(
    {
      title: "CONFIRMER L'ARRIVAGE",
      amountHtml: amountHtml(batch),
      rows: [
        { label: "Fournisseur", value: supplier ? `${supplier.code}` : "—" },
        { label: "Produit", value: product?.name || "—" },
        { label: "Quantité", value: `${validated.quantity} ${unitLabel(product?.unit_type, validated.quantity)}` },
        { label: "Marchandise", value: formatFcfa(merch) },
        { label: "Transport", value: formatFcfa(validated.transport) },
        { label: "Déchargement", value: formatFcfa(validated.unloading) },
        { label: "Autres", value: formatFcfa(validated.other) },
        { label: "Coût effectif", value: formatFcfa(batch) },
        { label: "Coût / unité", value: unit == null ? "—" : formatFcfa(unit) },
        { label: "Avance fournisseur", value: formatFcfa(validated.advance) },
        { label: "Reste fournisseur", value: formatFcfa(outstanding) },
        { label: "Date", value: formatLongDateFr(values.date) },
      ],
    },
    async () =>
      createArrival({
        supplierId: values.supplierId,
        productId: values.productId,
        date: values.date,
        quantity: validated.quantity,
        unitPrice: validated.unitPrice,
        transport: validated.transport,
        unloading: validated.unloading,
        other: validated.other,
        advance: validated.advance,
        expensesOwedToSupplier: values.expensesOwed,
        note: values.note,
      }),
  );

  if (result.status === "confirm" && result.data) {
    draft.current = null;
    ctx.onChanged?.();
    navigate(businessSuccessPath("arrivage", result.data.id));
  }
}
