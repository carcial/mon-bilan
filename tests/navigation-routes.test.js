import { describe, expect, it } from "vitest";
import { matchChurchRoute } from "../src/modules/church/church-routes.js";
import { matchBusinessRoute } from "../src/modules/business/business-routes.js";
import { CHURCH_LINKS } from "../src/modules/church/church-ui.js";
import { BUSINESS_LINKS } from "../src/modules/business/business-ui.js";
import { matchRoute, ROUTES } from "../src/router.js";
import {
  isSensitiveFlowPath,
  APP_MODES,
  resolveAppMode,
} from "../src/state/app-mode.js";
import {
  rememberPath,
  resetBackStack,
  resolveBack,
} from "../src/utils/back-nav.js";

function hashHref(path) {
  return `#${path}`;
}

describe("Commerce ↔ Église routes stay native hash links", () => {
  it("maps Église write actions to real hash routes", () => {
    expect(CHURCH_LINKS.income).toBe("/eglise/entree");
    expect(CHURCH_LINKS.expense).toBe("/eglise/sortie");
    expect(CHURCH_LINKS.reconciliation).toBe("/eglise/rapprochement");
    expect(matchChurchRoute("/eglise/entree")).toEqual({ name: "income" });
    expect(matchChurchRoute("/eglise/sortie")).toEqual({ name: "expense" });
    expect(matchChurchRoute("/eglise/rapprochement")).toEqual({ name: "reconciliation" });
    expect(hashHref(CHURCH_LINKS.income)).toBe("#/eglise/entree");
    expect(matchRoute(CHURCH_LINKS.income)).toBe("church");
  });

  it("maps Commerce primary actions to real hash routes", () => {
    expect(matchBusinessRoute("/commerce/vente").name).toBe("sale");
    expect(matchBusinessRoute("/commerce/arrivee").name).toBe("arrival");
    expect(matchBusinessRoute("/commerce/a-recevoir").name).toBe("receivables");
    expect(matchBusinessRoute("/commerce/a-recevoir/paiement").name).toBe("customer-payment");
    expect(matchBusinessRoute("/commerce/depenses").name).toBe("expenses");
    expect(matchBusinessRoute("/commerce/stock").name).toBe("stock");
    expect(matchBusinessRoute("/commerce/clients").name).toBe("customers");
    expect(matchBusinessRoute("/commerce/fournisseurs").name).toBe("suppliers");
    expect(hashHref(BUSINESS_LINKS.sale)).toBe("#/commerce/vente");
    expect(hashHref(BUSINESS_LINKS.arrival)).toBe("#/commerce/arrivee");
    expect(hashHref(BUSINESS_LINKS.paymentNew)).toBe("#/commerce/a-recevoir/paiement");
    expect(hashHref(BUSINESS_LINKS.supplierPay)).toBe("#/commerce/a-payer");
    expect(hashHref(BUSINESS_LINKS.expenseNew)).toBe("#/commerce/depenses/nouvelle");
    expect(hashHref(BUSINESS_LINKS.receivables)).toBe("#/commerce/a-recevoir");
    expect(hashHref(BUSINESS_LINKS.payables)).toBe("#/commerce/a-payer");
    expect(hashHref(BUSINESS_LINKS.stock)).toBe("#/commerce/stock");
    expect(BUSINESS_LINKS.todaySales).toBe("/historique?period=today&type=sale");
    expect(BUSINESS_LINKS.todayCustomers).toBe("/commerce/clients?period=today");
    expect(BUSINESS_LINKS.supplierPay).toBe(BUSINESS_LINKS.payables);
    expect(matchBusinessRoute("/commerce/a-payer/paiement")).toEqual({ name: "payables" });
  });

  it("keeps bottom navigation on hash routes", () => {
    expect(hashHref(ROUTES.home)).toBe("#/");
    expect(hashHref(ROUTES.history)).toBe("#/historique");
    expect(hashHref(ROUTES.moreReport)).toBe("#/plus/rapport");
    expect(hashHref(ROUTES.more)).toBe("#/plus");
    expect(matchRoute("/")).toBe("home");
    expect(matchRoute("/historique")).toBe("history");
    expect(matchRoute("/plus")).toBe("more");
  });

  it("treats domain dashboards as switchable, write flows as sensitive", () => {
    expect(resolveAppMode("eglise")).toBe(APP_MODES.church);
    expect(resolveAppMode("commerce")).toBe(APP_MODES.commerce);
    expect(isSensitiveFlowPath("/eglise/entree")).toBe(true);
    expect(isSensitiveFlowPath("/eglise/sortie")).toBe(true);
    expect(isSensitiveFlowPath("/commerce/vente")).toBe(true);
    expect(isSensitiveFlowPath("/")).toBe(false);
    expect(isSensitiveFlowPath("/commerce")).toBe(false);
    expect(isSensitiveFlowPath("/eglise")).toBe(false);
  });
});

describe("back navigation after a write screen", () => {
  it("returns Église income to the church dashboard", () => {
    resetBackStack();
    rememberPath("/");
    rememberPath("/eglise");
    rememberPath("/eglise/entree");
    const back = resolveBack(ROUTES.church, "Retour à Église");
    expect(back.href).toBe("/eglise");
  });

  it("returns Commerce sale to the commerce dashboard", () => {
    resetBackStack();
    rememberPath("/");
    rememberPath("/commerce");
    rememberPath("/commerce/vente");
    const back = resolveBack(ROUTES.business, "Retour au commerce");
    expect(back.href).toBe("/commerce");
  });

  it("returns Payments to commerce home when that was the previous screen", () => {
    resetBackStack();
    rememberPath("/commerce");
    rememberPath("/commerce/a-recevoir");
    expect(resolveBack("/").href).toBe("/commerce");
  });
});
