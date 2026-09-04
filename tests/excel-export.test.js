import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { calculatePeriodBusinessTotals, saleItemsTotal } from "../src/utils/business-calc.js";
import { calculatePeriodTotals as churchPeriodTotals, calculateTotalsByFund } from "../src/utils/church-calc.js";
import {
  annotatePaymentRunningBalances,
  excelFilename,
  mapPayableExportRows,
  mapReceivableExportRows,
  mapSaleExportRows,
  mapStockExportRows,
  shortRef,
  snapshotStateNote,
  TECHNICAL_ID_HEADER,
} from "../src/utils/excel-export-map.js";
import {
  BUSINESS_EXCEL_SHEETS,
  CHURCH_EXCEL_SHEETS,
  buildExcelWorkbookData,
  summaryValue,
} from "../src/utils/excel-workbook.js";
import { DATE_FORMAT, MONEY_FORMAT, writeExcelBuffer } from "../src/utils/excel-write.js";
import { formatNumericDateFr } from "../src/utils/dates.js";
import { getPeriodRange, PERIODS } from "../src/utils/periods.js";

const ordinaryFund = { id: "ord", code: "ordinary", name: "Ordinaire" };
const worksFund = { id: "wrk", code: "works", name: "Travaux" };

function churchFixture(overrides = {}) {
  return buildExcelWorkbookData(
    {
      periodLabel: "2026",
      periodKind: "year",
      range: { from: "2026-01-01", to: "2026-12-31" },
      generatedAt: "04/09/2026",
      church: {
        incomeTotal: 825000,
        expenseTotal: 215000,
        variation: 610000,
        endingBalance: 1200000,
        lastReconciliationDifference: -35000,
        byFund: [
          {
            fund: ordinaryFund,
            incomeTotal: 700000,
            expenseTotal: 150000,
            endingBalance: 900000,
          },
          {
            fund: worksFund,
            incomeTotal: 125000,
            expenseTotal: 65000,
            endingBalance: 300000,
          },
        ],
      },
      churchIncome: [
        {
          id: "aaaaaaaa-1111-4000-8000-000000000001",
          transaction_date: "2026-09-02",
          church_funds: { name: "Ordinaire" },
          reason: "Offrande",
          amount_fcfa: 700000,
          note: "Dimanche",
        },
      ],
      churchExpense: [
        {
          id: "bbbbbbbb-2222-4000-8000-000000000002",
          transaction_date: "2026-09-05",
          church_funds: { name: "Travaux" },
          reason: "Ciment",
          amount_fcfa: 65000,
        },
      ],
      churchFunds: [
        {
          id: ordinaryFund.id,
          name: "Ordinaire",
          code: "ordinary",
          opening_balance_fcfa: 350000,
          incomeTotal: 700000,
          expenseTotal: 150000,
          endingBalance: 900000,
        },
        {
          id: worksFund.id,
          name: "Travaux",
          code: "works",
          opening_balance_fcfa: 240000,
          incomeTotal: 125000,
          expenseTotal: 65000,
          endingBalance: 300000,
        },
      ],
      churchReconciliations: [
        {
          id: "cccccccc-3333-4000-8000-000000000003",
          reconciled_at: "2026-09-06",
          church_funds: { name: "Ordinaire" },
          theoretical_balance_fcfa: 1000000,
          actual_cash_fcfa: 965000,
          difference_fcfa: -35000,
        },
      ],
      churchHistory: [
        {
          date: "2026-09-06",
          type: "reconciliation",
          subtitle: "Ordinaire",
          amount: -35000,
          title: "Vérification de caisse",
          reference: "CCCCCCCC",
          sourceId: "cccccccc-3333-4000-8000-000000000003",
        },
      ],
      ...overrides,
    },
    "church",
  );
}

