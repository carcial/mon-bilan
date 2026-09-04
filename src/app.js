import { renderBottomNav } from "./components/bottom-nav.js";
import { renderModeSwitch } from "./components/mode-switch.js";
import { renderHomeScreen } from "./modules/home/home-screen.js";
import { renderChurchScreen } from "./modules/church/church-screen.js";
import { renderBusinessScreen } from "./modules/business/business-screen.js";
import { renderHistoryScreen } from "./modules/history/history-screen.js";
import { renderMoreScreen } from "./modules/more/more-screen.js";
import { startRouter, onRouteChange, matchRoute, getHashPath } from "./router.js";
import { rememberPath } from "./utils/back-nav.js";
import { applyAppMode, onAppModeChange, syncModeFromPath } from "./state/app-mode.js";
import { installPushClickRouting } from "./push/sw-click-routing.js";

export function createApp() {
  const main = document.getElementById("main-content");
  const nav = document.getElementById("bottom-nav");
  const sidebar = document.getElementById("app-sidebar");
  const topbar = document.getElementById("app-topbar");

  if (!main || !nav) {
    throw new Error("Shell DOM manquant (#main-content / #bottom-nav)");
  }

  applyAppMode();
  installPushClickRouting();

  function render(path = getHashPath()) {
    rememberPath(path);
    syncModeFromPath(path);
    renderModeSwitch(topbar, { path });
    renderBottomNav(nav, path);
    if (sidebar) renderBottomNav(sidebar, path, { variant: "sidebar" });
    const route = matchRoute(path);

    switch (route) {
      case "church":
        renderChurchScreen(main, { path, onChanged: refreshCurrent });
        break;
      case "business":
        renderBusinessScreen(main, { path, onChanged: refreshCurrent });
        break;
      case "history":
        renderHistoryScreen(main);
        break;
      case "more":
        renderMoreScreen(main, { path });
        break;
      case "home":
      default:
        renderHomeScreen(main, { onChanged: refreshCurrent });
        break;
    }

    main.focus({ preventScroll: true });
  }

  function refreshCurrent() {
    render(getHashPath());
  }

  onRouteChange(render);
  onAppModeChange(() => {
    const path = getHashPath();
    const route = matchRoute(path);
    renderModeSwitch(topbar, { path });
    renderBottomNav(nav, path);
    if (sidebar) renderBottomNav(sidebar, path, { variant: "sidebar" });
    if (route === "home") {
      renderHomeScreen(main, { onChanged: refreshCurrent });
    } else if (route === "history") {
      renderHistoryScreen(main);
    } else if (route === "more") {
      renderMoreScreen(main, { path });
    }
  });
  startRouter();

  return { render, refreshHomeMetrics: refreshCurrent };
}

