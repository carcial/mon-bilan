import { isSupabaseConfigured } from "../../config.js";
import { iconHtml } from "../../components/icons.js";
import { renderBusinessDashboard } from "../business/business-dashboard.js";
import { renderChurchDashboard } from "../church/church-dashboard.js";
import { APP_MODES, getAppMode } from "../../state/app-mode.js";

/**
 * Home is the selected-mode dashboard. Commerce and Église are never mixed here.
 *
 * @param {HTMLElement} root
 * @param {{ onChanged?: () => void }} [ctx]
 */
export function renderHomeScreen(root, ctx = {}) {
  const configured = isSupabaseConfigured();
  const mode = getAppMode();

  if (mode === APP_MODES.church) {
    renderChurchDashboard(root, { ...ctx, embedded: true });
  } else {
    renderBusinessDashboard(root, { ...ctx, embedded: true });
  }

  if (configured) return;

  const page = root.querySelector(".page");
  if (!page) return;
  page.insertAdjacentHTML(
    "afterbegin",
    `
    <div class="config-banner" role="status">
      ${iconHtml("info", { weight: "fill", size: "md" })}
      <div>
        <strong>Configuration Supabase requise</strong>
        Copiez <code>.env.example</code> vers <code>.env</code>,
        renseignez l’URL et la clé publishable, puis appliquez les migrations.
      </div>
    </div>
  `,
  );
}
