import { amountHtml } from "../../components/amount.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  deleteChurchTransaction,
  getChurchTransaction,
} from "../../services/supabase/church.js";
import { formatDateTimeFr, formatLongDateFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import {
  errorStateHtml,
  fundName,
  noteIndicatorHtml,
  pageHeaderHtml,
  skeletonHtml,
  typeBadgeHtml,
  typeLabel,
} from "./church-ui.js";
import { churchEditPath } from "./church-routes.js";

/**
 * @param {HTMLElement} root
 * @param {{ id: string, onChanged?: () => void }} ctx
 */
export function renderChurchDetail(root, ctx) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title: "Opération",
        backHref: ROUTES.churchHistory,
        backLabel: "Retour à l'historique",
      })}
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;

  loadDetail(root.querySelector('[data-role="body"]'), ctx);
}

async function loadDetail(body, ctx) {
  if (!body) return;
  try {
    const tx = await getChurchTransaction(ctx.id);
    if (!tx) {
      body.innerHTML = errorStateHtml("Cette opération est introuvable.");
      return;
    }
    body.innerHTML = detailHtml(tx);
    bindDetail(body, tx, ctx);
  } catch (err) {
    console.warn("[church] detail load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadDetail(body, ctx);
    });
  }
}

function detailHtml(tx) {
  const isExpense = tx.transaction_type === "expense";
  return `
    <article class="card">
      <div class="tx-card-top">
        ${typeBadgeHtml(tx.transaction_type)}
        ${noteIndicatorHtml(tx.note)}
      </div>
      <div class="${isExpense ? "amount-negative" : ""}">
        ${amountHtml(tx.amount_fcfa)}
      </div>
      <dl class="detail-list">
        <div>
          <dt>Type</dt>
          <dd>${escapeHtml(typeLabel(tx.transaction_type))}</dd>
        </div>
        <div>
          <dt>Caisse</dt>
          <dd>${escapeHtml(fundName(tx.church_funds))}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>${escapeHtml(formatLongDateFr(tx.transaction_date))}</dd>
        </div>
        <div>
          <dt>Motif</dt>
          <dd>${escapeHtml(tx.reason)}</dd>
        </div>
        <div>
          <dt>Note</dt>
          <dd>${escapeHtml(tx.note?.trim() || "—")}</dd>
        </div>
        <div>
          <dt>Enregistrée le</dt>
          <dd>${escapeHtml(formatDateTimeFr(tx.created_at))}</dd>
        </div>
      </dl>
    </article>

    <div class="stack church-actions">
      <button type="button" class="btn btn-secondary btn-block" data-action="edit">
        Modifier
      </button>
      <button type="button" class="btn btn-danger btn-block" data-action="delete">
        Supprimer
      </button>
    </div>
  `;
}

function bindDetail(body, tx, ctx) {
  body.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
    navigate(churchEditPath(tx.id));
  });

  body.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
    const result = await confirmAndWrite(
      {
        title: "SUPPRIMER CETTE OPÉRATION ?",
        amountHtml: amountHtml(tx.amount_fcfa),
        extraHtml: `
          <div class="warning-box" role="alert">
            <p>Cette action modifiera le solde de la caisse.</p>
          </div>
        `,
        rows: [
          { label: "Caisse", value: fundName(tx.church_funds) },
          { label: "Motif", value: tx.reason },
          { label: "Date", value: formatLongDateFr(tx.transaction_date) },
        ],
        confirmLabel: "Supprimer définitivement",
        cancelLabel: "Annuler",
        danger: true,
      },
      async () => deleteChurchTransaction(tx.id),
    );

    if (result.status === "confirm") {
      ctx.onChanged?.();
      navigate(ROUTES.churchHistory);
    }
  });
}
