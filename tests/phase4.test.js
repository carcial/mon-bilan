import { describe, expect, it } from "vitest";
import { formatFcfa } from "../src/utils/money.js";
import {
  endOfMonth,
  getPeriodRange,
  isDateInRange,
  PERIODS,
  startOfWeekMonday,
} from "../src/utils/periods.js";
import {
  filterHistoryEvents,
  HISTORY_DOMAINS,
  HISTORY_TYPES,
  normalizeArrival,
  normalizeChurchTransaction,
  normalizeCustomerPayment,
  normalizeSale,
  paginateHistoryEvents,
  saleLineTotal,
  sortHistoryEvents,
} from "../src/utils/history-events.js";
import { buildGlobalReport, hasForbiddenCombinedTotal } from "../src/utils/global-report.js";
import { formatAuditEvent } from "../src/utils/audit-format.js";
import { buildExcelWorkbookData, CHURCH_EXCEL_SHEETS } from "../src/utils/excel-workbook.js";
import { matchMoreRoute } from "../src/modules/more/more-routes.js";

const arrivalRow = {
  id: "arr-1",
  supplier_id: "sup-1",
  arrival_date: "2026-09-02",
  quantity_received: 30,
  supplier_unit_price_fcfa: 25000,
  created_at: "2026-09-02T10:00:00Z",
  note: "Camion SOA",
  suppliers: { id: "sup-1", code: "SOA", name: "SOA" },
  products: { id: "p1", name: "Pommes" },
};

const saleRow = {
  id: "sale-1",
  customer_id: "c1",
  sale_date: "2026-09-02",
  amount_paid_fcfa: 50000,
  settlement_status: "partial",
  payment_method: "cash",
  created_at: "2026-09-02T11:00:00Z",
  note: "Acompte",
  customers: { id: "c1", name: "Maman Jeanne" },
  sale_items: [
    {
      quantity: 5,
      sale_unit_price_fcfa: 31000,
      effective_unit_cost_fcfa: 26500,
      products: { name: "Pommes" },
    },
  ],
};

describe("history normalization", () => {
  it("normalizes a church income with domain and source", () => {
    const event = normalizeChurchTransaction({
      id: "tx-1",
      fund_id: "f1",
      transaction_type: "income",
      amount_fcfa: 825000,
      transaction_date: "2026-09-01",
      reason: "Offrande",
      note: "Dimanche",
      created_at: "2026-09-01T08:00:00Z",
      church_funds: { name: "Caisse principale" },
    });
    expect(event.domain).toBe(HISTORY_DOMAINS.church);
    expect(event.type).toBe(HISTORY_TYPES.income);
    expect(event.amount).toBe(825000);
    expect(event.direction).toBe("in");
    expect(event.sourceTable).toBe("church_transactions");
    expect(event.searchText).toContain("offrande");
  });

  it("normalizes arrival merchandise value", () => {
    const event = normalizeArrival(arrivalRow);
    expect(event.domain).toBe("business");
    expect(event.amount).toBe(750000);
    expect(event.subtitle).toContain("SOA");
    expect(event.subtitle).toContain("Pommes");
  });

  it("computes sale totals without depending on DOM", () => {
    expect(saleLineTotal(saleRow)).toBe(155000);
    const event = normalizeSale(saleRow);
    expect(event.amount).toBe(155000);
    expect(event.customerId).toBe("c1");
  });
});

