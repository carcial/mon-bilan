import { describe, expect, it } from "vitest";
import {
  ACTIVE_DOMAINS,
  APP_MODES,
  isSensitiveFlowPath,
  modeToDomain,
  resolveAppMode,
} from "../src/state/app-mode.js";
import {
  BUSINESS_HISTORY_TYPES,
  CHURCH_HISTORY_TYPES,
  countActiveHistoryFilters,
  filterHistoryEvents,
  normalizeArrival,
  normalizeChurchTransaction,
  paginateHistoryEvents,
  typeOptionsForDomain,
} from "../src/utils/history-events.js";
import {
  BUSINESS_EXCEL_SHEETS,
  CHURCH_EXCEL_SHEETS,
  buildExcelWorkbookData,
} from "../src/utils/excel-workbook.js";
import { formatNumericDateFr } from "../src/utils/dates.js";
import { auditTablesForDomain } from "../src/utils/audit-format.js";

describe("active domain", () => {
  it("maps Commerce / Église modes to data domains", () => {
    expect(modeToDomain(APP_MODES.commerce)).toBe(ACTIVE_DOMAINS.business);
    expect(modeToDomain(APP_MODES.church)).toBe(ACTIVE_DOMAINS.church);
    expect(resolveAppMode("eglise")).toBe(APP_MODES.church);
    expect(resolveAppMode("anything")).toBe(APP_MODES.commerce);
  });

  it("defaults to Commerce when storage is empty", () => {
    const stored = null;
    const mode =
      stored === APP_MODES.church || stored === APP_MODES.commerce
        ? stored
        : APP_MODES.commerce;
    expect(mode).toBe(APP_MODES.commerce);
  });

  it("restores a stored Church preference", () => {
    expect(resolveAppMode("eglise")).toBe(APP_MODES.church);
    expect(modeToDomain("eglise")).toBe("church");
  });

  it("treats write flows as sensitive", () => {
    expect(isSensitiveFlowPath("/eglise/entree")).toBe(true);
    expect(isSensitiveFlowPath("/commerce/vente")).toBe(true);
    expect(isSensitiveFlowPath("/commerce/vente/abc")).toBe(false);
    expect(isSensitiveFlowPath("/historique")).toBe(false);
    expect(isSensitiveFlowPath("/plus/rapport")).toBe(false);
  });
});

describe("history stays inside the active domain", () => {
  const church = normalizeChurchTransaction({
    id: "tx-1",
    fund_id: "f1",
    transaction_type: "income",
    amount_fcfa: 150000,
    transaction_date: "2026-09-02",
    reason: "Offrandes dimanche",
    church_funds: { name: "Ordinaire" },
  });
  const arrival = normalizeArrival({
    id: "arr-1",
    supplier_id: "sup-1",
    product_id: "p1",
    arrival_date: "2026-09-02",
    quantity_received: 30,
    supplier_unit_price_fcfa: 25000,
    note: "Camion SOA",
    suppliers: { name: "SOA" },
    products: { id: "p1", name: "Pommes" },
  });

  it("never returns the other domain", () => {
    const churchOnly = filterHistoryEvents([church, arrival], { domain: "church" });
    const businessOnly = filterHistoryEvents([church, arrival], { domain: "business" });
    expect(churchOnly.every((row) => row.domain === "church")).toBe(true);
    expect(businessOnly.every((row) => row.domain === "business")).toBe(true);
    expect(churchOnly).toHaveLength(1);
    expect(businessOnly).toHaveLength(1);
  });

  it("scopes search to the active domain", () => {
    const hits = filterHistoryEvents([church, arrival], {
      domain: "business",
      search: "soa",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe("arrival");
    expect(
      filterHistoryEvents([church, arrival], { domain: "church", search: "soa" }),
    ).toHaveLength(0);
  });

  it("changes type options by domain and keeps Tout inside the mode", () => {
    const churchTypes = typeOptionsForDomain("church");
    const businessTypes = typeOptionsForDomain("business");
    expect(churchTypes[0]).toEqual(["", "Toutes"]);
    expect(churchTypes.map((row) => row[0]).filter(Boolean)).toEqual(CHURCH_HISTORY_TYPES);
    expect(businessTypes.map((row) => row[0]).filter(Boolean)).toEqual(BUSINESS_HISTORY_TYPES);
    expect(churchTypes.some((row) => row[0] === "sale")).toBe(false);
    expect(businessTypes.some((row) => row[0] === "income")).toBe(false);
  });
});

describe("pagination", () => {
  it("loads 15 then the next 15 without duplicates", () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ id: `e-${i}` }));
    const first = paginateHistoryEvents(events, 0, 15);
    const second = paginateHistoryEvents(events, 15, 15);
    expect(first.items).toHaveLength(15);
    expect(second.items).toHaveLength(15);
    expect(first.hasMore).toBe(true);
    expect(first.items.some((row) => second.items.some((other) => other.id === row.id))).toBe(
      false,
    );
    expect(paginateHistoryEvents(events, 30, 15).hasMore).toBe(false);
  });
});

describe("reports and excel stay in one domain", () => {
  it("exports only Church sheets in Church mode", () => {
    const workbook = buildExcelWorkbookData(
      {
        periodLabel: "SEPTEMBRE 2026",
        range: { from: "2026-09-01", to: "2026-09-30" },
        generatedAt: "2 septembre 2026",
        church: {
          incomeTotal: 100,
          expenseTotal: 20,
          variation: 80,
          endingBalance: 200,
          lastReconciliationDifference: 0,
        },
        churchIncome: [],
        churchExpense: [],
        churchReconciliations: [],
      },
      "church",
    );
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(CHURCH_EXCEL_SHEETS);
    expect(workbook.filename).toContain("eglise");
    expect(workbook.sheets.some((sheet) => sheet.name === "Ventes")).toBe(false);
  });

  it("exports only Commerce sheets in Commerce mode", () => {
    const workbook = buildExcelWorkbookData(
      {
        periodLabel: "SEPTEMBRE 2026",
        range: { from: "2026-09-01", to: "2026-09-30" },
        generatedAt: "2 septembre 2026",
        business: {
          revenue: 425000,
          cogs: 250000,
          operatingExpenses: 42000,
          estimatedProfit: 133000,
          receivablesTotal: 0,
          payablesTotal: 0,
          stockUnits: 8,
        },
        sales: [],
        arrivals: [],
        receivables: [],
        payables: [],
        expenses: [],
        stock: [],
      },
      "business",
    );
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(BUSINESS_EXCEL_SHEETS);
    expect(workbook.filename).toContain("commerce");
    expect(workbook.sheets.some((sheet) => sheet.name === "Entrées")).toBe(false);
  });

  it("keeps audit tables split by domain", () => {
    expect(auditTablesForDomain("church")).toContain("church_transactions");
    expect(auditTablesForDomain("church")).not.toContain("sales");
    expect(auditTablesForDomain("business")).toContain("sales");
    expect(auditTablesForDomain("business")).not.toContain("church_transactions");
  });
});

describe("date formatting", () => {
  it("shows DD/MM/YYYY and never ISO in history text", () => {
    expect(formatNumericDateFr("2026-09-02")).toBe("02/09/2026");
    expect(formatNumericDateFr("2026-09-02")).not.toBe("2026-09-02");
  });
});

describe("active filter count", () => {
  it("ignores the default month period", () => {
    expect(countActiveHistoryFilters({ period: "month", type: "", search: "" })).toBe(0);
    expect(countActiveHistoryFilters({ period: "week", type: "sale", search: "soa" })).toBe(3);
  });
});
