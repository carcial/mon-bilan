import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createAdjustment,
  getArrivalInventory,
  getArrivals,
  getProductInventory,
  getProducts,
} from "../../services/supabase/business.js";
import { sumAvailableInventory, validateAdjustment } from "../../utils/business-calc.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { formatNumericDateFr, todayIso } from "../../utils/dates.js";
import { supplierDisplayLabel } from "../../utils/supplier-label.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import {
  bindIntegerInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  emptyStateHtml,
  errorStateHtml,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
  unitLabel,
} from "./business-ui.js";
import { businessBordereauPath } from "./business-routes.js";

export function renderStock(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Stock",
        subtitle: "Reçu − vendu ± ajustements.",
        backHref: ROUTES.business,
      })}
      <div class="stack" style="margin-bottom:1rem">
        <a class="btn btn-secondary btn-block" href="#${BUSINESS_LINKS.adjustment}">Ajuster le stock</a>
      </div>
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  loadStock(root.querySelector('[data-role="body"]'));
}

async function loadStock(body) {
  try {
    const [products, arrivals, inventory] = await Promise.all([
      getProductInventory(),
      getArrivals(),
      getArrivalInventory(),
    ]);
    const invByArrival = new Map(inventory.map((row) => [row.arrival_id, row]));
    if (!products.length && !arrivals.length) {
      body.innerHTML = emptyStateHtml({
        title: "Aucun stock pour le moment.",
        actionHref: BUSINESS_LINKS.arrival,
        actionLabel: "Nouvel arrivage",
      });
      return;
    }
    const stockUnits = sumAvailableInventory(products);
    body.innerHTML = `
      <div class="stack">
      <article class="list-card">
        <div class="today-metrics">
          <div class="today-metric">
            <span>Stock disponible</span>
            <strong data-role="stock-total">${stockUnits}</strong>
          </div>
        </div>
      </article>
      <div class="list-card">
      ${products
        .map(
          (p) => `
        <article class="list-row">
          <span class="list-row-body">
            <span class="list-row-title">${escapeHtml(p.product_name)}</span>
            <span class="list-row-meta">Reçu ${p.quantity_received} · Vendu ${p.quantity_sold} · Ajustements ${p.quantity_adjustments}</span>
          </span>
          <span class="list-row-amount">${p.quantity_available} ${escapeHtml(unitLabel(p.unit_type, p.quantity_available))}</span>
        </article>
      `,
        )
        .join("")}
      </div>
      <h2 class="section-title">Par bordereau</h2>
      <div class="list-card">
        ${arrivals
          .map((a) => {
            const inv = invByArrival.get(a.id);
            return `
              <a class="list-row" href="#${businessBordereauPath(a.id)}">
                <span class="list-row-body">
                  <span class="list-row-title">${escapeHtml(a.products?.name || "")} · ${escapeHtml(a.suppliers?.code || "")}</span>
                  <span class="list-row-meta">Reçu ${a.quantity_received} · Vendu ${inv?.quantity_sold ?? 0}</span>
                </span>
                <span class="list-row-amount">${inv?.quantity_remaining ?? a.quantity_received}</span>
              </a>
            `;
          })
          .join("")}
      </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

export function renderAdjustmentForm(root, ctx = {}) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Ajuster le stock",
        backHref: BUSINESS_LINKS.stock,
        backLabel: "Retour au stock",
      })}
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  loadAdj(root.querySelector('[data-role="body"]'), ctx);
}

async function loadAdj(body, ctx) {
  try {
    const [products, arrivals] = await Promise.all([getProducts(), getArrivals()]);
    body.innerHTML = `
      <form class="church-form stack" data-role="form" novalidate>
        ${choiceFieldHtml({
          id: "adj-product",
          name: "productId",
          label: "Produit",
          options: products,
          selectedId: products[0]?.id || "",
          placeholder: "Choisir un produit",
          labelFn: (p) => p.name,
          emptyTitle: "Aucun produit disponible.",
          emptyHref: BUSINESS_LINKS.productNew,
          emptyLabel: "Ajouter",
        })}
        ${
          arrivals.length
            ? choiceFieldHtml({
                id: "adj-arrival",
                name: "arrivalId",
                label: "Bordereau",
                options: [{ id: "", name: "Produit entier" }, ...arrivals],
                selectedId: "",
                placeholder: "Produit entier",
                labelFn: (a) =>
                  a.id
                    ? `${a.products?.name || ""} · ${supplierDisplayLabel(a.suppliers)} · ${formatNumericDateFr(a.arrival_date)}`
                    : "Produit entier",
              })
            : `<input type="hidden" name="arrivalId" value="" />`
        }
        ${choiceFieldHtml({
          id: "adj-dir",
          name: "direction",
          label: "Type",
          options: [
            { id: "remove", name: "Retrait (abîmé, manquant)" },
            { id: "add", name: "Ajout (correction)" },
          ],
          selectedId: "remove",
        })}
        <div class="field">
          <label class="field-label" for="adj-qty">Quantité</label>
          <input id="adj-qty" name="quantity" class="field-input" inputmode="numeric" data-int="true" />
          <p class="field-error" data-error="quantity" hidden></p>
        </div>
        ${choiceFieldHtml({
          id: "adj-reason",
          name: "reason",
          label: "Motif",
          options: [
            { id: "Produit abîmé", name: "Produit abîmé" },
            { id: "Article manquant", name: "Article manquant" },
            { id: "Correction", name: "Correction" },
            { id: "Autre", name: "Autre" },
          ],
          selectedId: "Produit abîmé",
        })}
        ${dateFieldHtml({ id: "adj-date", name: "date", label: "Date", value: todayIso() })}
        <div class="field">
          <label class="field-label" for="adj-note">Note <span class="field-optional">(facultatif)</span></label>
          <textarea id="adj-note" name="note" class="field-input field-textarea" rows="3"></textarea>
        </div>
        <p class="form-alert" data-role="form-error" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </form>
    `;
    const form = body.querySelector("form");
    bindChoiceFields(form);
    bindDateFields(form);
    form.querySelectorAll("[data-int]").forEach((el) => bindIntegerInput(el));
    const guard = createSubmitGuard();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (guard.isLocked()) return;
      await guard.run(() => submitAdj(form, ctx));
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

async function submitAdj(form, ctx) {
  clearFieldErrors(form);
  const values = {
    productId: form.elements.namedItem("productId")?.value,
    arrivalId: form.elements.namedItem("arrivalId")?.value,
    direction: form.elements.namedItem("direction")?.value,
    quantity: form.elements.namedItem("quantity")?.dataset?.amount
      || form.elements.namedItem("quantity")?.value,
    reason: form.elements.namedItem("reason")?.value,
    date: form.elements.namedItem("date")?.value,
    note: form.elements.namedItem("note")?.value,
  };
  const validated = validateAdjustment(values);
  if (!validated.ok) {
    Object.entries(validated.errors).forEach(([k, m]) => setFieldError(form, k, m));
    return;
  }
  const result = await confirmAndWrite(
    {
      title: "CONFIRMER L'AJUSTEMENT",
      rows: [
        { label: "Sens", value: values.direction === "add" ? "Ajout" : "Retrait" },
        { label: "Quantité", value: String(validated.quantity) },
        { label: "Motif", value: values.reason },
        { label: "Date", value: values.date },
      ],
    },
    async () =>
      createAdjustment({
        productId: values.productId,
        arrivalId: values.arrivalId || null,
        delta: validated.delta,
        reason: values.reason,
        date: values.date,
        note: values.note,
      }),
  );
  if (result.status === "confirm") {
    ctx.onChanged?.();
    navigate(BUSINESS_LINKS.stock);
  }
}
