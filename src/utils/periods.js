/**
 * Centralized period helpers — Monday-start weeks, device-local dates.
 */

import { parseLocalDate, toIsoDate } from "./dates.js";

export const PERIODS = {
  today: "today",
  week: "week",
  month: "month",
  year: "year",
  custom: "custom",
  all: "all",
};

export function startOfLocalDay(input = new Date()) {
  const d = parseLocalDate(input) ?? new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-start week (ISO-like, local calendar). */
export function startOfWeekMonday(input = new Date()) {
  const d = startOfLocalDay(input);
  const weekday = d.getDay(); // 0 = Sunday
  const offset = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + offset);
  return d;
}

export function endOfWeekSunday(input = new Date()) {
  const start = startOfWeekMonday(input);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

export function startOfMonth(input = new Date()) {
  const d = startOfLocalDay(input);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(input = new Date()) {
  const d = startOfLocalDay(input);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function startOfYear(input = new Date()) {
  const d = startOfLocalDay(input);
  return new Date(d.getFullYear(), 0, 1);
}

export function endOfYear(input = new Date()) {
  const d = startOfLocalDay(input);
  return new Date(d.getFullYear(), 11, 31);
}

/**
 * @param {string} period
 * @param {{ from?: string | null, to?: string | null, now?: Date }} [options]
 * @returns {{ from: string | null, to: string | null }}
 */
export function getPeriodRange(period, options = {}) {
  const now = options.now ?? new Date();

  switch (period) {
    case PERIODS.today:
      return { from: toIsoDate(now), to: toIsoDate(now) };
    case PERIODS.week:
      return {
        from: toIsoDate(startOfWeekMonday(now)),
        to: toIsoDate(endOfWeekSunday(now)),
      };
    case PERIODS.month:
      return {
        from: toIsoDate(startOfMonth(now)),
        to: toIsoDate(endOfMonth(now)),
      };
    case PERIODS.year:
      return {
        from: toIsoDate(startOfYear(now)),
        to: toIsoDate(endOfYear(now)),
      };
    case PERIODS.custom:
      return {
        from: options.from || null,
        to: options.to || null,
      };
    case PERIODS.all:
    default:
      return { from: null, to: null };
  }
}

/**
 * Inclusive YYYY-MM-DD comparison (lexicographic, local calendar strings).
 * @param {string} dateIso
 * @param {string | null} from
 * @param {string | null} to
 */
export function isDateInRange(dateIso, from, to) {
  if (!dateIso) return false;
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

export function periodLabelFr(period, options = {}) {
  const now = options.now ?? new Date();
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];

  switch (period) {
    case PERIODS.today:
      return "Aujourd'hui";
    case PERIODS.week:
      return "Cette semaine";
    case PERIODS.month:
      return `${months[now.getMonth()]} ${now.getFullYear()}`.toUpperCase();
    case PERIODS.year:
      return String(now.getFullYear());
    case PERIODS.custom: {
      const from = options.from;
      const to = options.to;
      if (from && to) return `${from} → ${to}`;
      return "Période personnalisée";
    }
    default:
      return "Toutes les périodes";
  }
}

export function monthTitleFr(input = new Date()) {
  const d = parseLocalDate(input) ?? new Date();
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`.toUpperCase();
}
