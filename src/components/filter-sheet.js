/**
 * Filter bottom sheet (mobile) / panel (larger screens).
 */

import { escapeHtml } from "../utils/errors.js";
import { iconHtml } from "./icons.js";

/**
 * @param {{
 *   title?: string,
 *   bodyHtml: string,
 *   applyLabel?: string,
 *   resetLabel?: string,
 * }} options
 * @returns {Promise<{ status: 'apply' | 'reset' | 'dismiss', values?: Record<string, string> }>}
 */
export function openFilterSheet(options) {
  const root = document.getElementById("modal-root");
  if (!root) return Promise.resolve({ status: "dismiss" });

  const {
    title = "Filtrer",
    bodyHtml,
    applyLabel = "Appliquer",
    resetLabel = "Réinitialiser",
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = (event) => {
      if (event.key === "Escape") finish({ status: "dismiss" });
    };

    root.innerHTML = `
      <div class="modal-backdrop filter-sheet-backdrop" data-role="backdrop" role="presentation">
        <div class="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title">
          <div class="filter-sheet-handle" aria-hidden="true"></div>
          <header class="filter-sheet-header">
            <h2 id="filter-sheet-title">${escapeHtml(title)}</h2>
            <button type="button" class="btn btn-ghost filter-sheet-close" data-action="dismiss" aria-label="Fermer">
              ${iconHtml("x", { weight: "bold", size: "md" })}
            </button>
          </header>
          <div class="filter-sheet-body" data-role="filter-body">
            ${bodyHtml}
          </div>
          <div class="filter-sheet-actions">
            <button type="button" class="btn btn-primary btn-block" data-action="apply">${escapeHtml(applyLabel)}</button>
            <button type="button" class="btn btn-ghost btn-block" data-action="reset">${escapeHtml(resetLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const backdrop = root.querySelector('[data-role="backdrop"]');
    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) finish({ status: "dismiss" });
    });
    root.querySelector('[data-action="apply"]')?.addEventListener("click", () => {
      finish({ status: "apply", values: readFilterSheetValues(root) });
    });
    root.querySelector('[data-action="reset"]')?.addEventListener("click", () => finish({ status: "reset" }));
    root.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => finish({ status: "dismiss" }));
    document.addEventListener("keydown", onKey);
    root.querySelector('[data-action="apply"]')?.focus();
  });
}

/**
 * Mobile-safe single-choice sheet. Reuses the existing filter-sheet look.
 * @param {{ title?: string, options: { id: string, label: string }[], selectedId?: string }} options
 */
export function openChoiceSheet({ title = "Choisir", options = [], selectedId = "" } = {}) {
  const searchable = (options || []).length > 6;
  const bodyHtml = `
    ${
      searchable
        ? `<label class="sr-only" for="choice-sheet-search">Rechercher</label>
           <input id="choice-sheet-search" class="field-input" type="search" placeholder="Rechercher" data-role="choice-search" />`
        : ""
    }
    <div class="choice-sheet-list" role="listbox" aria-label="${escapeHtml(title)}" data-role="choice-list">
      ${choiceOptionButtons(options, selectedId)}
    </div>
  `;
  const root = document.getElementById("modal-root");
  if (!root) return Promise.resolve({ status: "dismiss" });

  return new Promise((resolve) => {
    let settled = false;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === "Escape") finish({ status: "dismiss" });
    };

    root.innerHTML = `
      <div class="modal-backdrop filter-sheet-backdrop" data-role="backdrop" role="presentation">
        <div class="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="choice-sheet-title">
          <div class="filter-sheet-handle" aria-hidden="true"></div>
          <header class="filter-sheet-header">
            <h2 id="choice-sheet-title">${escapeHtml(title)}</h2>
            <button type="button" class="btn btn-ghost filter-sheet-close" data-action="dismiss" aria-label="Fermer">
              ${iconHtml("x", { weight: "bold", size: "md" })}
            </button>
          </header>
          <div class="filter-sheet-body">${bodyHtml}</div>
        </div>
      </div>
    `;

    root.querySelector('[data-role="backdrop"]')?.addEventListener("click", (event) => {
      if (event.target === root.querySelector('[data-role="backdrop"]')) finish({ status: "dismiss" });
    });
    root.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => finish({ status: "dismiss" }));
    const bindOptions = () => {
      root.querySelectorAll("[data-choice-id]").forEach((btn) => {
        btn.addEventListener("click", () => finish({ status: "apply", id: btn.getAttribute("data-choice-id") }));
      });
    };
    bindOptions();
    const search = root.querySelector("[data-role=choice-search]");
    const list = root.querySelector("[data-role=choice-list]");
    search?.addEventListener("input", () => {
      const q = String(search.value || "").trim().toLowerCase();
      const filtered = (options || []).filter((row) => String(row.label || "").toLowerCase().includes(q));
      if (list) list.innerHTML = choiceOptionButtons(filtered, selectedId);
      bindOptions();
    });
    document.addEventListener("keydown", onKey);
    (search || root.querySelector("[data-choice-id]"))?.focus();
  });
}

function choiceOptionButtons(options, selectedId) {
  return (options || [])
    .map((row) => {
      const active = String(row.id) === String(selectedId);
      return `
        <button type="button" class="choice-sheet-option${active ? " is-active" : ""}" data-choice-id="${escapeHtml(String(row.id))}" role="option" aria-selected="${active}">
          ${escapeHtml(row.label)}
        </button>
      `;
    })
    .join("");
}

export function readFilterSheetValues(root = document.getElementById("modal-root")) {
  if (!root) return {};
  /** @type {Record<string, string>} */
  const values = {};
  root.querySelectorAll("[data-draft]").forEach((el) => {
    const key = el.getAttribute("data-draft");
    if (key) values[key] = el.value;
  });
  return values;
}
