import { describe, expect, it } from "vitest";
import {
  choiceMode,
  customerComboboxState,
  findCustomerByName,
  isMeaningfulFilterList,
  panelViewportPlacement,
  resolveSaleCustomer,
} from "../src/utils/choice-ui.js";
import { choiceFieldHtml, meaningfulFilterFieldHtml } from "../src/components/choice-field.js";
import { customerComboboxHtml } from "../src/components/customer-combobox.js";
import {
  calculateAvailableInventory,
  sumAvailableInventory,
} from "../src/utils/business-calc.js";
import { METHOD_LABELS, stockWatchHtml, supplierAmountPerUnitLabel } from "../src/modules/business/business-ui.js";
import { countActiveHistoryFilters, HISTORY_TYPE_LABELS, periodLabelCompact, typeOptionsForDomain } from "../src/utils/history-events.js";
import { displayDateFr, parseNumericDateFr } from "../src/utils/dates.js";
import { customerDisplayLabel, supplierDisplayLabel } from "../src/utils/supplier-label.js";
import { validateMoneyPayment } from "../src/utils/business-calc.js";

const customers = [
  { id: "c1", name: "Maman Jeanne" },
  { id: "c2", name: "Maman Jeannette" },
  { id: "c3", name: "Paul" },
];

describe("customer autocomplete", () => {
  it("matches existing customers as the user types", () => {
    const state = customerComboboxState(customers, "Maman Jea");
    expect(state.matches.map((row) => row.id)).toEqual(["c1", "c2"]);
    expect(state.canCreate).toBe(true);
    expect(state.createLabel).toContain("Maman Jea");
  });

  it("selects an existing customer on exact name, case-insensitive", () => {
    expect(findCustomerByName(customers, "maman  jeanne")?.id).toBe("c1");
    const state = customerComboboxState(customers, "Maman Jeanne");
    expect(state.exact?.id).toBe("c1");
    expect(state.canCreate).toBe(false);
  });

  it("offers creation only when no exact match exists", () => {
    const state = customerComboboxState(customers, "Maman Jeanne");
    expect(state.canCreate).toBe(false);
    const create = customerComboboxState(customers, "Koffi");
    expect(create.canCreate).toBe(true);
    expect(create.createLabel).toBe("Créer « Koffi »");
  });

  it("renders a typeable client field instead of a New client selector", () => {
    const html = customerComboboxHtml({ customers, selectedId: "" });
    expect(html).toContain("Client");
    expect(html).toContain("Rechercher ou saisir un client");
    expect(html).not.toContain("Nouveau client");
    expect(html).not.toContain("__new__");
  });

  it("can hide the duplicate Client field label under a section title", () => {
    const html = customerComboboxHtml({ customers, selectedId: "", hideLabel: true });
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('aria-label="Client"');
    expect(html).not.toContain('class="field-label"');
  });
});

describe("sale customer resolution", () => {
  it("reuses an existing customer id when already selected", () => {
    const resolved = resolveSaleCustomer({ customerId: "c2", newCustomerName: "Autre" }, customers);
    expect(resolved).toEqual({ customerId: "c2", shouldCreate: false, name: null });
  });

  it("does not create a duplicate when the typed name already exists", () => {
    const resolved = resolveSaleCustomer({ customerId: "", newCustomerName: "Maman Jeanne" }, customers);
    expect(resolved.shouldCreate).toBe(false);
    expect(resolved.customerId).toBe("c1");
  });

  it("creates only when the name is new", () => {
    const resolved = resolveSaleCustomer({ customerId: "", newCustomerName: "Koffi" }, customers);
    expect(resolved).toEqual({ customerId: null, shouldCreate: true, name: "Koffi" });
  });
});

describe("single-option and empty choice fields", () => {
  it("auto-selects a single option as read-only text", () => {
    expect(choiceMode([{ id: "p1", name: "Pommes" }])).toBe("single");
    const html = choiceFieldHtml({
      id: "sale-product",
      name: "productId",
      label: "Produit",
      options: [{ id: "p1", name: "Pommes" }],
    });
    expect(html).toContain("Pommes");
    expect(html).toContain('type="hidden"');
    expect(html).not.toContain("<select");
  });

  it("shows an empty state instead of a dead dropdown", () => {
    expect(choiceMode([])).toBe("empty");
    const html = choiceFieldHtml({
      id: "arr-supplier",
      name: "supplierId",
      label: "Fournisseur",
      options: [],
      emptyTitle: "Aucun fournisseur disponible.",
      emptyHref: "/commerce/fournisseurs/nouveau",
      emptyLabel: "Ajouter",
    });
    expect(html).toContain("Aucun fournisseur disponible.");
    expect(html).not.toContain("<select");
  });

  it("keeps a dropdown only when there are several options", () => {
    expect(choiceMode([{ id: "a" }, { id: "b" }])).toBe("many");
    const html = choiceFieldHtml({
      id: "sale-product",
      name: "productId",
      label: "Produit",
      options: [
        { id: "p1", name: "Pommes" },
        { id: "p2", name: "Oranges" },
      ],
      placeholder: "Choisir un produit",
    });
    expect(html).toContain("choice-trigger");
    expect(html).not.toContain("<select");
    expect(html).toContain("Choisir un produit");
  });
});