function businessFixture(overrides = {}) {
  const sale = {
    id: "dddddddd-4444-4000-8000-000000000004",
    customer_id: "cust-1",
    sale_date: "2026-09-02",
    settlement_status: "partial",
    payment_method: "cash",
    amount_paid_fcfa: 50000,
    repayment_expectation: "exact",
    repayment_exact_date: "2026-09-20",
    note: "Reste à venir",
    customers: { name: "Maman Jeanne", phone: "690000000" },
    sale_items: [
      {
        quantity: 5,
        sale_unit_price_fcfa: 31000,
        supplier_unit_price_fcfa: 25000,
        products: { name: "Pommes" },
        stock_arrivals: { id: "lot-1", arrival_date: "2026-09-01" },
      },
    ],
  };

  return buildExcelWorkbookData(
    {
      periodLabel: "SEPTEMBRE 2026",
      periodKind: "month",
      range: { from: "2026-09-01", to: "2026-09-30" },
      generatedAt: "04/09/2026",
      business: {
        revenue: 155000,
        cogs: 125000,
        grossMargin: 30000,
        operatingExpenses: 42000,
        estimatedProfit: -12000,
        cashCollected: 90000,
        receivablesTotal: 105000,
        payablesTotal: 550000,
        stockUnits: 18,
      },
      sales: [sale],
      remainderBySaleId: new Map([[sale.id, 105000]]),
      customerPayments: [
        {
          id: "pay-1",
          payment_date: "2026-09-08",
          customerName: "Maman Jeanne",
          amount_fcfa: 40000,
          paymentMethodLabel: "Espèces",
          saleReference: "02/09/2026 · DDDDDDDD",
          previousOutstanding: 145000,
          remainingAfter: 105000,
          note: "Deuxième versement",
          reference: "PAY1REF1",
        },
      ],
      arrivals: [
        {
          id: "eeeeeeee-5555-4000-8000-000000000005",
          arrival_date: "2026-09-01",
          suppliers: { name: "SOA" },
          products: { name: "Pommes" },
          quantity_received: 30,
          supplier_unit_price_fcfa: 25000,
          transport_fcfa: 30000,
          unloading_fcfa: 10000,
          other_expenses_fcfa: 5000,
          advance_paid_fcfa: 200000,
          expenses_owed_to_supplier: false,
          note: "Camion",
        },
      ],
      supplierPayments: [
        {
          id: "spay-1",
          payment_date: "2026-09-10",
          supplierName: "SOA",
          amount_fcfa: 100000,
          paymentMethodLabel: "Espèces",
          arrivalReference: "01/09/2026 · EEEEEEEE",
          note: "",
          reference: "SPAY0001",
        },
      ],
      receivables: [
        {
          customer: {
            id: "ffffffff-6666-4000-8000-000000000006",
            name: "Maman Jeanne",
            phone: "690000000",
            note: "Marché",
          },
          purchases: 155000,
          paid: 50000,
          outstanding: 105000,
          remainders: [{ saleId: sale.id, saleDate: "2026-09-02", remaining: 105000, sale }],
          dueSale: sale,
        },
      ],
      payables: [
        {
          supplier: { id: "99999999-7777-4000-8000-000000000007", name: "SOA" },
          merchandise: 750000,
          paid: 200000,
          outstanding: 550000,
          arrivals: [
            {
              expenses_owed_to_supplier: false,
              transport_fcfa: 30000,
              unloading_fcfa: 10000,
              other_expenses_fcfa: 5000,
            },
          ],
        },
      ],
      expenses: [
        {
          id: "exp-1",
          date: "2026-09-03",
          category: "Loyer",
          amount: 42000,
          reason: "Septembre",
          relatedLabel: "—",
          note: "",
        },
      ],
      customers: [
        {
          id: "ffffffff-6666-4000-8000-000000000006",
          name: "Maman Jeanne",
          phone: "690000000",
          note: "Marché",
          purchases: 155000,
          paid: 50000,
          outstanding: 105000,
        },
      ],
      suppliers: [
        {
          id: "99999999-7777-4000-8000-000000000007",
          name: "SOA",
          phone: "699000000",
          note: "Yaoundé",
          merchandise: 750000,
          paid: 200000,
          outstanding: 550000,
        },
      ],
      allArrivals: [
        {
          id: "eeeeeeee-5555-4000-8000-000000000005",
          arrival_date: "2026-09-01",
          suppliers: { name: "SOA" },
          products: { name: "Pommes", unit_type: "sac" },
          quantity_received: 30,
          supplier_unit_price_fcfa: 25000,
        },
      ],
      arrivalInventory: [
        {
          arrival_id: "eeeeeeee-5555-4000-8000-000000000005",
          quantity_received: 30,
          quantity_sold: 12,
          quantity_adjustments: 0,
          quantity_remaining: 18,
        },
      ],
      stock: [],
      ...overrides,
    },
    "business",
  );
}

