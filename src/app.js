import { renderBottomNav } from "./components/bottom-nav.js";
import { renderHomeScreen } from "./modules/home/home-screen.js";
import { renderChurchScreen } from "./modules/church/church-screen.js";
import { renderBusinessScreen } from "./modules/business/business-screen.js";
import { renderHistoryScreen } from "./modules/history/history-screen.js";
import { renderMoreScreen } from "./modules/more/more-screen.js";
import {
  startRouter,
  onRouteChange,
  matchRoute,
  getHashPath,
} from "./router.js";
import { fetchCombinedChurchBalance } from "./services/supabase/church.js";
import { fetchMonthlyBusinessResult } from "./services/supabase/business.js";

export function createApp() {
  const main = document.getElementById("main-content");
  const nav = document.getElementById("bottom-nav");

  if (!main || !nav) {
    throw new Error("Shell DOM manquant (#main-content / #bottom-nav)");
  }

  /** @type {{ churchBalance: number | null, businessResult: number | null }} */
  let homeData = {
    churchBalance: null,
    businessResult: null,
  };

  function render(path = getHashPath()) {
    renderBottomNav(nav, path);
    const route = matchRoute(path);

    switch (route) {
      case "church":
        renderChurchScreen(main, { path, onChanged: refreshHomeMetrics });
        break;
      case "business":
        renderBusinessScreen(main, { path, onChanged: refreshHomeMetrics });
        break;
      case "history":
        renderHistoryScreen(main);
        break;
      case "more":
        renderMoreScreen(main, { path });
        break;
      case "home":
      default:
        renderHomeScreen(main, homeData);
        break;
    }

    main.focus({ preventScroll: true });
  }

  async function refreshHomeMetrics() {
    try {
      const [churchBalance, businessResult] = await Promise.all([
        fetchCombinedChurchBalance(),
        fetchMonthlyBusinessResult(),
      ]);
      homeData = { churchBalance, businessResult };
      if (matchRoute(getHashPath()) === "home") {
        renderHomeScreen(main, homeData);
      }
    } catch (err) {
      console.warn("[app] metrics refresh failed", err);
    }
  }

  onRouteChange(render);
  startRouter();
  refreshHomeMetrics();

  return { render, refreshHomeMetrics };
}
