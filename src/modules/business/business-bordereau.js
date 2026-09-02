import { amountHtml } from "../../components/amount.js";
import { ROUTES } from "../../router.js";
import { getArrivals, getBordereau } from "../../services/supabase/business.js";
import { formatLongDateFr, formatNumericDateFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { formatFcfa } from "../../utils/money.js";
import {
  BUSINESS_LINKS,
  emptyStateHtml,
  errorStateHtml,
  pageHeaderHtml,
  skeletonHtml,
  unitLabel,
} from "./business-ui.js";
import { businessBordereauPath } from "./business-routes.js";

export function renderBordereauList(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Bordereaux",
        subtitle: "Arrivages fournisseurs.",
        backHref: ROUTES.business,
      })}
      <div data-role="body">${skeletonHtml(3)}</div>
    </section>
  `;
  loadList(root.querySelector('[data-role="body"]'));
}

async function loadList(body) {
  try {
    const rows = await getArrivals();
    if (!rows.length) {
      body.innerHTML = emptyStateHtml({
        title: "Aucun arrivage pour le moment.",
        actionHref: BUSINESS_LINKS.arrival,
        actionLabel: "Nouvel arrivage",
      });
      return;
    }
    body.innerHTML = `<div class="tx-list">${rows.map(listCard).join("")}</div>`;
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => loadList(body));
  }
}

function listCard(row) {
  return `
    <a class="card tx-card" href="#${businessBordereauPath(row.id)}" style="text-decoration:none">
      <p class="tx-date">${escapeHtml(formatNumericDateFr(row.arrival_date))}</p>
      <p class="tx-fund">${escapeHtml(row.suppliers?.code || "Fournisseur")} · ${escapeHtml(row.products?.name || "")}</p>
      <p class="tx-reason">${row.quantity_received} ${escapeHtml(unitLabel(row.products?.unit_type, row.quantity_received))}</p>
    </a>
  `;
}

export function renderBordereauDetail(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({
        title: "Bordereau",
        backHref: BUSINESS_LINKS.bordereaux,
        backLabel: "Retour aux bordereaux",
      })}
      <div data-role="body">${skeletonHtml(5)}</div>
    </section>
  `;
  loadDetail(root.querySelector('[data-role="body"]'), ctx);
}

async function loadDetail(body, ctx) {
  try {
    const data = await getBordereau(ctx.id);
    if (!data) {
      body.innerHTML = errorStateHtml("Ce bordereau est introuvable.");
      return;
    }
    const { arrival, cost, sold, remaining, revenue, estimatedMargin, outstanding } = data;
    const unit = arrival.products?.unit_type;
    body.innerHTML = `
      <article class="card printable-sheet">
        <p class="report-period">BORDEREAU</p>
        <dl class="detail-list">
          <div><dt>Fournisseur</dt><dd>${escapeHtml(arrival.suppliers?.code || "")} — ${escapeHtml(arrival.suppliers?.name || "")}</dd></div>
          <div><dt>Produit</dt><dd>${escapeHtml(arrival.products?.name || "")}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(formatLongDateFr(arrival.arrival_date))}</dd></div>
          <div><dt>Quantité reçue</dt><dd>${arrival.quantity_received} ${escapeHtml(unitLabel(unit, arrival.quantity_received))}</dd></div>
          <div><dt>Prix unitaire fournisseur</dt><dd>${escapeHtml(formatFcfa(arrival.supplier_unit_price_fcfa))}</dd></div>
          <div><dt>Marchandise</dt><dd>${escapeHtml(formatFcfa(cost?.merchandise_value_fcfa || 0))}</dd></div>
          <div><dt>Transport</dt><dd>${escapeHtml(formatFcfa(arrival.transport_fcfa))}</dd></div>
          <div><dt>Déchargement</dt><dd>${escapeHtml(formatFcfa(arrival.unloading_fcfa))}</dd></div>
          <div><dt>Autres</dt><dd>${escapeHtml(formatFcfa(arrival.other_expenses_fcfa))}</dd></div>
          <div><dt>Coût effectif</dt><dd>${escapeHtml(formatFcfa(cost?.effective_batch_cost_fcfa || 0))}</dd></div>
          <div><dt>Coût / unité</dt><dd>${escapeHtml(formatFcfa(cost?.effective_unit_cost_fcfa || 0))}</dd></div>
          <div><dt>Avance</dt><dd>${escapeHtml(formatFcfa(arrival.advance_paid_fcfa))}</dd></div>
          <div><dt>Reste fournisseur</dt><dd>${escapeHtml(formatFcfa(outstanding))}</dd></div>
          <div><dt>Quantité vendue</dt><dd>${sold} ${escapeHtml(unitLabel(unit, sold))}</dd></div>
          <div><dt>Quantité restante</dt><dd>${remaining} ${escapeHtml(unitLabel(unit, remaining))}</dd></div>
          <div><dt>Recettes de ce lot</dt><dd>${escapeHtml(formatFcfa(revenue))}</dd></div>
          <div><dt>Marge estimée</dt><dd>${escapeHtml(formatFcfa(estimatedMargin))}</dd></div>
        </dl>
        ${arrival.note ? `<p class="tx-reason">${escapeHtml(arrival.note)}</p>` : ""}
      </article>
      <button type="button" class="btn btn-secondary btn-block" data-action="print">Imprimer / enregistrer</button>
    `;
    body.querySelector('[data-action="print"]')?.addEventListener("click", () => window.print());
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}
