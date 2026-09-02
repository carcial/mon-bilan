/**
 * Money helpers — amounts are always integer FCFA.
 * Never use floating-point for FCFA accounting.
 */

/**
 * @param {unknown} value
 * @returns {number} integer FCFA (0 if invalid)
 */
export function toFcfaInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace(/[^\d-]/g, "");
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