describe("global sorting and filtering", () => {
  it("sorts newest first", () => {
    const events = sortHistoryEvents([
      { id: "a", date: "2026-08-01", createdAt: "2026-08-01T10:00:00Z" },
      { id: "b", date: "2026-09-02", createdAt: "2026-09-02T09:00:00Z" },
      { id: "c", date: "2026-09-02", createdAt: "2026-09-02T12:00:00Z" },
    ]);
    expect(events.map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("filters by period, domain, type and search", () => {
    const events = [
      normalizeChurchTransaction({
        id: "1",
        fund_id: "f1",
        transaction_type: "income",
        amount_fcfa: 1000,
        transaction_date: "2026-09-02",
        reason: "Dîme",
        church_funds: { name: "Caisse 1" },
      }),
      normalizeArrival(arrivalRow),
      normalizeCustomerPayment({
        id: "pay-1",
        customer_id: "c1",
        amount_fcfa: 40000,
        payment_date: "2026-08-10",
        customers: { name: "Paul" },
      }),
    ];

    const september = filterHistoryEvents(events, {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(september).toHaveLength(2);

    const churchOnly = filterHistoryEvents(events, { domain: "church" });
    expect(churchOnly).toHaveLength(1);

    const search = filterHistoryEvents(events, { search: "soa" });
    expect(search).toHaveLength(1);
    expect(search[0].type).toBe("arrival");
  });

  it("paginates with load-more semantics", () => {
    const events = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
    const page = paginateHistoryEvents(events, 0, 25);
    expect(page.items).toHaveLength(25);
    expect(page.hasMore).toBe(true);
    expect(paginateHistoryEvents(events, 25, 25).hasMore).toBe(false);
  });
});

describe("date boundaries", () => {
  it("uses Monday-start weeks and local month ends", () => {
    const wednesday = new Date(2026, 8, 2); // 2 septembre 2026, mercredi
    const week = getPeriodRange(PERIODS.week, { now: wednesday });
    expect(week.from).toBe("2026-08-31");
    expect(week.to).toBe("2026-09-06");
    expect(startOfWeekMonday(wednesday).getDay()).toBe(1);
    expect(endOfMonth(wednesday).getDate()).toBe(30);
  });

  it("does not treat YYYY-MM-DD as UTC", () => {
    expect(isDateInRange("2026-09-01", "2026-09-01", "2026-09-01")).toBe(true);
    expect(isDateInRange("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
  });
});

describe("report transformations", () => {
  it("keeps church and business separate and never adds a grand total", () => {
    const report = buildGlobalReport({
      range: { from: "2026-09-01", to: "2026-09-30" },
      church: {
        transactions: [
          { transaction_type: "income", amount_fcfa: 825000 },
          { transaction_type: "expense", amount_fcfa: 215000 },
        ],
        endingTotal: 1200000,
        lastReconciliation: { difference_fcfa: -35000, reconciled_at: "2026-09-01T18:00:00Z" },
      },
      business: {
        saleItems: [
          { quantity: 10, sale_unit_price_fcfa: 30000, supplier_unit_price_fcfa: 22000, effective_unit_cost_fcfa: 25000 },
        ],
        sales: [{ amount_paid_fcfa: 200000 }],
        customerPayments: [{ amount_fcfa: 40000 }],
        expenses: [{ amount_fcfa: 15000, is_arrival_cost_allocation: false }],
        receivablesTotal: 440000,
        payablesTotal: 850000,
        stockUnits: 18,
      },
    });

    expect(report.church.incomeTotal).toBe(825000);
    expect(report.church.expenseTotal).toBe(215000);
    expect(report.church.variation).toBe(610000);
    expect(report.business.revenue).toBe(300000);
    expect(report.business.cogs).toBe(220000);
    expect(report.business.operatingExpenses).toBe(15000);
    expect(report.business.estimatedProfit).toBe(65000);
    expect(report.business.cashCollected).toBe(240000);
    expect(hasForbiddenCombinedTotal(report)).toBe(false);
    expect(report.church.incomeTotal + report.business.revenue).not.toBe(
      report.church.endingBalance,
    );
  });

  it("does not double-count arrival-allocated expenses", () => {
    const report = buildGlobalReport({
      business: {
        expenses: [
          { amount_fcfa: 30000, is_arrival_cost_allocation: true },
          { amount_fcfa: 12000, is_arrival_cost_allocation: false },
        ],
      },
    });
    expect(report.business.operatingExpenses).toBe(12000);
  });
});

describe("audit formatting", () => {
  it("describes a church amount change in French", () => {
    const formatted = formatAuditEvent({
      entity_table: "church_transactions",
      action: "update",
      previous_values: { amount_fcfa: 150000, reason: "Offrande" },
      new_values: { amount_fcfa: 15000, reason: "Offrande" },
    });
    expect(formatted.title).toBe("Transaction Église modifiée");
    expect(formatted.summary).toContain("150");
    expect(formatted.summary).toContain("15");
    expect(formatted.hasAmountChange).toBe(true);
  });

  it("describes a deleted sale", () => {
    const formatted = formatAuditEvent({
      entity_table: "sales",
      action: "delete",
      previous_values: { amount_paid_fcfa: 50000 },
    });
    expect(formatted.title).toBe("Vente supprimée");
    expect(formatted.summary).toContain("FCFA");
  });

  it("describes a modified supplier", () => {
    const formatted = formatAuditEvent({
      entity_table: "suppliers",
      action: "update",
      previous_values: { name: "SOA" },
      new_values: { name: "SOA Yaoundé" },
    });
    expect(formatted.title).toBe("Fournisseur modifié");
    expect(formatted.summary).toContain("SOA Yaoundé");
  });
});

describe("excel export data structure", () => {
  it("creates church worksheets without UUID columns or business sheets", () => {
    const workbook = buildExcelWorkbookData({
      periodLabel: "SEPTEMBRE 2026",
      range: { from: "2026-09-01", to: "2026-09-30" },
      generatedAt: "2 septembre 2026",
      church: {
        incomeTotal: 825000,
        expenseTotal: 215000,
        variation: 610000,
        endingBalance: 1200000,
        lastReconciliationDifference: -35000,
      },
      business: {
        revenue: 425000,
        cogs: 250000,
        operatingExpenses: 42000,
        estimatedProfit: 133000,
        receivablesTotal: 440000,
        payablesTotal: 850000,
        stockUnits: 18,
      },
      churchIncome: [
        {
          transaction_date: "2026-09-02",
          church_funds: { name: "Caisse 1" },
          reason: "Offrande",
          amount_fcfa: 825000,
          note: null,
        },
      ],
      churchExpense: [],
      churchReconciliations: [],
      sales: [
        {
          sale_date: "2026-09-02",
          customerName: "Maman Jeanne",
          productName: "Pommes",
          quantity: 5,
          total: 155000,
          amountPaid: 50000,
          paymentMethod: "Paiement partiel",
          note: "",
        },
      ],
      arrivals: [
        {
          arrival_date: "2026-09-01",
          supplierName: "SOA",
          productName: "Pommes",
          quantity_received: 30,
          supplier_unit_price_fcfa: 25000,
          merchandise: 750000,
          transport_fcfa: 30000,
          unloading_fcfa: 10000,
          other_expenses_fcfa: 5000,
          advance_paid_fcfa: 200000,
          note: "",
        },
      ],
      receivables: [{ name: "Paul", purchases: 125000, paid: 0, outstanding: 125000 }],
      payables: [{ name: "SOA", merchandise: 750000, paid: 200000, outstanding: 550000 }],
      expenses: [
        {
          date: "2026-09-03",
          domain: "Commerce",
          category: "Loyer",
          amount: 42000,
          reason: "Septembre",
          note: "",
        },
      ],
      stock: [
        {
          product_name: "Pommes",
          unit_type: "sac",
          quantity_received: 30,
          quantity_sold: 12,
          quantity_adjustments: 0,
          quantity_available: 18,
        },
      ],
    }, "church");

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(CHURCH_EXCEL_SHEETS);
    expect(workbook.sheets.map((sheet) => sheet.name).join(" ")).not.toMatch(/Ventes|Arrivages|Stock/);
    const headerBlob = workbook.sheets
      .flatMap((sheet) => sheet.headers)
      .join(" ")
      .toLowerCase();
    expect(headerBlob).not.toContain("uuid");
    expect(headerBlob).not.toContain("entity_id");

    const resume = workbook.sheets[0];
    const labels = resume.rows.map((row) => row[0].value);
    expect(labels).toContain("Entrées");
    expect(labels.join(" ")).not.toMatch(/chiffre d'affaires|grand total/i);

    const income = workbook.sheets[1].rows[0];
    expect(income[0].value).toBe("2026-09-02");
    expect(income[0].kind).toBe("date");
    expect(income[3].kind).toBe("money");
    expect(income[3].value).toBe(825000);
    expect(formatFcfa(income[3].value)).toContain("825");
  });
});

describe("more routes", () => {
  it("parses plus sub-routes", () => {
    expect(matchMoreRoute("/plus").name).toBe("menu");
    expect(matchMoreRoute("/plus/rapport").name).toBe("report");
    expect(matchMoreRoute("/plus/export").name).toBe("export");
    expect(matchMoreRoute("/plus/activite").name).toBe("activity");
    expect(matchMoreRoute("/plus/rappels").name).toBe("rappels");
  });
});
