// Reminder schedule helpers (shared between Edge Function and unit tests)

export const DEFAULT_TIMEZONE = "Africa/Douala";

export const REMINDER_TYPES = {
  churchSundayIncome: "church_sunday_income",
  churchWithdrawalCheck: "church_withdrawal_check",
  businessDaily: "business_daily",
};

export const REMINDER_MESSAGES = {
  [REMINDER_TYPES.churchSundayIncome]: {
    domain: "church",
    title: "Église",
    body: "Avez-vous enregistré les entrées de ce dimanche ?",
  },
  [REMINDER_TYPES.churchWithdrawalCheck]: {
    domain: "church",
    title: "Église",
    body: "Y a-t-il eu une sortie ou un retrait à enregistrer ?",
  },
  [REMINDER_TYPES.businessDaily]: {
    domain: "business",
    title: "Commerce",
    body: "Y a-t-il quelque chose à enregistrer pour aujourd'hui ?",
  },
};

// Phase 6 decision: every 2 days reminder cycles starting from the first enabled day.
// This keeps the schedule stable without requiring any extra DB state.
export const DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO = "2026-09-03";

export function toIsoDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDateToUTCDate(isoDate) {
  // Treat ISO date as UTC midnight; we only use it for arithmetic/dedup keys.
  const [y, m, d] = String(isoDate).split("-").map((v) => Number(v));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export function addDaysIso(isoDate, days) {
  const dt = parseIsoDateToUTCDate(isoDate);
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return toIsoDateUTC(dt);
}

export function getZonedDateParts(date, timeZone = DEFAULT_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = dtf.formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    weekdayShort: byType.weekday, // e.g. "Sun"
  };
}

export function getLocalDateISO(date, timeZone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLocalWeekdayNumber(date, timeZone = DEFAULT_TIMEZONE) {
  // Compute weekday from the extracted local date parts.
  // We construct a UTC date at local Y-M-D; weekday stays consistent.
  const parts = getZonedDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  return utcDate.getUTCDay(); // 0 = Sunday ... 6 = Saturday
}

export function isSundayOnLocalDate(date, timeZone = DEFAULT_TIMEZONE) {
  return getLocalWeekdayNumber(date, timeZone) === 0;
}

export function isAroundLocalHour(date, hour = 19, windowHours = 1, timeZone = DEFAULT_TIMEZONE) {
  const parts = getZonedDateParts(date, timeZone);
  const delta = Math.abs(parts.hour - hour);
  return delta <= windowHours;
}

export function dedupKey(reminderType, localDateISO) {
  return `${reminderType}:${localDateISO}`;
}

export function reminderTargetHashRoute(reminderType) {
  // Returned value is the app hash route without '#'.
  switch (reminderType) {
    case REMINDER_TYPES.churchSundayIncome:
      return "/eglise/entree";
    case REMINDER_TYPES.churchWithdrawalCheck:
      return "/eglise/sortie";
    case REMINDER_TYPES.businessDaily:
      return "/commerce/quick-actions";
    default:
      return "/";
  }
}

export function isFcmInvalidTokenStatus(status) {
  const s = String(status || "").toUpperCase();
  return s === "UNREGISTERED" || s === "NOT_FOUND" || s === "INVALID_ARGUMENT";
}

export function everyNDaysDue(localDateISO, intervalDays, anchorDateISO) {
  const a = parseIsoDateToUTCDate(anchorDateISO).getTime() / 86400000;
  const d = parseIsoDateToUTCDate(localDateISO).getTime() / 86400000;
  const diff = d - a;
  return diff >= 0 && diff % Number(intervalDays) === 0;
}

export function getChurchWithdrawalExpenseWindowISO(localDateISO) {
  // If the reminder runs at local day D, check if an expense exists in the last ~2 days.
  // We keep it inclusive: [D-2, D].
  return {
    fromISO: addDaysIso(localDateISO, -2),
    toISO: localDateISO,
  };
}

export function computeDueReminders({
  now,
  timezone = DEFAULT_TIMEZONE,
  preferences,
  churchIncomeRecorded,
  churchExpenseRecorded,
  withdrawalAnchorDateISO = DEFAULT_WITHDRAWAL_ANCHOR_DATE_ISO,
}) {
  const prefs = preferences || {};
  if (!Boolean(prefs.enabled)) return [];

  const localDateISO = getLocalDateISO(now, timezone);
  const due = [];

  // 1) Church Sunday income (only if today is Sunday in local time)
  if (Boolean(prefs.church_sunday_income_enabled) && isSundayOnLocalDate(now, timezone)) {
    const type = REMINDER_TYPES.churchSundayIncome;
    if (!churchIncomeRecorded) {
      due.push({
        reminderType: type,
        domain: REMINDER_MESSAGES[type].domain,
        title: REMINDER_MESSAGES[type].title,
        body: REMINDER_MESSAGES[type].body,
        targetHashRoute: reminderTargetHashRoute(type),
        dedupKey: dedupKey(type, localDateISO),
        scheduledForDateISO: localDateISO,
      });
    }
  }

  // 2) Church withdrawal/expense check (every 2 days)
  if (
    Boolean(prefs.church_withdrawal_check_enabled) &&
    everyNDaysDue(localDateISO, 2, withdrawalAnchorDateISO)
  ) {
    const type = REMINDER_TYPES.churchWithdrawalCheck;
    if (!churchExpenseRecorded) {
      due.push({
        reminderType: type,
        domain: REMINDER_MESSAGES[type].domain,
        title: REMINDER_MESSAGES[type].title,
        body: REMINDER_MESSAGES[type].body,
        targetHashRoute: reminderTargetHashRoute(type),
        dedupKey: dedupKey(type, localDateISO),
        scheduledForDateISO: localDateISO,
      });
    }
  }

  // 3) Business daily reminder
  if (Boolean(prefs.business_daily_enabled)) {
    const type = REMINDER_TYPES.businessDaily;
    due.push({
      reminderType: type,
      domain: REMINDER_MESSAGES[type].domain,
      title: REMINDER_MESSAGES[type].title,
      body: REMINDER_MESSAGES[type].body,
      targetHashRoute: reminderTargetHashRoute(type),
      dedupKey: dedupKey(type, localDateISO),
      scheduledForDateISO: localDateISO,
    });
  }

  return due;
}


