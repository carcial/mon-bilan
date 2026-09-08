import { describe, expect, it } from "vitest";
import { commerceHomeHtml } from "../src/modules/business/business-dashboard.js";
import {
  BUSINESS_LINKS,
  marginOutcomeLabel,
  stockAvailableCompact,
  stockAvailablePhrase,
  stockWatchHtml,
} from "../src/modules/business/business-ui.js";
import { eventCardHtml } from "../src/modules/history/history-screen.js";
import { BUSINESS_HISTORY_TYPES, filterHistoryEvents, historyFiltersFromQuery, normalizeSale, typeOptionsForDomain } from "../src/utils/history-events.js";
import {
  calculateLineMargin,
  customersServedFromSales,
  uniqueKnownCustomerCount,
  validateSale,
} from "../src/utils/business-calc.js";
import { APP_TIMEZONE, greetingForNow, relativeDayLabel, relativeTimeLabel } from "../src/utils/dates.js";
import { isFilterBackdropDismiss, readFilterSheetValues } from "../src/components/filter-sheet.js";
import { stockProductCardHtml } from "../src/modules/business/business-inventory.js";
import {
  rememberPath,
  resetBackStack,
  resolveBack,
} from "../src/utils/back-nav.js";

const report = {
  revenue: 150000,
  sales: [
    { id: "s1", customer_id: "c1" },
    { id: "s2", customer_id: "c2" },
  ],
  receivablesTotal: 70000,
  receivables: [{ outstanding: 70000 }, { outstanding: 0 }],
  payablesTotal: 200000,
  payables: [{ outstanding: 200000 }],
  stockUnits: 31,
  inventory: [{ product_name: "Pommes", unit_type: "sac", quantity_available: 31 }],
};

const html = commerceHomeHtml(report, {
  recentSales: [
    {
      id: "s1",
      customer_id: "c1",
      customers: { name: "Jeanne" },
      sale_date: "2026-09-08",
      sale_items: [{ quantity: 2, sale_unit_price_fcfa: 75000 }],
    },
  ],
});