describe("excel workbook sheets", () => {
  it("builds the commerce backup sheets in a stable order", () => {
    const workbook = businessFixture();
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(BUSINESS_EXCEL_SHEETS);
    expect(workbook.filename).toBe("mon-bilan-commerce-2026-09.xlsx");
    expect(workbook.sheets.some((sheet) => sheet.name === "Entrées")).toBe(false);
  });

  it("builds the church backup sheets in a stable order", () => {
    const workbook = churchFixture();
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(CHURCH_EXCEL_SHEETS);
    expect(workbook.filename).toBe("mon-bilan-eglise-2026.xlsx");
    expect(workbook.sheets.some((sheet) => sheet.name === "Ventes")).toBe(false);
  });

  it("never mixes commerce and church money in the same workbook", () => {
    const church = churchFixture();
    const business = businessFixture();
    const churchBlob = JSON.stringify(church.sheets);
    const businessBlob = JSON.stringify(business.sheets);
    expect(churchBlob.toLowerCase()).not.toMatch(/chiffre d'affaires|ventes|arrivages/);
    expect(businessBlob.toLowerCase()).not.toMatch(/ordinaire|travaux|vérifications de caisse/);
    expect(church.filename).toContain("eglise");
    expect(business.filename).toContain("commerce");
  });
});

describe("excel filenames for year and month", () => {
  it("uses year and month file names requested for backups", () => {
    expect(excelFilename("2026-01-01", "2026-12-31", "business", "year")).toBe(
      "mon-bilan-commerce-2026.xlsx",
    );
    expect(excelFilename("2026-09-01", "2026-09-30", "business", "month")).toBe(
      "mon-bilan-commerce-2026-09.xlsx",
    );
    expect(excelFilename("2026-01-01", "2026-12-31", "church", "year")).toBe(
      "mon-bilan-eglise-2026.xlsx",
    );
  });

  it("keeps custom / week ranges as explicit date bounds", () => {
    const week = getPeriodRange(PERIODS.week, { now: new Date(2026, 8, 4) });
    expect(excelFilename(week.from, week.to, "business", "week")).toBe(
      `mon-bilan-commerce-${week.from}_${week.to}.xlsx`,
    );
  });
});

describe("commerce summary uses canonical totals", () => {
  it("copies dashboard / report totals without recomputing them", () => {
    const saleItems = [
      { quantity: 5, sale_unit_price_fcfa: 31000, supplier_unit_price_fcfa: 25000 },
    ];
    const sales = [{ amount_paid_fcfa: 50000 }];
    const customerPayments = [{ amount_fcfa: 40000 }];
    const expenses = [{ amount_fcfa: 42000 }];
    const totals = calculatePeriodBusinessTotals({
      saleItems,
      sales,
      customerPayments,
      expenses,
    });

    const workbook = businessFixture({
      business: {
        revenue: totals.revenue,
        cogs: totals.cogs,
        grossMargin: totals.grossMargin,
        operatingExpenses: totals.operatingExpenses,
        estimatedProfit: totals.estimatedProfit,
        cashCollected: totals.cashCollected,
        receivablesTotal: 105000,
        payablesTotal: 550000,
        stockUnits: 18,
      },
    });

    expect(summaryValue(workbook, "Chiffre d'affaires")).toBe(totals.revenue);
    expect(summaryValue(workbook, "Montant fournisseur (quantité vendue)")).toBe(totals.cogs);
    expect(summaryValue(workbook, "Marge estimée")).toBe(totals.grossMargin);
    expect(summaryValue(workbook, "Dépenses")).toBe(totals.operatingExpenses);
    expect(summaryValue(workbook, "Bénéfice estimé")).toBe(totals.estimatedProfit);
    expect(summaryValue(workbook, "Paiements reçus")).toBe(totals.cashCollected);
    expect(summaryValue(workbook, "À recevoir (état actuel)")).toBe(105000);
    expect(summaryValue(workbook, "À payer (état actuel)")).toBe(550000);
    expect(summaryValue(workbook, "Stock (unités actuelles)")).toBe(18);
  });
});

describe("commerce transaction coverage", () => {
  it("exports one sale row with stored fields and numeric money", () => {
    const workbook = businessFixture();
    const ventes = workbook.sheets.find((sheet) => sheet.name === "Ventes");
    expect(ventes.rows).toHaveLength(1);
    expect(ventes.rows[0][0]).toEqual({ kind: "date", value: "2026-09-02" });
    expect(ventes.rows[0][2].value).toBe("Maman Jeanne");
    expect(ventes.rows[0][5]).toEqual({ kind: "int", value: 5 });
    expect(ventes.rows[0][7]).toEqual({ kind: "money", value: 155000 });
    expect(ventes.rows[0][9]).toEqual({ kind: "money", value: 125000 });
    expect(ventes.rows[0][10]).toEqual({ kind: "money", value: 30000 });
    expect(ventes.totals[0].value).toBe("TOTAL VENTES");
    expect(ventes.totals[7].value).toBe(155000);
  });

  it("keeps customer payments individually traceable", () => {
    const workbook = businessFixture();
    const sheet = workbook.sheets.find((s) => s.name === "Paiements clients");
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0][2]).toEqual({ kind: "money", value: 40000 });
    expect(sheet.rows[0][5]).toEqual({ kind: "money", value: 145000 });
    expect(sheet.rows[0][6]).toEqual({ kind: "money", value: 105000 });
    expect(sheet.totals[0].value).toBe("TOTAL PAIEMENTS");
  });

  it("totals current customer debts and supplier liabilities", () => {
    const workbook = businessFixture();
    const receivables = workbook.sheets.find((s) => s.name === "Clients à recevoir");
    const payables = workbook.sheets.find((s) => s.name === "Fournisseurs à payer");
    expect(receivables.rows[0][3]).toEqual({ kind: "money", value: 105000 });
    expect(receivables.totals[0].value).toBe("TOTAL À RECEVOIR");
    expect(receivables.totals[3].value).toBe(105000);
    expect(payables.rows[0][5]).toEqual({ kind: "money", value: 550000 });
    expect(payables.totals[0].value).toBe("TOTAL À PAYER");
    expect(payables.totals[5].value).toBe(550000);
  });

  it("exports arrival-level stock from canonical inventory quantities", () => {
    const workbook = businessFixture();
    const stock = workbook.sheets.find((s) => s.name === "Stock");
    expect(stock.rows).toHaveLength(1);
    expect(stock.rows[0][4]).toEqual({ kind: "int", value: 30 });
    expect(stock.rows[0][5]).toEqual({ kind: "int", value: 12 });
    expect(stock.rows[0][7]).toEqual({ kind: "int", value: 18 });
    expect(stock.note.toLowerCase()).toContain("actuel");
  });

  it("shows a clean empty state instead of a broken table", () => {
    const workbook = businessFixture({
      sales: [],
      customerPayments: [],
      arrivals: [],
      supplierPayments: [],
      receivables: [],
      payables: [],
      expenses: [],
      customers: [],
      suppliers: [],
      allArrivals: [],
      arrivalInventory: [],
      stock: [],
    });
    const ventes = workbook.sheets.find((s) => s.name === "Ventes");
    expect(ventes.rows).toEqual([]);
    expect(ventes.emptyText).toBe("Aucune donnée pour cette période.");
    expect(ventes.totals).toBeNull();
  });
});

