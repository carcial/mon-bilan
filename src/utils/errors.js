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

/**
 * Map technical errors to user-friendly French messages.
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
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "Cet enregistrement existe déjà.";
  }
  if (lower.includes("check") || lower.includes("constraint")) {
    return "Les données saisies ne sont pas valides.";
  }
  if (lower.includes("permission") || lower.includes("rls") || lower.includes("row-level")) {
    return "Accès refusé par la base de données. Vérifiez les politiques d’accès.";
  }

  return "Une erreur est survenue. Réessayez dans un moment.";
}