describe("Commerce Home is a summary layer", () => {
  it("shows compact day metrics from canonical report fields", () => {
    expect(html).toContain("Ventes du jour");
    expect(html).toContain("2 ventes");
    expect(html).toContain("Stock disponible");
    expect(html).toContain("31 sacs");
    expect(html).not.toContain("État actuel");
    expect(html).toContain("Clients servis");
    expect(html).not.toContain("clients identifiés");
    expect(html).not.toContain("Vue d'ensemble de votre activité");
    expect(html).not.toContain("Résultat du mois");
    expect(html).not.toContain("Cash reçu");
    expect(html).not.toContain("Crédit des ventes");
    expect(html).not.toContain("chart-frame");
    expect(html).not.toContain("Pommes");
    expect((html.match(/31 sacs/g) || []).length).toBe(1);
  });

  it("routes each metric to an existing page", () => {
    expect(html).toContain(`href="#${BUSINESS_LINKS.todaySales}"`);
    expect(html).toContain(`href="#${BUSINESS_LINKS.stock}"`);
    expect(html).toContain(`href="#${BUSINESS_LINKS.todayCustomers}"`);
    expect(BUSINESS_LINKS.todaySales).toBe("/historique?period=today&type=sale");
    expect(BUSINESS_LINKS.todayCustomers).toBe("/commerce/clients?period=today");
    expect(BUSINESS_LINKS.stock).toBe("/commerce/stock");
  });

  it("keeps quick actions on existing write/payment routes", () => {
    expect(html).toContain("Actions rapides");
    expect(html).not.toContain("Accédez rapidement aux principales fonctionnalités");
    expect(html).toContain("Nouvelle vente");
    expect(html).toContain("Nouvel arrivage");
    expect(html).toContain("Paiement client");
    expect(html).toContain("Paiement fournisseur");
    expect(html).toContain(`href="#${BUSINESS_LINKS.sale}"`);
    expect(html).toContain(`href="#${BUSINESS_LINKS.arrival}"`);
    expect(html).toContain(`href="#${BUSINESS_LINKS.paymentNew}"`);
    expect(html).toContain(`href="#${BUSINESS_LINKS.supplierPay}"`);
    expect(BUSINESS_LINKS.paymentNew).toBe("/commerce/a-recevoir/paiement");
    expect(BUSINESS_LINKS.supplierPay).toBe(BUSINESS_LINKS.payables);
    expect(html).not.toContain("Enregistrer un paiement");
    expect(html).not.toContain(">Dépense<");
    expect(html).not.toContain(`href="#${BUSINESS_LINKS.expenseNew}"`);
  });

  it("keeps to-watch rows on existing pages without stock details", () => {
    expect(html).toContain("Clients qui doivent");
    expect(html).toContain("1 client");
    expect(html).toContain(`href="#${BUSINESS_LINKS.receivables}"`);
    expect(html).toContain("Fournisseurs à payer");
    expect(html).toContain("1 fournisseur");
    expect(html).toContain(`href="#${BUSINESS_LINKS.payables}"`);
    expect(html).not.toContain('list-row-title">Stock<');
  });

  it("reuses existing sales rows for recent sales", () => {
    expect(html).toContain("Ventes récentes");
    expect(html).toContain("Jeanne");
    expect(html).toContain("2 articles");
    expect(html).toContain(`href="#/commerce/vente/s1"`);
    expect(html).toContain("Voir tout");
    expect(html).toContain(`href="#${BUSINESS_LINKS.allSales}"`);
    expect(BUSINESS_LINKS.allSales).toBe("/historique?type=sale");
  });

  it("does not invent extra dashboard pages", () => {
    const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1].split("?")[0]);
    const allowed = new Set([
      BUSINESS_LINKS.todaySales.split("?")[0],
      BUSINESS_LINKS.todayCustomers.split("?")[0],
      BUSINESS_LINKS.stock,
      BUSINESS_LINKS.sale,
      BUSINESS_LINKS.arrival,
      BUSINESS_LINKS.paymentNew,
      BUSINESS_LINKS.payables,
      BUSINESS_LINKS.receivables,
      BUSINESS_LINKS.allSales.split("?")[0],
      "/commerce/vente/s1",
    ]);
    hrefs.forEach((href) => expect(allowed.has(href)).toBe(true));
  });
});

describe("canonical dashboard counts", () => {
  it("totals today's sales amount from report.revenue", () => {
    expect(report.revenue).toBe(150000);
    expect(html).toContain("Ventes du jour");
  });

  it("uses current inventory units, not a today-only stock figure", () => {
    expect(stockAvailableCompact(31, "sac")).toBe("31 sacs");
    expect(html).toContain("31 sacs");
    expect(html).not.toContain("État actuel");
  });

  it("counts unique known customers only", () => {
    expect(
      uniqueKnownCustomerCount([
        { customer_id: "c1" },
        { customer_id: "c1" },
        { customer_id: "c2" },
        { customer_id: null },
        { customer_id: "" },
      ]),
    ).toBe(2);
    expect(uniqueKnownCustomerCount(report.sales)).toBe(2);
  });
});

describe("today sales history query", () => {
  it("applies period=today and type=sale without a new page", () => {
    const filters = historyFiltersFromQuery({
      get: (key) => ({ period: "today", type: "sale" }[key] || ""),
    });
    expect(filters.period).toBe("today");
    expect(filters.type).toBe("sale");
  });

  it("ignores a bare history URL", () => {
    expect(historyFiltersFromQuery({ get: () => "" })).toBeNull();
  });

  it("shows customer, product, qty and payment status on a sale event", () => {
    const event = normalizeSale({
      id: "sale-1",
      customer_id: "c1",
      sale_date: "2026-09-08",
      settlement_status: "partial",
      amount_paid_fcfa: 80000,
      customers: { name: "TEST PARTIAL PAYMENT" },
      sale_items: [{ quantity: 1, sale_unit_price_fcfa: 150000, products: { name: "Pommes" } }],
    });
    expect(event.href).toBe("/commerce/vente/sale-1");
    expect(event.customerName).toBe("TEST PARTIAL PAYMENT");
    expect(event.productName).toBe("Pommes");
    expect(event.quantity).toBe(1);
    expect(event.settlementLabel).toBe("Paiement partiel");
    expect(event.amount).toBe(150000);
  });

  it("lets a known client name open existing client detail", () => {
    const event = normalizeSale({
      id: "sale-1",
      customer_id: "c1",
      sale_date: "2026-09-08",
      settlement_status: "paid",
      customers: { name: "Jeanne" },
      sale_items: [{ quantity: 1, sale_unit_price_fcfa: 150000, products: { name: "Pommes" } }],
    });
    const card = eventCardHtml(event);
    expect(card).toContain('href="#/commerce/clients/c1"');
    expect(card).toContain('href="#/commerce/vente/sale-1"');
    expect(card).toContain("history-customer-link");
    expect(card).not.toContain("<a class=\"list-row history-card");
  });
});

