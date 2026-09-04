import { getAuditEvents, AUDIT_PAGE_SIZE } from "../../services/supabase/audit-read.js";
import { getActiveDomain } from "../../state/app-mode.js";
import { formatAuditDetailPairs } from "../../utils/audit-format.js";
import { formatDateTimeFr } from "../../utils/dates.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { emptyStateHtml, errorStateHtml, pageHeaderHtml, skeletonHtml } from "./more-ui.js";

let offset = 0;
/** @type {object[]} */
let items = [];
let hasMore = false;

export function renderActivity(root) {
  offset = 0;
  items = [];
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        kicker: "Plus",
        title: "Journal d’activité",
        subtitle:
          getActiveDomain() === "church"
            ? "Modifications de la trésorerie, en français simple."
            : "Modifications du commerce, en français simple.",
        backHref: "/plus",
        titleId: "more-title",
      })}
      <div data-role="list">${skeletonHtml(3)}</div>
    </section>
  `;
  loadPage(root, true);
}

async function loadPage(root, reset) {
  const listEl = root.querySelector('[data-role="list"]');
  if (!listEl) return;
  if (reset) listEl.innerHTML = skeletonHtml(3);

  try {
    const page = await getAuditEvents({
      offset: reset ? 0 : offset,
      limit: AUDIT_PAGE_SIZE,
      domain: getActiveDomain(),
    });
    items = reset ? page.items : [...items, ...page.items];
    offset = items.length;
    hasMore = page.hasMore;
    renderList(listEl, root);
  } catch (err) {
    console.warn("[activity] load failed", err);
    listEl.innerHTML = errorStateHtml(friendlyError(err));
    listEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      loadPage(root, true);
    });
  }
}

function renderList(listEl, root) {
  if (!items.length) {
    listEl.innerHTML = emptyStateHtml({
      title: "Aucune activité pour le moment.",
      body: "Les modifications et suppressions apparaîtront ici.",
    });
    return;
  }

  listEl.innerHTML = `
    <div class="list-stack">
      ${items.map(activityCardHtml).join("")}
    </div>
    ${
      hasMore
        ? `<button type="button" class="btn btn-secondary btn-block history-more" data-action="more">Charger plus</button>`
        : ""
    }
  `;

  listEl.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-activity]");
      const detail = card?.querySelector("[data-detail]");
      if (!detail) return;
      const open = detail.hidden;
      detail.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Masquer le détail" : "Voir le détail";
    });
  });

  listEl.querySelector('[data-action="more"]')?.addEventListener("click", () => {
    loadPage(root, false);
  });
}

function activityCardHtml(row) {
  const formatted = row.formatted;
  const prevPairs = formatAuditDetailPairs(formatted.previousValues);
  const nextPairs = formatAuditDetailPairs(formatted.newValues);
  const detailHtml = `
    <div class="audit-detail" data-detail hidden>
      ${
        prevPairs.length
          ? `<p class="home-metric-label">Avant</p>${pairsHtml(prevPairs)}`
          : ""
      }
      ${
        nextPairs.length
          ? `<p class="home-metric-label">Après</p>${pairsHtml(nextPairs)}`
          : ""
      }
    </div>
  `;

  return `
    <article class="card history-card" data-activity="${escapeHtml(row.id)}">
      <p class="tx-date">${escapeHtml(formatDateTimeFr(row.created_at))}</p>
      <h2 class="tx-fund">${escapeHtml(formatted.title)}</h2>
      <p class="tx-reason">${escapeHtml(formatted.summary)}</p>
      ${
        prevPairs.length || nextPairs.length
          ? `<button type="button" class="btn btn-ghost audit-toggle" data-toggle aria-expanded="false">Voir le détail</button>`
          : ""
      }
      ${detailHtml}
    </article>
  `;
}

function pairsHtml(pairs) {
  return `
    <dl class="detail-list">
      ${pairs
        .map(
          (pair) => `
        <div>
          <dt>${escapeHtml(pair.label)}</dt>
          <dd class="break-text">${escapeHtml(pair.value)}</dd>
        </div>
      `,
        )
        .join("")}
    </dl>
  `;
}
