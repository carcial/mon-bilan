/**
 * Money helpers — amounts are always integer FCFA.
 * Never use floating-point for FCFA accounting.
 * Formatters (formatFcfa*) are display-only and must not feed calculations.
 */

/** Largest amount accepted on forms (still a safe JS integer). */
export const MAX_FCFA_INPUT = 99_999_999_999;

/**
 * Coerce to integer FCFA.
 * Rule: truncate toward zero. Fractional FCFA is not legal tender here.
 * Never parse "35 000.5" by stripping the decimal point (that would become 350005).
 *
 * @param {unknown} value
 * @returns {number} integer FCFA (0 if invalid)
 */
export function toFcfaInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    let s = value.trim().replace(/[\s\u00A0\u202F]/g, "").replace(/FCFA/gi, "");
    if (!s || s === "-") return 0;
    const decimalMatch = s.match(/^(-?\d+)[.,](\d+)$/);
    if (decimalMatch) {
      const n = Number.parseInt(decimalMatch[1], 10);
      return Number.isFinite(n) ? n : 0;
    }
    const cleaned = s.replace(/[^\d-]/g, "");
    if (!cleaned || cleaned === "-") return 0;
    const n = Number.parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Format: 350 500 FCFA
 * @param {number} amount
 * @param {{ showCurrency?: boolean, locale?: string }} [options]
 */
export function formatFcfa(amount, options = {}) {
  const { showCurrency = true, locale = "fr-FR" } = options;
  const n = toFcfaInteger(amount);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n);
  return showCurrency ? `${formatted} FCFA` : formatted;
}

/**
 * Signed format for differences: −350 500 FCFA / +12 000 FCFA
 */
export function formatFcfaSigned(amount, options = {}) {
  const n = toFcfaInteger(amount);
  const abs = formatFcfa(Math.abs(n), options);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

/**
 * Short axis labels: 0, 100k, 1,2M. Display only — not used in calculations.
 */
export function formatFcfaCompact(amount) {
  const n = toFcfaInteger(amount);
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const rounded = millions >= 10 ? String(Math.round(millions)) : millions.toFixed(1).replace(".", ",").replace(",0", "");
    return `${sign}${rounded}M`;
  }
  if (abs >= 1000) {
    return `${sign}${Math.round(abs / 1000)}k`;
  }
  return `${sign}${abs}`;
}

export function assertNonNegativeInteger(value, label = "Montant") {
  const n = toFcfaInteger(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} invalide`);
  }
  return n;
}

export function assertPositiveInteger(value, label = "Montant") {
  const n = assertNonNegativeInteger(value, label);
  if (n <= 0) {
    throw new Error(`${label} doit être supérieur à 0`);
  }
  return n;
}
