/**
 * Global Commerce / Église mode — single source of truth for which universe is active.
 * UI preference only. Never stores financial data.
 */

export const APP_MODES = {
  commerce: "commerce",
  church: "eglise",
};

export const ACTIVE_DOMAINS = {
  church: "church",
  business: "business",
};

const STORAGE_KEY = "mon-bilan-app-mode";
const listeners = new Set();

/** @type {string} */
let currentMode = readStoredMode();

function canUseStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

function readStoredMode() {
  try {
    if (!canUseStorage()) return APP_MODES.commerce;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === APP_MODES.church || stored === APP_MODES.commerce) return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return APP_MODES.commerce;
}

export function getAppMode() {
  return currentMode;
}

export function isChurchMode(mode = currentMode) {
  return mode === APP_MODES.church;
}

/** History / report / export domain: 'church' | 'business' */
export function getActiveDomain(mode = currentMode) {
  return modeToDomain(mode);
}

export function modeToDomain(mode) {
  return mode === APP_MODES.church ? ACTIVE_DOMAINS.church : ACTIVE_DOMAINS.business;
}

export function resolveAppMode(value) {
  return value === APP_MODES.church ? APP_MODES.church : APP_MODES.commerce;
}

/** Write / confirmation flows where switching mode would risk losing form state. */
export function isSensitiveFlowPath(path) {
  const p = String(path || "").split("?")[0];
  if (/^\/eglise\/(entree|sortie|rapprochement|succes|operation)/.test(p)) return true;
  if (/^\/commerce\/vente$/.test(p)) return true;
  if (
    /^\/commerce\/(arrivee|succes|stock\/ajustement|depenses\/nouvelle|clients\/nouveau|fournisseurs\/nouveau|produits\/nouveau)/.test(
      p,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} mode
 * @param {{ persist?: boolean, silent?: boolean }} [options]
 */
export function setAppMode(mode, options = {}) {
  const next = resolveAppMode(mode);
  if (next === currentMode && document.documentElement.dataset.mode === next) {
    return currentMode;
  }
  currentMode = next;
  applyAppMode(next);
  if (options.persist !== false) {
    try {
      if (canUseStorage()) window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  if (!options.silent) {
    listeners.forEach((fn) => fn(next));
  }
  return currentMode;
}

export function applyAppMode(mode = currentMode) {
  const resolved = resolveAppMode(mode);
  if (typeof document === "undefined") return resolved;
  document.documentElement.dataset.mode = resolved;
  const theme = resolved === APP_MODES.church ? "#5E63D8" : "#F28C28";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme);
}

export function onAppModeChange(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Sync mode from a deep-link path without wiping the user's stored preference on shared pages. */
export function syncModeFromPath(path) {
  if (String(path || "").startsWith("/eglise")) {
    setAppMode(APP_MODES.church);
    return APP_MODES.church;
  }
  if (String(path || "").startsWith("/commerce")) {
    setAppMode(APP_MODES.commerce);
    return APP_MODES.commerce;
  }
  applyAppMode(currentMode);
  return currentMode;
}