describe("church summary and movements", () => {
  it("shows Ordinaire, Travaux, and combined balances from canonical fund totals", () => {
    const transactions = [
      { fund_id: "ord", transaction_type: "income", amount_fcfa: 700000 },
      { fund_id: "ord", transaction_type: "expense", amount_fcfa: 150000 },
      { fund_id: "wrk", transaction_type: "income", amount_fcfa: 125000 },
      { fund_id: "wrk", transaction_type: "expense", amount_fcfa: 65000 },
    ];
    const combined = churchPeriodTotals(transactions);
    const byFund = calculateTotalsByFund(transactions, [ordinaryFund, worksFund]);
    const workbook = churchFixture({
      church: {
        incomeTotal: combined.incomeTotal,
        expenseTotal: combined.expenseTotal,
        variation: combined.netMovement,
        endingBalance: 1200000,
        lastReconciliationDifference: -35000,
        byFund: byFund.map((row) => ({
          ...row,
          endingBalance: row.fund.id === "ord" ? 900000 : 300000,
        })),
      },
    });

    expect(summaryValue(workbook, "Ordinaire — Entrées")).toBe(700000);
    expect(summaryValue(workbook, "Ordinaire — Sorties")).toBe(150000);
    expect(summaryValue(workbook, "Ordinaire — Solde")).toBe(900000);
    expect(summaryValue(workbook, "Travaux — Entrées")).toBe(125000);
    expect(summaryValue(workbook, "Travaux — Sorties")).toBe(65000);
    expect(summaryValue(workbook, "Travaux — Solde")).toBe(300000);
    expect(summaryValue(workbook, "Entrées")).toBe(combined.incomeTotal);
    expect(summaryValue(workbook, "Sorties")).toBe(combined.expenseTotal);
    expect(summaryValue(workbook, "Solde")).toBe(1200000);
  });

  it("keeps church income and expense rows individually dated and numeric", () => {
    const workbook = churchFixture();
    const income = workbook.sheets.find((s) => s.name === "Entrées");
    expect(income.rows).toHaveLength(1);
    expect(income.rows[0][0]).toEqual({ kind: "date", value: "2026-09-02" });
    expect(income.rows[0][2]).toEqual({ kind: "money", value: 700000 });
    expect(income.totals[0].value).toBe("TOTAL ENTRÉES");
  });
});