describe("hidden empty and single-value filters", () => {
  it("hides filters with zero or one value", () => {
    expect(isMeaningfulFilterList([])).toBe(false);
    expect(isMeaningfulFilterList([{ id: "c1" }])).toBe(false);
    expect(isMeaningfulFilterList([{ id: "c1" }, { id: "c2" }])).toBe(true);
  });

  it("does not render a filter dropdown when there is no meaningful choice", () => {
    expect(
      meaningfulFilterFieldHtml({
        id: "draft-customer",
        draftKey: "customerId",
        label: "Client",
        options: [{ id: "c1", name: "Jeanne" }],
        selectedId: "",
        allLabel: "Tous les clients",
      }),
    ).toBe("");
    expect(
      meaningfulFilterFieldHtml({
        id: "draft-customer",
        draftKey: "customerId",
        label: "Client",
        options: [],
        selectedId: "",
        allLabel: "Tous les clients",
      }),
    ).toBe("");
  });

  it("renders a filter only when several values exist", () => {
    const html = meaningfulFilterFieldHtml({
      id: "draft-customer",
      draftKey: "customerId",
      label: "Client",
      options: customers,
      selectedId: "",
      allLabel: "Tous les clients",
    });
    expect(html).toContain("Client");
    expect(html).toContain("choice-trigger");
    expect(html).not.toContain("<select");
  });
});

