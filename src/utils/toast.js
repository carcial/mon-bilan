/**
 * Lightweight toast — uses the existing #toast-root slot.
 * @param {string} message
 * @param {{ timeout?: number }} [options]
 */
export function showToast(message, options = {}) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const timeout = options.timeout ?? 4200;
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  root.appendChild(el);

  window.setTimeout(() => {
    el.remove();
  }, timeout);
}
