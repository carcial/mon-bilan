import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  BUSINESS_EXCEL_SHEETS,
  CHURCH_EXCEL_SHEETS,
  buildExcelWorkbookData,
} from "../src/utils/excel-workbook.js";
import { writeExcelBuffer } from "../src/utils/excel-write.js";

const churchData = buildExcelWorkbookData(
  {
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
    churchIncome: [
      {
        transaction_date: "2026-09-02",
        church_funds: { name: "Caisse 1" },
        reason: "Offrande",
        amount_fcfa: 825000,
      },
    ],
    churchExpense: [
      {
        transaction_date: "2026-09-05",
        church_funds: { name: "Caisse 1" },
        reason: "Achat",
        amount_fcfa: 215000,
      },
    ],
    churchReconciliations: [
      {
        reconciled_at: "2026-09-06",
        church_funds: { name: "Caisse 1" },
        theoretical_balance_fcfa: 1000000,
        actual_cash_fcfa: 965000,
        difference_fcfa: -35000,
      },
    ],
  },
  "church",
);

const businessData = buildExcelWorkbookData(
  {
    periodLabel: "SEPTEMBRE 2026",
    range: { from: "2026-09-01", to: "2026-09-30" },
    generatedAt: "2 septembre 2026",
    business: {
      revenue: 425000,
      cogs: 250000,
      operatingExpenses: 42000,
      estimatedProfit: 133000,
      receivablesTotal: 440000,
      payablesTotal: 850000,
      stockUnits: 18,
    },
    sales: [
      {
        sale_date: "2026-09-02",
        customerName: "Maman Jeanne",
        productName: "Pommes",
        quantity: 5,
        total: 155000,
        amountPaid: 50000,
        paymentMethod: "Paiement partiel",
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
      },
    ],
    receivables: [{ name: "Paul", purchases: 125000, paid: 0, outstanding: 125000 }],
    payables: [{ name: "SOA", merchandise: 750000, paid: 200000, outstanding: 550000 }],
    expenses: [
      {
        date: "2026-09-03",
        category: "Loyer",
        amount: 42000,
        reason: "Septembre",
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
  },
  "business",
);

const dir = join(tmpdir(), "mon-bilan-excel-verify");
await mkdir(dir, { recursive: true });

async function verifyWorkbook(data, expectedSheets, extraCheck) {
  const filePath = join(dir, data.filename);
  const { buffer, filename } = await writeExcelBuffer(data);
  await writeFile(filePath, Buffer.from(buffer));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const names = workbook.worksheets.map((sheet) => sheet.name);
  if (names.join("|") !== expectedSheets.join("|")) {
    throw new Error(`Unexpected sheets for ${data.domain}: ${names.join(", ")}`);
  }
  extraCheck?.(workbook);
  await unlink(filePath);
  console.log(`Excel ${data.domain} OK (${filename}) — ${names.length} sheets.`);
}

await verifyWorkbook(churchData, CHURCH_EXCEL_SHEETS, (workbook) => {
  if (workbook.getWorksheet("Ventes") || workbook.getWorksheet("Stock")) {
    throw new Error("Church workbook must not include business sheets");
  }
  const resume = workbook.getWorksheet("Résumé").getSheetValues().flat().join(" ");
  if (resume.toLowerCase().includes("chiffre d'affaires")) {
    throw new Error("Church résumé must not include business totals");
  }
});

await verifyWorkbook(businessData, BUSINESS_EXCEL_SHEETS, (workbook) => {
  if (workbook.getWorksheet("Entrées") || workbook.getWorksheet("Vérifications de caisse")) {
    throw new Error("Business workbook must not include church sheets");
  }
  const sales = workbook.getWorksheet("Ventes");
  const saleCustomer = String(sales.getRow(3).getCell(3).value || "");
  if (!saleCustomer.includes("Jeanne")) {
    throw new Error("Sale row missing customer");
  }
  const stock = workbook.getWorksheet("Stock");
  const stockValues = stock.getSheetValues().flat().join(" ");
  if (!stockValues.toLowerCase().includes("actuel")) {
    throw new Error("Stock snapshot note missing");
  }
});