describe("home stock metric", () => {
  it("shows 0 available units for one emptied batch, not 1", () => {
    const remaining = calculateAvailableInventory({
      received: 8,
      sold: 8,
      adjustmentsDelta: 0,
    });
    const inventory = [
      {
        product_id: "p1",
        product_name: "Pommes",
        unit_type: "sac",
        quantity_received: 8,
        quantity_sold: 8,
        quantity_adjustments: 0,
        quantity_available: remaining,
      },
    ];

    expect(remaining).toBe(0);
    expect(inventory.length).toBe(1);
    const stockUnits = sumAvailableInventory(inventory);
    expect(stockUnits).toBe(0);

    const home = stockWatchHtml({ href: "/commerce/stock", inventory, stockUnits });
    expect(home).toContain("Stock");
    expect(home).toContain("0 sac disponible");
    expect(home).not.toContain("Pommes");
    expect(home).not.toMatch(/list-row-amount">0</);

    const stockScreenTotal = sumAvailableInventory(inventory);
    const reportLabel = `${stockUnits} unités`;
    expect(stockScreenTotal).toBe(stockUnits);
    expect(reportLabel).toBe("0 unités");
  });
});

describe("dropdown viewport bounds", () => {
  it("keeps a panel inside a 360px viewport with page margins", () => {
    const placement = panelViewportPlacement(
      { top: 520, bottom: 560, left: 16, right: 344 },
      { width: 360, height: 640 },
    );
    expect(placement.maxWidth).toBeLessThanOrEqual(360 - 24);
    expect(placement.maxHeight).toBeLessThanOrEqual(640);
    expect(placement.openUp).toBe(true);
  });

  it("opens downward when there is room on a 390px phone", () => {
    const placement = panelViewportPlacement(
      { top: 80, bottom: 130, left: 16, right: 374 },
      { width: 390, height: 844 },
    );
    expect(placement.openUp).toBe(false);
    expect(placement.maxWidth).toBeLessThanOrEqual(390 - 24);
  });

  it("stays within a 430px viewport", () => {
    const placement = panelViewportPlacement(
      { top: 200, bottom: 250, left: 16, right: 414 },
      { width: 430, height: 932 },
    );
    expect(placement.maxWidth).toBeLessThanOrEqual(430 - 24);
    expect(placement.maxHeight).toBeGreaterThan(96);
  });
});

describe("history period wording", () => {
  it("keeps a clear compact period label for the default month", () => {
    expect(periodLabelCompact("month")).toBe("Ce mois");
    expect(periodLabelCompact("custom")).toBe("Personnalisée");
  });
});

describe("history domain filters", () => {
  it("lists church types including cash verification", () => {
    const labels = typeOptionsForDomain("church").map(([, label]) => label);
    expect(labels).toEqual(["Toutes", "Entrées", "Sorties", "Vérification de caisse"]);
    expect(HISTORY_TYPE_LABELS.reconciliation).toBe("Vérification de caisse");
  });

  it("lists commerce types without mixing payment status into method", () => {
    const labels = typeOptionsForDomain("business").map(([, label]) => label);
    expect(labels).toEqual([
      "Toutes",
      "Vente",
      "Arrivage",
      "Paiement client",
      "Paiement fournisseur",
      "Dépense",
      "Ajustement stock",
    ]);
  });

  it("counts sheet filters without the independent search field", () => {
    expect(
      countActiveHistoryFilters(
        { period: "month", type: "sale", search: "Jeanne" },
        { includeSearch: false },
      ),
    ).toBe(1);
    expect(
      countActiveHistoryFilters(
        { period: "week", type: "", search: "" },
        { includeSearch: false },
      ),
    ).toBe(1);
  });
});

describe("user-facing dates", () => {
  it("formats and parses DD/MM/YYYY only", () => {
    expect(displayDateFr("2026-09-03")).toBe("03/09/2026");
    expect(displayDateFr("2026-09-03")).not.toBe("2026-09-03");
    expect(displayDateFr("2026-09-03")).not.toContain(".");
    expect(parseNumericDateFr("03/09/2026")).toBe("2026-09-03");
    expect(parseNumericDateFr("3/9/2026")).toBe("2026-09-03");
  });
});

describe("person labels", () => {
  it("shows a supplier name once when code and name match", () => {
    expect(supplierDisplayLabel({ code: "DJS", name: "DJS" })).toBe("DJS");
    expect(supplierDisplayLabel({ code: "SOA", name: "SOA" })).toBe("SOA");
    expect(supplierDisplayLabel({ code: "SO", name: "SO" })).toBe("SO");
    expect(supplierDisplayLabel({ code: "SOA", name: "Société OA" })).toBe("Société OA");
    expect(supplierDisplayLabel({ code: "DJS", name: "DJS" })).not.toContain("—");
  });

  it("shows only the customer name", () => {
    expect(customerDisplayLabel({ name: "Maman Jeanne" })).toBe("Maman Jeanne");
  });
});

describe("manual payment rules", () => {
  it("keeps payment methods distinct and blocks no-debt or overpay", () => {
    expect(METHOD_LABELS.bank).toBe("Virement bancaire");
    expect(validateMoneyPayment({ amount: 30000, date: "2026-09-03", paymentMethod: "mobile_money", outstanding: 100000 }).ok).toBe(true);
    expect(validateMoneyPayment({ amount: 100000, date: "2026-09-03", paymentMethod: "cash", outstanding: 100000 }).ok).toBe(true);
    expect(validateMoneyPayment({ amount: 10000, date: "2026-09-03", paymentMethod: "bank", outstanding: 0 }).ok).toBe(false);
    expect(validateMoneyPayment({ amount: 80000, date: "2026-09-03", paymentMethod: "cash", outstanding: 50000 }).errors.amount).toMatch(/dépasse/);
  });
});

describe("predictable back navigation", () => {
  it("returns to the previous route in the same flow, else the parent", async () => {
    const {
      rememberPath,
      resetBackStack,
      resolveBack,
      isValidBackTarget,
      backLabelForPath,
    } = await import("../src/utils/back-nav.js");
    resetBackStack();
    rememberPath("/commerce/a-recevoir");
    rememberPath("/commerce/clients/abc");
    const fromPayments = resolveBack("/commerce/clients", "Retour aux clients");
    expect(fromPayments.href).toBe("/commerce/a-recevoir");
    expect(fromPayments.label).toBe("Retour aux paiements");

    resetBackStack();
    rememberPath("/commerce/clients/abc");
    const fallback = resolveBack("/commerce/clients", "Retour aux clients");
    expect(fallback.href).toBe("/commerce/clients");
    expect(fallback.label).toBe("Retour aux clients");

    expect(isValidBackTarget("/", "/commerce/clients/abc")).toBe(true);
    expect(isValidBackTarget("/", "/eglise/entree")).toBe(true);
    expect(isValidBackTarget("/historique", "/eglise/operation/1")).toBe(true);
    expect(isValidBackTarget("/commerce/depenses/nouvelle", "/commerce/depenses")).toBe(false);
    expect(isValidBackTarget("/commerce/depenses", "/commerce/depenses/nouvelle")).toBe(true);
    expect(backLabelForPath("/commerce/clients")).toBe("Retour aux clients");

    resetBackStack();
    rememberPath("/");
    rememberPath("/commerce/depenses/nouvelle");
    rememberPath("/commerce/depenses");
    const fromExpenses = resolveBack("/commerce", "Retour au commerce");
    expect(fromExpenses.href).toBe("/commerce");
    expect(fromExpenses.label).toBe("Retour au commerce");
  });
});

describe("arrival supplier amount wording", () => {
  it("labels the supplier field as an expected per-bag amount", () => {
    expect(supplierAmountPerUnitLabel("sac")).toBe("Montant fournisseur par sac");
    expect(supplierAmountPerUnitLabel("sac")).not.toMatch(/prix unitaire|coût/i);
  });
});
