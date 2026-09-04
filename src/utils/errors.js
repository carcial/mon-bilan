/**
 * Escape text for safe HTML insertion.
 * @param {unknown} value
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TECHNICAL_MARKERS = [
  "pgrst",
  "postgrest",
  "json object requested",
  "permission denied",
  "violates",
  "failed to fetch",
  "networkerror",
  "jwt",
  "api key",
  "row-level",
  "23505",
  "23514",
  "23503",
  "22p02",
  "code:",
  "details:",
  "hint:",
];

function looksLikeUserMessage(message) {
  const trimmed = String(message || "").trim();
  if (!trimmed || trimmed.length > 220) return false;
  if (/[{};<>]|https?:\/\//.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (TECHNICAL_MARKERS.some((marker) => lower.includes(marker))) return false;
  return /[àâäéèêëïîôùûüçœ]/i.test(trimmed) || /[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(trimmed[0] || "");
}

/**
 * Map technical errors to user-friendly French messages.
 * Application-thrown French copy is kept as-is.
 * @param {unknown} error
 */
export function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "Connexion indisponible. L'opération n'a pas été enregistrée.";
  }
  if (lower.includes("jwt") || lower.includes("api key")) {
    return "Configuration Supabase incomplète. Vérifiez l’URL et la clé publique.";
  }
  if (lower.includes("quantité insuffisante") || lower.includes("stock insuffisant")) {
    return "Stock insuffisant. La vente n'a pas été enregistrée.";
  }
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("23505")) {
    return "Cet enregistrement existe déjà.";
  }
  if (lower.includes("permission") || lower.includes("rls") || lower.includes("row-level")) {
    return "Accès refusé par la base de données. Vérifiez les politiques d’accès.";
  }
  if (looksLikeUserMessage(message)) {
    return message.trim();
  }
  if (lower.includes("check") || lower.includes("constraint") || lower.includes("23514")) {
    return "Les données saisies ne sont pas valides.";
  }

  return "Une erreur est survenue. Réessayez dans un moment.";
}
