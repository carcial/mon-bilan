import { amountHtml } from "../../components/amount.js";
import { navigate } from "../../router.js";
import { getChurchBalances } from "../../services/supabase/church.js";
import { isSupabaseConfigured } from "../../config.js";
import { friendlyError } from "../../utils/errors.js";
import { escapeHtml } from "../../utils/errors.js";
import {
  CHURCH_LINKS,
  emptyStateHtml,
  errorStateHtml,
  fundName,
  skeletonHtml,
} from "./church-ui.js";

/**
 * @param {HTMLElement} root
 * @param {{ onChanged?: () => void }} [ctx]
 */
export function renderChurchDashboard(root, ctx = {}) {
  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      <header class="page-header">
        <p class="page-kicker">Trésorerie</p>
        <h1 class="page-title" id="church-title">Église</h1>
      </header>
      ${
        isSupabaseConfigured()
          ? `<div data-role="body">${skeletonHtml(2)}${skeletonHtml(2)}</div>`
          : `
        <div class="config-banner" role="status">
          <span aria-hidden="true">ℹ</span>
          <div>
            <strong>Configuration requise</strong>
            Connectez Supabase pour voir les soldes et enregistrer des opérations.
          </div>
        </div>
        ${emptyStateHtml({
          title: "Aucune donnée pour le moment.",
          body: "Les soldes apparaîtront une fois la base connectée.",
        })}
      `
      }
    </section>
  `;

  if (!isSupabaseConfigured()) return;

  const body = root.querySelector('[data-role="body"]');
  loadDashboard(body, ctx);
}

async function loadDashboard(body, ctx) {
  if (!body) return;
  try {
    const { funds, total } = await getChurchBalances();
    body.innerHTML = dashboardHtml({ funds, total });
    bindDashboard(body, ctx);
  } catch (err) {
    console.warn("[church] dashboard load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = `${skeletonHtml(2)}${skeletonHtml(2)}`;
      loadDashboard(body, ctx);
    });
  }
}

function dashboardHtml({ funds, total }) {
  const fundCards = funds.length
    ? funds
        .map(
          (fund) => `
        <article class="card fund-card">
          <p class="home-metric-label">${escapeHtml(caisseLabel(fund))}</p>
          <div class="home-metric-value">
            ${amountHtml(fund.balance, { className: "amount-sm" })}
          </div>
        </article>
      `,
        )
        .join("")
    : emptyStateHtml({
        title: "Aucune caisse active.",
        body: "Les caisses de l’église n’ont pas encore été configurées.",
      });

  return `
    <article class="card card-accent-church church-total-card">
      <p class="home-metric-label">Solde total</p>
      <div class="home-metric-value">
        ${amountHtml(total)}
      </div>
    </article>

    <div class="fund-grid">
      ${fundCards}
    </div>

    <div class="stack church-actions">
      <a class="btn btn-primary btn-block" href="#${CHURCH_LINKS.income}">
        <span aria-hidden="true">+</span> Ajouter une entrée
      </a>
      <a class="btn btn-secondary btn-block" href="#${CHURCH_LINKS.expense}">
        <span aria-hidden="true">−</span> Ajouter une sortie
      </a>
      <a class="btn btn-ghost btn-block" href="#${CHURCH_LINKS.reconciliation}">
        Rapprocher la caisse
      </a>
      <a class="btn btn-ghost btn-block" href="#${CHURCH_LINKS.history}">
        Voir l'historique
      </a>
      <a class="btn btn-ghost btn-block" href="#${CHURCH_LINKS.report}">
        Voir le rapport
      </a>
    </div>
  `;
}

function caisseLabel(fund) {
  const name = fundName(fund);
  if (/^caisse\b/i.test(name)) return name;
  return `Caisse ${name.toLowerCase()}`;
}

function bindDashboard(body, ctx) {
  body.querySelectorAll("a[href^='#']").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("#")) return;
      event.preventDefault();
      navigate(href.slice(1));
    });
  });
}
