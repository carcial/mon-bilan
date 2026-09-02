/**
 * Confirmation modal — required before any financial write (Phase 2+).
 *
 * Flow:
 *   form → local validate → confirmAndWrite(writeFn) → exactly one DB write
 *
 * The confirm button stays disabled while writeFn is pending to prevent duplicates.
 */

import { escapeHtml, friendlyError } from "../utils/errors.js";

/**
 * @param {{
 *   title: string,
 *   amountHtml?: string,
 *   extraHtml?: string,
 *   rows?: Array<{ label: string, value: string }>,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} options
 * @returns {Promise<'confirm' | 'edit' | 'dismiss'>}
 */
export function openConfirm(options) {
  return confirmAndWrite(options, null).then((result) => result.status);
}

/**
 * Preferred API for financial writes.
 * @template T
 * @param {{
 *   title: string,
 *   amountHtml?: string,
 *   extraHtml?: string,
 *   rows?: Array<{ label: string, value: string }>,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} options
 * @param {(() => Promise<T>) | null} writeFn
 * @returns {Promise<{ status: 'confirm' | 'edit' | 'dismiss' | 'error', data?: T, error?: string }>}
 */
export function confirmAndWrite(options, writeFn) {
  const root = document.getElementById("modal-root");
  if (!root) return Promise.resolve({ status: "dismiss" });

  const {
    title,
    amountHtml = "",
    extraHtml = "",
    rows = [],
    confirmLabel = "Confirmer et enregistrer",
    cancelLabel = "Modifier",
    danger = false,
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    let pending = false;

    const onKey = (event) => {
      if (event.key === "Escape" && !pending) {
        finish({ status: "dismiss" });
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [...sheet.querySelectorAll("button, [href], input, select, textarea")]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const rowsHtml = rows
      .map(
        (row) => `
        <div class="row-between" style="padding:0.5rem 0;border-bottom:1px solid var(--color-border)">
          <span style="color:var(--color-text-secondary)">${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </div>`,
      )
      .join("");

    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop" role="presentation">
        <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h2 id="confirm-title" class="page-title" style="font-size:var(--text-xl)">${escapeHtml(title)}</h2>
          ${amountHtml ? `<div class="confirm-amount">${amountHtml}</div>` : ""}
          ${extraHtml ? `<div class="confirm-extra">${extraHtml}</div>` : ""}
          <div class="stack-sm confirm-rows">${rowsHtml}</div>
          <p class="sr-only" data-role="status" aria-live="polite"></p>
          <p data-role="error" hidden style="color:var(--color-negative);margin-bottom:1rem;font-weight:600"></p>
          <div class="stack-sm">
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"} btn-block" data-action="confirm">${escapeHtml(confirmLabel)}</button>
            <button type="button" class="btn btn-ghost btn-block" data-action="edit">${escapeHtml(cancelLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const backdrop = root.querySelector('[data-role="backdrop"]');
    const sheet = root.querySelector(".modal-sheet");
    const confirmBtn = root.querySelector('[data-action="confirm"]');
    const editBtn = root.querySelector('[data-action="edit"]');
    const errorEl = root.querySelector('[data-role="error"]');
    const statusEl = root.querySelector('[data-role="status"]');
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const setPending = (value) => {
      pending = value;
      if (confirmBtn) {
        confirmBtn.disabled = value;
        confirmBtn.textContent = value ? "Enregistrement…" : confirmLabel;
      }
      if (editBtn) editBtn.disabled = value;
      if (statusEl) statusEl.textContent = value ? "Enregistrement en cours" : "";
    };

    confirmBtn?.addEventListener("click", async () => {
      if (pending || settled) return;

      if (typeof writeFn !== "function") {
        confirmBtn.disabled = true;
        finish({ status: "confirm" });
        return;
      }

      setPending(true);
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = "";
      }

      try {
        const data = await writeFn();
        finish({ status: "confirm", data });
      } catch (err) {
        setPending(false);
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = friendlyError(err);
        }
      }
    });

    editBtn?.addEventListener("click", () => {
      if (pending) return;
      finish({ status: "edit" });
    });

    backdrop?.addEventListener("click", (e) => {
      if (pending) return;
      if (e.target === backdrop) finish({ status: "dismiss" });
    });

    document.addEventListener("keydown", onKey);
    confirmBtn?.focus();
  });
}