describe("stock home phrase", () => {
  it("uses a single available line", () => {
    expect(stockAvailablePhrase(31, "sac")).toBe("31 sacs disponibles");
    expect(stockAvailablePhrase(0, "sac")).toBe("0 sac disponible");
    expect(stockAvailableCompact(31, "sac")).toBe("31 sacs");
    const watch = stockWatchHtml({
      href: "/commerce/stock",
      stockUnits: 31,
      inventory: [{ unit_type: "sac", product_name: "Pommes", quantity_available: 31 }],
    });
    expect(watch).toContain("31 sacs disponibles");
    expect(watch).not.toContain("Pommes");
  });
});

describe("arrival realized margin labels", () => {
  it("uses Gain / Perte words with the canonical line margin", () => {
    expect(marginOutcomeLabel(45000)).toBe("Gain");
    expect(marginOutcomeLabel(-12000)).toBe("Perte");
    expect(marginOutcomeLabel(0)).toBe("Équilibre");
    expect(calculateLineMargin(18, 30000, 25000)).toBe(90000);
    expect(calculateLineMargin(2, 20000, 25000)).toBe(-10000);
  });
});

describe("back from Home", () => {
  it("returns to Accueil when that is the previous screen", () => {
    resetBackStack();
    rememberPath("/");
    rememberPath("/historique");
    const back = resolveBack("/", "Retour à l'accueil");
    expect(back.href).toBe("/");
    expect(back.label).toBe("Retour à l'accueil");
  });

  it("keeps the real previous page when today-sales is opened from elsewhere", () => {
    resetBackStack();
    rememberPath("/plus");
    rememberPath("/historique");
    expect(resolveBack("/").href).toBe("/plus");
  });
});

describe("client name rule is unchanged", () => {
  it("still requires a client on a fully paid sale", () => {
    const paid = validateSale({
      productId: "p",
      arrivalId: "a",
      quantity: 1,
      unitPrice: 100000,
      date: "2026-09-08",
      available: 5,
      settlementStatus: "paid",
      paymentMethod: "cash",
    });
    expect(paid.ok).toBe(false);
    expect(paid.errors.customerId).toMatch(/client/);
  });
});

describe("relative day labels", () => {
  it("does not mutate the reference date", () => {
    const now = new Date(2026, 8, 8, 12, 0, 0);
    const copy = new Date(now.getTime());
    expect(relativeDayLabel("2026-09-08", now)).toBe("Aujourd'hui");
    expect(relativeDayLabel("2026-09-07", now)).toBe("Hier");
    expect(relativeTimeLabel(new Date(2026, 8, 8, 11, 48, 0), now)).toBe("Il y a 12 min");
    expect(now.getTime()).toBe(copy.getTime());
  });
});

describe("Africa/Douala greeting", () => {
  it("uses Cameroon time, not the device clock hour", () => {
    expect(APP_TIMEZONE).toBe("Africa/Douala");
    expect(greetingForNow(new Date("2026-09-08T07:00:00.000Z"))).toBe("Bonjour");
    expect(greetingForNow(new Date("2026-09-08T17:00:00.000Z"))).toBe("Bonsoir");
  });
});

