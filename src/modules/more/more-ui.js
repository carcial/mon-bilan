import { escapeHtml } from "../../utils/errors.js";
import { ROUTES } from "../../router.js";
import { MORE_PATHS } from "./more-routes.js";
import { pageHeaderHtml as sharedPageHeaderHtml, backLinkHtml } from "../../components/page-header.js";

export { backLinkHtml };

export function pageHeaderHtml(props = {}) {
  return sharedPageHeaderHtml({
    backLabel: "Retour à Plus",
    titleId: "more-title",
    ...props,
  });
}

export function skeletonHtml(lines = 3) {
  const items = Array.from({ length: lines }, (_, i) => {
    const wide = i === 0 ? " skeleton-line-lg" : "";
    return `<div class="skeleton-line${wide}"></div>`;
  }).join("");
  return `<div class="card skeleton-card" aria-hidden="true">${items}</div>`;
}

export function emptyStateHtml({ title, body }) {
  return `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </div>
  `;
}

export function errorStateHtml(message) {
  return `
    <div class="empty-state empty-state-error" role="alert">
      <h2>Impossible de charger</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary" data-action="retry">Réessayer</button>
    </div>
  `;
}

export const MORE_LINKS = {
  home: ROUTES.more,
  report: MORE_PATHS.report,
  export: MORE_PATHS.export,
  activity: MORE_PATHS.activity,
};
