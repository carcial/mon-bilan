import { ROUTES } from "../../router.js";
import { matchMoreRoute, MORE_PATHS } from "./more-routes.js";
import { pageHeaderHtml } from "./more-ui.js";
import { renderGlobalReport } from "./more-reports.js";
import { renderExcelExport } from "./more-export.js";
import { renderActivity } from "./more-activity.js";

export function renderMoreScreen(root, ctx = {}) {
  const match = matchMoreRoute(ctx.path || ROUTES.more);

  switch (match.name) {
    case "report":
      renderGlobalReport(root);
      return;
    case "export":
      renderExcelExport(root);
      return;
    case "activity":
      renderActivity(root);
      return;
    case "menu":
    default:
      renderMoreMenu(root);
  }
}

/** @deprecated Use renderMoreScreen */
export function renderMorePlaceholder(root, ctx) {
  renderMoreScreen(root, ctx);
}

function renderMoreMenu(root) {
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        kicker: "Paramètres",
        title: "Plus",
        subtitle: "Rapports, export Excel et journal d’activité. Pas de compte, pas de mot de passe.",
        titleId: "more-title",
      })}

      <nav class="more-menu stack" aria-label="Actions supplémentaires">
        <a class="card more-link" href="#${MORE_PATHS.report}">
          <span class="card-icon" aria-hidden="true">▤</span>
          <span>
            <strong>Rapport</strong>
            <span class="card-meta">Église et Commerce, période par période</span>
          </span>
        </a>
        <a class="card more-link" href="#${MORE_PATHS.export}">
          <span class="card-icon" aria-hidden="true">⇩</span>
          <span>
            <strong>Exporter Excel</strong>
            <span class="card-meta">Classeur .xlsx pour Microsoft Excel</span>
          </span>
        </a>
        <a class="card more-link" href="#${MORE_PATHS.activity}">
          <span class="card-icon" aria-hidden="true">◷</span>
          <span>
            <strong>Activité</strong>
            <span class="card-meta">Modifications et suppressions</span>
          </span>
        </a>
      </nav>

      <article class="card">
        <h2 class="section-title" style="margin-top:0">Application</h2>
        <p class="card-meta">
          Mon Bilan s’installe sur l’écran d’accueil. Les écritures ont besoin d’une connexion.
          Si le réseau est coupé, l’écran peut s’ouvrir, mais rien n’est enregistré hors ligne.
        </p>
      </article>
    </section>
  `;
}