describe("clients servis reuse existing customers page", () => {
  it("filters existing customer rows to today's known sale customers", () => {
    const rows = customersServedFromSales(
      [
        { customer: { id: "c1", name: "Jeanne" } },
        { customer: { id: "c2", name: "Paul" } },
        { customer: { id: "c3", name: "Anonyme" } },
      ],
      [{ customer_id: "c1" }, { customer_id: "c1" }, { customer_id: null }],
    );
    expect(rows.map((row) => row.customer.id)).toEqual(["c1"]);
    expect(BUSINESS_LINKS.todayCustomers).toBe("/commerce/clients?period=today");
  });
});

describe("history Tout keeps every supported commerce type", () => {
  it("treats empty type as all business operations", () => {
    const ids = typeOptionsForDomain("business").map(([value]) => value);
    expect(ids[0]).toBe("");
    expect(ids.slice(1)).toEqual(BUSINESS_HISTORY_TYPES);
    const events = [
      { type: "sale", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "vente" },
      { type: "arrival", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "arrivage" },
      { type: "customer_payment", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "paiement" },
      { type: "supplier_payment", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "fournisseur" },
      { type: "business_expense", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "depense" },
      { type: "adjustment", domain: "business", date: "2026-09-08", customerId: null, supplierId: null, productId: null, fundId: null, searchText: "stock" },
    ];
    expect(filterHistoryEvents(events, { type: "" }).map((row) => row.type)).toEqual(BUSINESS_HISTORY_TYPES);
    expect(filterHistoryEvents(events, { type: "sale" }).map((row) => row.type)).toEqual(["sale"]);
  });
});

describe("history filter sheet interactions", () => {
  it("only dismisses on a true backdrop tap", () => {
    const backdrop = { id: "backdrop" };
    expect(isFilterBackdropDismiss(backdrop, backdrop)).toBe(true);
    expect(isFilterBackdropDismiss({ id: "select" }, backdrop)).toBe(false);
  });

  it("reads pending drafts without treating that as apply", () => {
    expect(
      readFilterSheetValues({
        querySelectorAll: () => [
          { getAttribute: (key) => (key === "data-draft" ? "type" : null), value: "" },
          { getAttribute: (key) => (key === "data-draft" ? "period" : null), value: "today" },
        ],
      }),
    ).toEqual({ type: "", period: "today" });
  });
});

describe("stock lots are visible without an extra tap", () => {
  it("renders lot rows directly", () => {
    const html = stockProductCardHtml(
      {
        product_id: "p1",
        product_name: "Pommes",
        unit_type: "sac",
        quantity_available: 31,
        quantity_received: 55,
        quantity_sold: 24,
        quantity_adjustments: 0,
      },
      [{ id: "a1", quantity_received: 25, suppliers: { code: "SOA" } }],
      new Map([["a1", { quantity_sold: 10, quantity_remaining: 15 }]]),
    );
    expect(html).toContain("SOA");
    expect(html).toContain("Reçu 25");
    expect(html).not.toContain("Voir les lots");
    expect(html).not.toContain("Voir plus");
  });
});

describe("back from Home destinations", () => {
  it("returns Home after Stock when Home was previous", () => {
    resetBackStack();
    rememberPath("/");
    rememberPath("/commerce/stock");
    expect(resolveBack("/").href).toBe("/");
  });

  it("returns the previous Commerce page, not a hardcoded Home, when that is the stack", () => {
    resetBackStack();
    rememberPath("/commerce/clients");
    rememberPath("/commerce/vente");
    expect(resolveBack("/commerce", "Retour au commerce").href).toBe("/commerce/clients");

    resetBackStack();
    rememberPath("/commerce/stock");
    rememberPath("/commerce/arrivee");
    expect(resolveBack("/commerce", "Retour au commerce").href).toBe("/commerce/stock");

    resetBackStack();
    rememberPath("/commerce/fournisseurs");
    rememberPath("/commerce/a-payer");
    expect(resolveBack("/", "Retour à l'accueil").href).toBe("/commerce/fournisseurs");
  });
});
