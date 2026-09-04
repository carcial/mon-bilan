import { ROUTES } from "../../router.js";
import { iconHtml } from "../../components/icons.js";
import { getActiveDomain } from "../../state/app-mode.js";
import { matchMoreRoute, MORE_PATHS } from "./more-routes.js";
import { pageHeaderHtml } from "./more-ui.js";
import { renderGlobalReport } from "./more-reports.js";
import { renderExcelExport } from "./more-export.js";
import { renderActivity } from "./more-activity.js";
import { renderMoreRappels } from "./more-rappels.js";

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
    case "rappels":
      renderMoreRappels(root);
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
  const church = getActiveDomain() === "church";
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        title: "Plus",
        subtitle: "Export, journal d’activité et informations.",
        titleId: "more-title",
      })}

      <nav class="more-menu stack" aria-label="Actions supplémentaires">
        <a class="card more-link" href="#${MORE_PATHS.rappels}">
          <span class="card-icon">${iconHtml("bell", { weight: "bold", size: "lg" })}</span>
          <span>
            <strong>Rappels</strong>
            <span class="card-meta">Notifications de l’église et du commerce</span>
          </span>
        </a>
        <a class="card more-link" href="#${MORE_PATHS.export}">
          <span class="card-icon">${iconHtml("microsoft-excel-logo", { weight: "bold", size: "lg" })}</span>
          <span>
            <strong>Exporter Excel</strong>
            <span class="card-meta">${church ? "Télécharger le classeur de la trésorerie" : "Télécharger le classeur du commerce"}</span>
          </span>
        </a>
        <a class="card more-link" href="#${MORE_PATHS.activity}">
          <span class="card-icon">${iconHtml("clock-counter-clockwise", { weight: "bold", size: "lg" })}</span>
          <span>
            <strong>Journal d’activité</strong>
            <span class="card-meta">${church ? "Modifications de la trésorerie" : "Modifications du commerce"}</span>
          </span>
        </a>
      </nav>

      <article class="card">
        <h2 class="section-title" style="margin-top:0">À propos</h2>
        <p class="card-meta">
          Mon Bilan s’installe sur l’écran d’accueil. Les écritures ont besoin d’une connexion.
          Si le réseau est coupé, l’écran peut s’ouvrir, mais rien n’est enregistré hors ligne.
        </p>
      </article>
    </section>
  `;
}

