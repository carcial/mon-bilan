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

  const fr = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const APP_TIMEZONE = "Africa/Douala";

/**
 * Hour 0–23 in a named timezone. Defaults to Cameroon business time.
 */
export function hourInTimeZone(date = new Date(), timeZone = APP_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isFinite(hour) ? hour : date.getHours();
  } catch {
    return date.getHours();
  }
}

/**
 * @param {Date} [date]
 * @param {string} [timeZone]
 * @returns {'Bonjour' | 'Bonsoir'}
 */
export function greetingForNow(date = new Date(), timeZone = APP_TIMEZONE) {
  const hour = hourInTimeZone(date, timeZone);
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
 * Canonical user-facing date: 03/09/2026
 * @param {Date | string} input
 */
export function formatNumericDateFr(input) {
  const d = parseLocalDate(input);
  if (!d) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Alias used by UI — always DD/MM/YYYY. */
export const displayDateFr = formatNumericDateFr;

/**
 * @param {string} text
 * @returns {string | null} YYYY-MM-DD
 */
export function parseNumericDateFr(text) {
  const d = parseLocalDate(text);
  return d ? toIsoDate(d) : null;
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
  return `${formatNumericDateFr(d)}, ${hours}:${minutes}`;
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

/** "Aujourd'hui" / "Hier" / DD/MM/YYYY — display only. */
export function relativeDayLabel(input, now = new Date()) {
  const iso = typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)
    ? input.slice(0, 10)
    : toIsoDate(input);
  const today = todayIso(now);
  if (iso === today) return "Aujourd'hui";
  const ref = parseLocalDate(now) ?? new Date();
  const yesterdayDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (iso === toIsoDate(yesterdayDate)) return "Hier";
  return formatNumericDateFr(iso);
}

/** Compact relative clock for list rows. Falls back to the day label. */
export function relativeTimeLabel(input, now = new Date()) {
  const d = parseLocalDate(input);
  if (!d) return relativeDayLabel(input, now);
  const diffMs = now.getTime() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return relativeDayLabel(input, now);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && todayIso(d) === todayIso(now)) {
    return hours === 1 ? "Il y a 1 h" : `Il y a ${hours} h`;
  }
  return relativeDayLabel(input, now);
}
