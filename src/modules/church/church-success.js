import { amountHtml } from "../../components/amount.js";
import { ROUTES } from "../../router.js";
import { getChurchTransaction } from "../../services/supabase/church.js";
import { friendlyError } from "../../utils/errors.js";
import {
  CHURCH_LINKS,
  errorStateHtml,
  pageHeaderHtml,
  skeletonHtml,
} from "./church-ui.js";
import { churchOperationPath } from "./church-routes.js";

/**
 * @param {HTMLElement} root
 * @param {{ id: string }} ctx
 */
export function renderChurchSuccess(root, ctx) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title: "Enregistré",
        backHref: ROUTES.church,
      })}
      <div data-role="body">${skeletonHtml(2)}</div>
    </section>
  `;

  loadSuccess(root.querySelector('[data-role="body"]'), ctx);
}

async function loadSuccess(body, ctx) {
  if (!body) return;
  try {
    const tx = await getChurchTransaction(ctx.id);
    if (!tx) {
      body.innerHTML = errorStateHtml("L'opération enregistrée est introuvable.");
      return;
    }
    const isExpense = tx.transaction_type === "expense";
    body.innerHTML = `
      <div class="success-panel">
        <p class="success-title">
          ${isExpense ? "Sortie enregistrée" : "Entrée enregistrée"}
        </p>
        <div>${amountHtml(tx.amount_fcfa)}</div>
      </div>
      <div class="stack church-actions">
        <a class="btn btn-primary btn-block" href="#${CHURCH_LINKS.home}">
          Retour à Église
        </a>
        <a class="btn btn-ghost btn-block" href="#${churchOperationPath(tx.id)}">
          Voir l'opération
        </a>
      </div>
    `;
  } catch (err) {
    console.warn("[church] success load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}
