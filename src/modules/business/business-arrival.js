import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createArrival,
  getProducts,
  getSuppliers,
} from "../../services/supabase/business.js";
import {
  calculateSupplierOutstanding,
  summarizeArrivalEngagement,
  validateArrival,
} from "../../utils/business-calc.js";
import { displayDateFr, todayIso } from "../../utils/dates.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import { businessSuccessPath } from "./business-routes.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import {
  bindIntegerInput,
  bindMoneyInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  errorStateHtml,
  moneyInputHtml,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
  supplierAmountPerUnitLabel,
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
        backLabel: "Retour au commerce",
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
    <form class="church-form sale-form stack" data-role="form" novalidate>
      <section class="form-section">
        <h2 class="form-section-title">Marchandise</h2>
      ${choiceFieldHtml({
        id: "arr-supplier",
        name: "supplierId",
        label: "Fournisseur",
        options: suppliers,
        selectedId: d?.supplierId || "",
        placeholder: "Choisir un fournisseur",
        labelFn: (s) => supplierDisplayLabel(s),
        emptyTitle: "Aucun fournisseur disponible.",
        emptyHref: BUSINESS_LINKS.supplierNew,
        emptyLabel: "Ajouter",
      })}
      ${choiceFieldHtml({
        id: "arr-product",
        name: "productId",
        label: "Produit",
        options: products,
        selectedId: d?.productId || "",
        placeholder: "Choisir un produit",
        labelFn: (p) => p.name,
        emptyTitle: "Aucun produit disponible.",
        emptyHref: BUSINESS_LINKS.productNew,
        emptyLabel: "Ajouter",
      })}
      ${dateFieldHtml({ id: "arr-date", name: "date", label: "Date", value: d?.date || todayIso() })}
      <div class="field">
        <label class="field-label" for="arr-qty">Quantité reçue</label>
        <input id="arr-qty" name="quantity" class="field-input" inputmode="numeric" value="${escapeHtml(d?.quantity || "")}" data-int="true" />
        <p class="field-error" data-error="quantity" hidden></p>
      </div>
      ${moneyInputHtml("arr-price", "unitPrice", supplierAmountPerUnitLabel("sac"), "Ce que le fournisseur attend pour chaque sac.")}
      </section>
      <section class="form-section">
        <h2 class="form-section-title">Frais et note</h2>
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
        <textarea id="arr-note" name="note" class="field-input field-textarea" rows="2" placeholder="Ex. Camion du matin">${escapeHtml(d?.note || "")}</textarea>
      </div>
      </section>
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
  bindChoiceFields(form);
  bindDateFields(form);
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
  if (qty <= 0) return `<p class="field-hint">Le résumé apparaîtra après la quantité et le montant fournisseur.</p>`;
  const summary = summarizeArrivalEngagement(values);
  const outstanding = calculateSupplierOutstanding({
    merchandiseValue: summary.merchandise,
    arrivalExpenses: summary.fees,
    expensesOwedToSupplier: values.expensesOwed,
    advancePaid: values.advance,
  });
  const product = ctx.products.find((p) => p.id === values.productId);
  return `
    <p class="field-hint">${escapeHtml(String(qty))} ${escapeHtml(unitLabel(product?.unit_type, qty))} · ${escapeHtml(formatFcfa(summary.supplierAmountPerUnit))} / ${escapeHtml(unitLabel(product?.unit_type))}</p>
    <p>Montant fournisseur : ${escapeHtml(formatFcfa(summary.merchandise))}</p>
    <p>Frais : ${escapeHtml(formatFcfa(summary.fees))}</p>
    ${summary.feeLabel ? `<p class="field-hint">${escapeHtml(summary.feeLabel.charAt(0).toUpperCase() + summary.feeLabel.slice(1))}</p>` : ""}
    <p>Total engagé : ${escapeHtml(formatFcfa(summary.totalEngaged))}</p>
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
  const summary = summarizeArrivalEngagement(validated);
  const outstanding = calculateSupplierOutstanding({
    merchandiseValue: summary.merchandise,
    arrivalExpenses: summary.fees,
    expensesOwedToSupplier: values.expensesOwed,
    advancePaid: validated.advance,
  });
  const feeNote = summary.feeLabel
    ? summary.feeLabel.charAt(0).toUpperCase() + summary.feeLabel.slice(1)
    : "";

  const result = await confirmAndWrite(
    {
      title: "CONFIRMER L'ARRIVAGE",
      amountHtml: amountHtml(summary.totalEngaged),
      rows: [
        { label: "Fournisseur", value: supplier ? `${supplier.code}` : "—" },
        { label: "Produit", value: product?.name || "—" },
        { label: "Quantité", value: `${validated.quantity} ${unitLabel(product?.unit_type, validated.quantity)}` },
        { label: supplierAmountPerUnitLabel(product?.unit_type), value: formatFcfa(summary.supplierAmountPerUnit) },
        { label: "Montant fournisseur", value: formatFcfa(summary.merchandise) },
        { label: "Frais", value: feeNote ? `${formatFcfa(summary.fees)} — ${feeNote}` : formatFcfa(summary.fees) },
        { label: "Total engagé", value: formatFcfa(summary.totalEngaged) },
        { label: "Avance fournisseur", value: formatFcfa(validated.advance) },
        { label: "Reste fournisseur", value: formatFcfa(outstanding) },
        { label: "Date", value: displayDateFr(values.date) },
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