describe("year vs month filtering of prepared rows", () => {
  it("includes only the rows given for that period", () => {
    const septemberSale = {
      id: "s-sep",
      sale_date: "2026-09-02",
      customers: { name: "A" },
      amount_paid_fcfa: 0,
      sale_items: [{ quantity: 1, sale_unit_price_fcfa: 10000, supplier_unit_price_fcfa: 8000, products: { name: "Riz" } }],
    };
    const monthWorkbook = businessFixture({ sales: [septemberSale] });
    const yearWorkbook = businessFixture({
      periodKind: "year",
      range: { from: "2026-01-01", to: "2026-12-31" },
      sales: [
        septemberSale,
        {
          id: "s-jan",
          sale_date: "2026-01-15",
          customers: { name: "B" },
          amount_paid_fcfa: 0,
          sale_items: [{ quantity: 2, sale_unit_price_fcfa: 10000, supplier_unit_price_fcfa: 8000, products: { name: "Riz" } }],
        },
      ],
    });
    expect(monthWorkbook.filename).toBe("mon-bilan-commerce-2026-09.xlsx");
    expect(yearWorkbook.filename).toBe("mon-bilan-commerce-2026.xlsx");
    expect(monthWorkbook.sheets.find((s) => s.name === "Ventes").rows).toHaveLength(1);
    expect(yearWorkbook.sheets.find((s) => s.name === "Ventes").rows).toHaveLength(2);
  });
});

