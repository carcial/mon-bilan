import { iconHtml } from "../../components/icons.js";
import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";
import {
  BUSINESS_LINKS,
  pageHeaderHtml,
} from "./business-ui.js";

function actionTile(href, icon, label) {
  return `
    <a class="action-card" href="#${href}">
      <span class="action-card-icon">${iconHtml(icon, { weight: "bold", size: "md" })}</span>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

export function renderBusinessQuickActions(root) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="quick-actions-title">
      ${pageHeaderHtml({
        kicker: "Commerce",
        title: "Qu'est-ce que je veux enregistrer ?",
        subtitle: "Choisissez une action",
        backHref: ROUTES.business,
        backLabel: "Retour au commerce",
      })}

      <div class="section-block" style="margin-top:0">
        <h2 class="section-title">Actions rapides</h2>
        <div class="actions-grid-4" style="margin-top:1rem">
          ${actionTile(BUSINESS_LINKS.sale, "receipt", "Nouvelle vente")}
          ${actionTile(BUSINESS_LINKS.arrival, "truck", "Nouvel arrivage")}
          ${actionTile(BUSINESS_LINKS.expenses, "wallet", "Dépense")}
          ${actionTile(BUSINESS_LINKS.receivables, "hand-coins", "Paiement client")}
          ${actionTile(BUSINESS_LINKS.payables, "credit-card", "Paiement fournisseur")}
          ${actionTile(BUSINESS_LINKS.sale, "handshake", "Crédit / prêt")}
          ${actionTile(BUSINESS_LINKS.home, "circle-dashed", "Rien aujourd'hui")}
        </div>
      </div>
    </section>
  `;
}

