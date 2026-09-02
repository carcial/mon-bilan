const FRENCH_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Parse a date using the device calendar.
 * YYYY-MM-DD is treated as a local date to avoid UTC day-shift bugs.
 * @param {Date | string | number} [input]
 * @returns {Date | null}
 */
export function parseLocalDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input !== "string" || !input.trim()) return null;

  const trimmed = input.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date} [date]
 * @returns {'Bonjour' | 'Bonsoir'}
 */
export function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  return hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
}

/**
 * 30 août 2026
 * @param {Date | string} input
 */
export function formatLongDateFr(input) {
  const d = parseLocalDate(input);
  if (!d) return "—";
  return `${d.getDate()} ${FRENCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * 30 AUG 2026 style short boardereau header
 */
export function formatShortDateFr(input) {
  const d = parseLocalDate(input);
  if (!d) return "—";
  const months = [
    "JAN", "FÉV", "MAR", "AVR", "MAI", "JUN",
    "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * 02/09/2026
 * @param {Date | string} input
 */
export function formatNumericDateFr(input) {
  const d = parseLocalDate(input);
  if (!d) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/**
 * 2 septembre 2026, 14:32
 * @param {Date | string} input
 */
export function formatDateTimeFr(input) {
  const d = parseLocalDate(input);
  if (!d) return "—";
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${formatLongDateFr(d)}, ${hours}:${minutes}`;
}

export function toIsoDate(input = new Date()) {
  const d = parseLocalDate(input) ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(now = new Date()) {
  return toIsoDate(now);
}
