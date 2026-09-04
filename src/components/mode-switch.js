import { APP_MODES, getAppMode, isSensitiveFlowPath, setAppMode } from "../state/app-mode.js";
import { matchRoute, navigate, ROUTES } from "../router.js";
import { iconHtml } from "./icons.js";

/**
 * Floating Commerce / Église segmented switch.
 * @param {HTMLElement} container
 * @param {{ path?: string }} [ctx]
 */
export function renderModeSwitch(container, ctx = {}) {
  if (!container) return;
  const path = ctx.path || "/";
  if (isSensitiveFlowPath(path)) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const mode = getAppMode();
  const churchOn = mode === APP_MODES.church;

  container.hidden = false;
  container.innerHTML = `
    <div class="mode-switch" data-mode="${mode}" role="tablist" aria-label="Univers">
      <span class="mode-switch-thumb" aria-hidden="true"></span>
      <button
        type="button"
        class="mode-switch-btn${churchOn ? "" : " is-active"}"
        role="tab"
        aria-selected="${churchOn ? "false" : "true"}"
        data-mode="${APP_MODES.commerce}"
      >
        ${iconHtml("storefront", { weight: churchOn ? "regular" : "fill", size: "sm" })}
        <span>Commerce</span>
      </button>
      <button
        type="button"
        class="mode-switch-btn${churchOn ? " is-active" : ""}"
        role="tab"
        aria-selected="${churchOn ? "true" : "false"}"
        data-mode="${APP_MODES.church}"
      >
        ${iconHtml("church", { weight: churchOn ? "fill" : "regular", size: "sm" })}
        <span>Église</span>
      </button>
    </div>
  `;

  container.querySelectorAll("[data-mode]").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-mode");
      if (!next || next === getAppMode()) return;
      setAppMode(next);
      redirectAfterModeChange(ctx.path);
    });
  });
}

function redirectAfterModeChange(path) {
  const route = matchRoute(path || "/");
  if (route === "home" || route === "history" || route === "more") return;
  navigate(getAppMode() === APP_MODES.church ? ROUTES.church : ROUTES.business);
}
