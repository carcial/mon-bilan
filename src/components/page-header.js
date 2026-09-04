import { escapeHtml } from "../utils/errors.js";
import { resolveBack } from "../utils/back-nav.js";
import { backChevronHtml } from "./icons.js";

export function backLinkHtml(href, label = "Retour") {
  return `
    <a class="back-link" href="#${href}">
      ${backChevronHtml()} ${escapeHtml(label)}
    </a>
  `;
}

export function pageHeaderHtml({
  kicker = "",
  title,
  subtitle,
  backHref,
  backLabel = "Retour",
  titleId = "page-title",
} = {}) {
  const back = backHref ? resolveBack(backHref, backLabel) : null;
  return `
    <header class="page-header">
      ${back ? backLinkHtml(back.href, back.label) : ""}
      ${kicker ? `<p class="page-kicker">${escapeHtml(kicker)}</p>` : ""}
      <h1 class="page-title" id="${escapeHtml(titleId)}">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </header>
  `;
}
