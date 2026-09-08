/**
 * Filter bottom sheet (mobile) / panel (larger screens).
 * Choice pickers stack as extra layers so they never destroy an open filter sheet.
 */

import { escapeHtml } from "../utils/errors.js";
import { iconHtml } from "./icons.js";

export function getModalRoot() {
  return document.getElementById("modal-root");
}

export function appendModalLayer(html) {
  const root = getModalRoot();
  if (!root) return null;
  const layer = document.createElement("div");
  layer.className = "modal-layer";
  layer.innerHTML = html;
  root.appendChild(layer);
  return layer;
}

export function removeModalLayer(layer) {
  layer?.remove();
}

export function isFilterBackdropDismiss(target, backdrop) {
  return Boolean(backdrop) && target === backdrop;
}

function bindVisualViewportInset(layer) {
  if (!layer || typeof window === "undefined" || !window.visualViewport) return () => {};
  const viewport = window.visualViewport;
  const sync = () => {
    const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    layer.style.setProperty("--keyboard-inset", `${covered}px`);
  };
  sync();
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
  return () => {
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    layer.style.removeProperty("--keyboard-inset");
  };
}

export function bindFilterPeriodChips(root, customValue = "custom") {
  if (!root) return;
  root.querySelectorAll("[data-draft-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute("data-draft-period") || "";
      const hidden = root.querySelector('[data-draft="period"]');
      if (hidden) hidden.value = value;
      root.querySelectorAll("[data-draft-period]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.getAttribute("data-draft-period") === value);
      });
      root.querySelector('[data-role="custom-period"]')?.classList.toggle(
        "is-hidden",
        value !== customValue,
      );
    });
  });
}

/**
 * @param {{
 *   title?: string,
 *   bodyHtml: string,
 *   applyLabel?: string,
 *   resetLabel?: string,
 *   onReset?: (layer: HTMLElement) => void,
 * }} options
 * @returns {Promise<{ status: 'apply' | 'reset' | 'dismiss', values?: Record<string, string> }>}
 */
export function openFilterSheet(options) {
  const root = getModalRoot();
  if (!root) return Promise.resolve({ status: "dismiss" });

  const {
    title = "Filtrer",
    bodyHtml,
    applyLabel = "Appliquer",
    resetLabel = "Réinitialiser",
    onReset,
  } = options;

  root.innerHTML = "";

  return new Promise((resolve) => {
    let settled = false;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let unbindViewport = () => {};

    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      unbindViewport();
      root.innerHTML = "";
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (root.querySelectorAll(".modal-layer").length > 1) return;
      finish({ status: "dismiss" });
    };

    const layer = appendModalLayer(`
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
    `);
    if (!layer) {
      resolve({ status: "dismiss" });
      return;
    }

    unbindViewport = bindVisualViewportInset(layer);

    const backdrop = layer.querySelector('[data-role="backdrop"]');
    backdrop?.addEventListener("click", (event) => {
      if (isFilterBackdropDismiss(event.target, backdrop)) finish({ status: "dismiss" });
    });
    layer.querySelector('[data-action="apply"]')?.addEventListener("click", () => {
      finish({ status: "apply", values: readFilterSheetValues(layer) });
    });
    layer.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      if (typeof onReset === "function") {
        onReset(layer);
        return;
      }
      finish({ status: "reset" });
    });
    layer.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => finish({ status: "dismiss" }));
    document.addEventListener("keydown", onKey);
  });
}

/**
 * Mobile-safe single-choice sheet. Reuses the existing filter-sheet look.
 * Stacks above an open filter sheet instead of replacing it.
 * @param {{ title?: string, options: { id: string, label: string }[], selectedId?: string }} options
 */
export function openChoiceSheet({ title = "Choisir", options = [], selectedId = "" } = {}) {
  const root = getModalRoot();
  if (!root) return Promise.resolve({ status: "dismiss" });

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

  return new Promise((resolve) => {
    let settled = false;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let unbindViewport = () => {};

    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      unbindViewport();
      removeModalLayer(layer);
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      finish({ status: "dismiss" });
    };

    const layer = appendModalLayer(`
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
    `);
    if (!layer) {
      resolve({ status: "dismiss" });
      return;
    }

    unbindViewport = bindVisualViewportInset(layer);

    const backdrop = layer.querySelector('[data-role="backdrop"]');
    backdrop?.addEventListener("click", (event) => {
      if (isFilterBackdropDismiss(event.target, backdrop)) finish({ status: "dismiss" });
    });
    layer.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => finish({ status: "dismiss" }));
    const bindOptions = () => {
      layer.querySelectorAll("[data-choice-id]").forEach((btn) => {
        btn.addEventListener("click", () => finish({ status: "apply", id: btn.getAttribute("data-choice-id") }));
      });
    };
    bindOptions();
    const search = layer.querySelector("[data-role=choice-search]");
    const list = layer.querySelector("[data-role=choice-list]");
    search?.addEventListener("input", () => {
      const q = String(search.value || "").trim().toLowerCase();
      const filtered = (options || []).filter((row) => String(row.label || "").toLowerCase().includes(q));
      if (list) list.innerHTML = choiceOptionButtons(filtered, selectedId);
      bindOptions();
    });
    document.addEventListener("keydown", onKey);
    (search || layer.querySelector("[data-choice-id]"))?.focus();
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