describe("pure export helpers", () => {
  it("derives payment running balances from the same outstanding rule", () => {
    const sales = [
      {
        id: "s1",
        customer_id: "c1",
        sale_date: "2026-09-01",
        created_at: "2026-09-01T08:00:00",
        amount_paid_fcfa: 20000,
        sale_items: [{ quantity: 1, sale_unit_price_fcfa: 100000 }],
      },
    ];
    const payments = [
      {
        id: "p1",
        customer_id: "c1",
        payment_date: "2026-09-03",
        created_at: "2026-09-03T08:00:00",
        amount_fcfa: 30000,
      },
    ];
    const running = annotatePaymentRunningBalances(sales, payments);
    expect(running.get("p1")).toEqual({ previous: 80000, remaining: 50000 });
  });

  it("maps stock lots from arrival inventory", () => {
    const rows = mapStockExportRows(
      [
        {
          id: "arr-1",
          arrival_date: "2026-09-01",
          suppliers: { name: "SOA" },
          products: { name: "Pommes", unit_type: "sac" },
          quantity_received: 30,
          supplier_unit_price_fcfa: 25000,
        },
      ],
      [{ arrival_id: "arr-1", quantity_received: 30, quantity_sold: 12, quantity_adjustments: -1, quantity_remaining: 17 }],
      [],
    );
    expect(rows[0].quantity_available).toBe(17);
    expect(rows[0].quantity_adjustments).toBe(-1);
    expect(rows[0].supplier_unit_price_fcfa).toBe(25000);
  });

  it("does not invent customer or supplier debt fields", () => {
    expect(mapReceivableExportRows([{ name: "Paul", purchases: 10, paid: 10, outstanding: 0 }])).toEqual([]);
    expect(mapPayableExportRows([{ name: "SOA", merchandise: 10, paid: 10, outstanding: 0 }])).toEqual([]);
    expect(shortRef("aaaaaaaa-1111-4000-8000-000000000001")).toBe("AAAAAAAA");
  });

  it("uses stored sale items for sale totals", () => {
    const rows = mapSaleExportRows([
      {
        id: "s1",
        sale_date: "2026-09-02",
        customers: { name: "Paul" },
        amount_paid_fcfa: 0,
        settlement_status: "credit",
        sale_items: [
          { quantity: 2, sale_unit_price_fcfa: 38000, supplier_unit_price_fcfa: 35000, products: { name: "Riz" } },
        ],
      },
    ]);
    expect(rows[0].total).toBe(saleItemsTotal({
      sale_items: [{ quantity: 2, sale_unit_price_fcfa: 38000 }],
    }));
    expect(rows[0].supplierAmount).toBe(70000);
    expect(rows[0].margin).toBe(6000);
  });
});

