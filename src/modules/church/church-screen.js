import { matchChurchRoute } from "./church-routes.js";
import { renderChurchDashboard } from "./church-dashboard.js";
import { renderChurchForm } from "./church-form.js";
import { renderChurchSuccess } from "./church-success.js";
import { renderChurchHistory } from "./church-history.js";
import { renderChurchDetail } from "./church-detail.js";
import { renderChurchReconciliation } from "./church-reconciliation.js";
import { renderChurchReport } from "./church-report.js";

/**
 * Church module dispatcher — keeps Phase 1 hash routing, adds sub-screens.
 * @param {HTMLElement} root
 * @param {{ path?: string, onChanged?: () => void }} [ctx]
 */
export function renderChurchScreen(root, ctx = {}) {
  const route = matchChurchRoute(ctx.path || "/eglise");
  const shared = { onChanged: ctx.onChanged };

  switch (route.name) {
    case "income":
      renderChurchForm(root, { ...shared, type: "income" });
      break;
    case "expense":
      renderChurchForm(root, { ...shared, type: "expense" });
      break;
    case "edit":
      renderChurchForm(root, {
        ...shared,
        type: "income",
        mode: "edit",
        id: route.id,
      });
      break;
    case "success":
      renderChurchSuccess(root, { id: route.id });
      break;
    case "history":
      renderChurchHistory(root);
      break;
    case "detail":
      renderChurchDetail(root, { ...shared, id: route.id });
      break;
    case "reconciliation":
      renderChurchReconciliation(root, shared);
      break;
    case "report":
      renderChurchReport(root);
      break;
    case "dashboard":
    default:
      renderChurchDashboard(root, shared);
      break;
  }
}

/** @deprecated Phase 1 name — kept so older imports still resolve. */
export function renderChurchPlaceholder(root, ctx) {
  renderChurchScreen(root, ctx);
}
