import { amountHtml } from "../../components/amount.js";
import { greetingForNow } from "../../utils/dates.js";
import { isSupabaseConfigured } from "../../config.js";
import { ROUTES } from "../../router.js";

/**
 * Home screen — two separate financial universes (Church / Business).
 *
 * @param {HTMLElement} root
 * @param {{ churchBalance?: number | null, businessResult?: number | null }} [data]
 */
export function renderHomeScreen(root, data = {}) {
  const greeting = greetingForNow();
  const churchBalance = data.churchBalance ?? null;
  const businessResult = data.businessResult ?? null;
  const configured = isSupabaseConfigured();

  root.innerHTML = `
    <section class="page home-page" aria-labelledby="home-title">
      ${
        configured
          ? ""
          : `
        <div class="config-banner" role="status">
          <span aria-hidden="true">ℹ</span>
          <div>
            <strong>Configuration Supabase requise</strong>
            Copiez <code>.env.example</code> vers <code>.env</code>,
            renseignez l’URL et la clé publishable, puis appliquez les migrations.
          </div>
        </div>
      `
      }

      <header class="home-greeting">
        <h1 id="home-title">${greeting}</h1>
        <p>Que voulez-vous faire ?</p>
      </header>

      <div class="home-cards stack">
        <article class="card card-accent-church">
          <div class="card-icon" aria-hidden="true">⛪</div>
          <h2 class="card-label">Église</h2>
          <p class="card-meta">Trésorerie des caisses (hors commerce)</p>

          <p class="home-metric-label">Solde Église actuel</p>
          <div class="home-metric-value">
            ${
              churchBalance === null
                ? `<span class="amount amount-sm">— <span class="amount-unit">FCFA</span></span>`
                : amountHtml(churchBalance)
            }
          </div>

          <div class="actions-grid">
            <a class="btn btn-secondary" href="#${ROUTES.church}/entree">+ Entrée</a>
            <a class="btn btn-secondary" href="#${ROUTES.church}/sortie">− Sortie</a>
            <a class="btn btn-primary btn-wide" href="#${ROUTES.church}">Voir le rapport</a>
          </div>
        </article>

        <article class="card card-accent-business">
          <div class="card-icon" aria-hidden="true">🛒</div>
          <h2 class="card-label">Commerce</h2>
          <p class="card-meta">Ventes, stock et créditeurs (hors église)</p>

          <p class="home-metric-label">Résultat du mois</p>
          <div class="home-metric-value">
            ${
              businessResult === null
                ? `<span class="amount amount-sm">— <span class="amount-unit">FCFA</span></span>`
                : amountHtml(businessResult, { signed: true })
            }
          </div>

          <div class="actions-grid">
            <a class="btn btn-secondary" href="#${ROUTES.business}/vente">Nouvelle vente</a>
            <a class="btn btn-secondary" href="#${ROUTES.business}/arrivee">Nouvelle arrivée</a>
            <a class="btn btn-primary btn-wide" href="#${ROUTES.business}">Voir le commerce</a>
          </div>
        </article>
      </div>
    </section>
  `;
}