describe("snapshot notes and technical IDs", () => {
  it("labels current-state commerce sheets with the generated date", () => {
    const workbook = businessFixture();
    const expected = snapshotStateNote("04/09/2026");
    for (const name of ["Clients à recevoir", "Fournisseurs à payer", "Stock"]) {
      const sheet = workbook.sheets.find((row) => row.name === name);
      expect(sheet.banner).toBe(expected);
      expect(sheet.note).toBe(expected);
      expect(sheet.banner).toContain("04/09/2026");
      expect(sheet.banner).toContain("situation actuelle");
    }
    const ventes = workbook.sheets.find((row) => row.name === "Ventes");
    expect(ventes.banner).toBe("");
  });

  it("keeps the short reference and preserves the full stored identifier", () => {
    const workbook = businessFixture();
    const ventes = workbook.sheets.find((row) => row.name === "Ventes");
    expect(ventes.headers).toContain("Référence");
    expect(ventes.headers.at(-1)).toBe(TECHNICAL_ID_HEADER);
    expect(ventes.rows[0][1].value).toBe("DDDDDDDD");
    expect(ventes.rows[0].at(-1).value).toBe("dddddddd-4444-4000-8000-000000000004");

    const income = churchFixture().sheets.find((row) => row.name === "Entrées");
    expect(income.headers.at(-1)).toBe(TECHNICAL_ID_HEADER);
    expect(income.rows[0].at(-1).value).toBe("aaaaaaaa-1111-4000-8000-000000000001");
    expect(income.headers.join(" ").toLowerCase()).not.toContain("entity_id");
  });

  it("keeps domain isolation after adding technical IDs", () => {
    const church = churchFixture();
    const business = businessFixture();
    expect(church.sheets.map((sheet) => sheet.name)).toEqual(CHURCH_EXCEL_SHEETS);
    expect(business.sheets.map((sheet) => sheet.name)).toEqual(BUSINESS_EXCEL_SHEETS);
    expect(church.sheets.some((sheet) => sheet.name === "Ventes")).toBe(false);
    expect(business.sheets.some((sheet) => sheet.name === "Entrées")).toBe(false);
    expect(JSON.stringify(church.sheets).toLowerCase()).not.toMatch(/chiffre d'affaires/);
    expect(JSON.stringify(business.sheets).toLowerCase()).not.toMatch(/vérifications de caisse/);
  });
});

describe("written xlsx compatibility", () => {
  it("writes numeric FCFA, DD/MM/YYYY dates, and the expected sheets", async () => {
    const data = businessFixture();
    const { buffer, filename } = await writeExcelBuffer(data);
    expect(filename).toBe("mon-bilan-commerce-2026-09.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(BUSINESS_EXCEL_SHEETS);

    const resume = workbook.getWorksheet("Résumé");
    const resumeText = resume.getSheetValues().flat().join(" ");
    expect(resumeText).toContain("Rapport commerce");
    expect(resumeText).toContain("Chiffre d'affaires");

    const ventes = workbook.getWorksheet("Ventes");
    const dateCell = ventes.getRow(3).getCell(1);
    expect(dateCell.numFmt).toBe(DATE_FORMAT);
    expect(formatNumericDateFr(dateCell.value)).toBe("02/09/2026");

    const totalCell = ventes.getRow(3).getCell(8);
    expect(totalCell.value).toBe(155000);
    expect(totalCell.numFmt).toBe(MONEY_FORMAT);

    const stock = workbook.getWorksheet("Stock");
    expect(String(stock.getRow(2).getCell(1).value || "")).toContain("État actuel au 04/09/2026");
    const stockIdCol = stock.getColumn(stock.columnCount);
    expect(stockIdCol.hidden).toBe(true);
    expect(stock.getRow(3).getCell(stock.columnCount).value).toBe(TECHNICAL_ID_HEADER);
    expect(stock.getRow(4).getCell(stock.columnCount).value).toBe(
      "eeeeeeee-5555-4000-8000-000000000005",
    );

    const church = await writeExcelBuffer(churchFixture());
    const churchBook = new ExcelJS.Workbook();
    await churchBook.xlsx.load(church.buffer);
    expect(churchBook.worksheets.map((sheet) => sheet.name)).toEqual(CHURCH_EXCEL_SHEETS);
    expect(churchBook.getWorksheet("Ventes")).toBeUndefined();
    expect(churchBook.getWorksheet("Résumé").getSheetValues().flat().join(" ")).toContain("Ordinaire");
    const entrees = churchBook.getWorksheet("Entrées");
    expect(entrees.getColumn(entrees.columnCount).hidden).toBe(true);
    expect(entrees.getRow(3).getCell(entrees.columnCount).value).toBe(
      "aaaaaaaa-1111-4000-8000-000000000001",
    );
  });
});
