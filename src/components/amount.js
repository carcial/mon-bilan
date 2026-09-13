import { formatFcfa } from "../utils/money.js";
import { escapeHtml } from "../utils/errors.js";

/**
 * Large amount display with currency unit.
 * `tone` is display-only: use transaction type (in/out), never infer from label text.
 * @param {number} amount
 * @param {{ className?: string, signed?: boolean, tone?: 'in' | 'out' | null }} [options]
 */
export function amountHtml(amount, options = {}) {
  const { className = "", signed = false, tone = null } = options;
  const n = Number(amount) || 0;
  let cls = `amount ${className}`.trim();
  const isOut = tone === "out" || (tone == null && n < 0);
  const isIn = tone === "in" || (tone == null && signed && n > 0);
  if (isIn) cls += " amount-positive";
  if (isOut) cls += " amount-negative";

  const absFormatted = formatFcfa(Math.abs(n), { showCurrency: false });
  const prefix = isOut ? "−" : (signed || tone === "in") && isIn ? "+" : "";

  return `
    <span class="${cls}">
      ${prefix}${escapeHtml(absFormatted)}
      <span class="amount-unit">FCFA</span>
    </span>
  `;
}
