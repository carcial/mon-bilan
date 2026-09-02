import { formatFcfa } from "../utils/money.js";
import { escapeHtml } from "../utils/errors.js";

/**
 * Large amount display with currency unit.
 * @param {number} amount
 * @param {{ className?: string, signed?: boolean }} [options]
 */
export function amountHtml(amount, options = {}) {
  const { className = "", signed = false } = options;
  const n = Number(amount) || 0;
  let cls = `amount ${className}`.trim();
  if (n > 0 && signed) cls += " amount-positive";
  if (n < 0) cls += " amount-negative";

  const absFormatted = formatFcfa(Math.abs(n), { showCurrency: false });
  const prefix = signed && n > 0 ? "+" : n < 0 ? "−" : "";

  return `
    <span class="${cls}">
      ${prefix}${escapeHtml(absFormatted)}
      <span class="amount-unit">FCFA</span>
    </span>
  `;
}
