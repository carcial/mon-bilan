import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createAdjustment,
  getArrivalInventory,
  getArrivals,
  getProductInventory,
  getProducts,
} from "../../services/supabase/business.js";
import { validateAdjustment } from "../../utils/business-calc.js";
import { todayIso } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  bindIntegerInput,
  BUSINESS_LINKS,
  clearFieldErrors,
  emptyStateHtml,
  errorStateHtml,
  pageHeaderHtml,
  selectHtml,
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
    body.innerHTML = `
      ${products
        .map(
          (p) => `
        <article class="card">
          <p class="tx-fund">${escapeHtml(p.product_name)}</p>
          <p>Disponible : <strong>${p.quantity_available}</strong> ${escapeHtml(unitLabel(p.unit_type, p.quantity_available))}</p>
          <p class="field-hint">Reçu ${p.quantity_received} · Vendu ${p.quantity_sold} · Ajustements ${p.quantity_adjustments}</p>
        </article>
      `,
        )
        .join("")}
      <h2 class="section-title">Par bordereau</h2>
      <div class="tx-list">
        ${arrivals
          .map((a) => {
            const inv = invByArrival.get(a.id);
            return `
              <a class="card tx-card" href="#${businessBordereauPath(a.id)}" style="text-decoration:none">
                <p class="tx-fund">${escapeHtml(a.products?.name || "")} · ${escapeHtml(a.suppliers?.code || "")}</p>
                <p>Reçu ${a.quantity_received} · Vendu ${inv?.quantity_sold ?? 0} · Reste <strong>${inv?.quantity_remaining ?? a.quantity_received}</strong></p>
              </a>
            `;
          })
          .join("")}
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
        <div class="field">
          <label class="field-label" for="adj-product">Produit</label>
          <select id="adj-product" name="productId" class="field-input">${selectHtml(products, products[0]?.id)}</select>
          <p class="field-error" data-error="productId" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="adj-arrival">Bordereau <span class="field-optional">(facultatif)</span></label>
          <select id="adj-arrival" name="arrivalId" class="field-input">
            <option value="">Produit entier</option>
            ${selectHtml(arrivals, "", {
              labelFn: (a) => `${a.products?.name || ""} · ${a.suppliers?.code || ""} · ${a.arrival_date}`,
            })}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="adj-dir">Type</label>
          <select id="adj-dir" name="direction" class="field-input">
            <option value="remove">Retrait (abîmé, manquant)</option>
            <option value="add">Ajout (correction)</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="adj-qty">Quantité</label>
          <input id="adj-qty" name="quantity" class="field-input" inputmode="numeric" data-int="true" />
          <p class="field-error" data-error="quantity" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="adj-reason">Motif</label>
          <select id="adj-reason" name="reason" class="field-input">
            <option value="Produit abîmé">Produit abîmé</option>
            <option value="Article manquant">Article manquant</option>
            <option value="Correction">Correction</option>
            <option value="Autre">Autre</option>
          </select>
          <p class="field-error" data-error="reason" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="adj-date">Date</label>
          <input id="adj-date" name="date" type="date" class="field-input" value="${todayIso()}" />
          <p class="field-error" data-error="date" hidden></p>
        </div>
        <div class="field">
          <label class="field-label" for="adj-note">Note <span class="field-optional">(facultatif)</span></label>
          <textarea id="adj-note" name="note" class="field-input field-textarea" rows="3"></textarea>
        </div>
        <p class="form-alert" data-role="form-error" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Continuer</button>
      </form>
    `;
    const form = body.querySelector("form");
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
