import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { buildExcelWorkbookData, EXCEL_SHEET_NAMES } from "../src/utils/excel-workbook.js";
import { writeExcelBuffer } from "../src/utils/excel-write.js";

const data = buildExcelWorkbookData({
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
      domain: "Commerce",
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
});

const dir = join(tmpdir(), "mon-bilan-excel-verify");
const filePath = join(dir, data.filename);

await mkdir(dir, { recursive: true });
const { buffer, filename } = await writeExcelBuffer(data);
await writeFile(filePath, Buffer.from(buffer));

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const names = workbook.worksheets.map((sheet) => sheet.name);
if (names.join("|") !== EXCEL_SHEET_NAMES.join("|")) {
  throw new Error(`Unexpected sheets: ${names.join(", ")}`);
}

const resume = workbook.getWorksheet("Résumé");
const resumeText = resume.getSheetValues().flat().join(" ");
if (!resumeText.includes("ÉGLISE") || !resumeText.includes("COMMERCE")) {
  throw new Error("Résumé is missing domain sections");
}

const sales = workbook.getWorksheet("Commerce - Ventes");
const saleCustomer = String(sales.getRow(2).getCell(2).value || "");
if (!saleCustomer.includes("Jeanne")) {
  throw new Error("Sale row missing customer");
}

const stock = workbook.getWorksheet("Stock");
const stockNote = String(stock.getRow(3).getCell(7).value || stock.getRow(2).getCell(7).value || "");
if (!stockNote.toLowerCase().includes("actuel")) {
  throw new Error("Stock snapshot note missing");
}

await unlink(filePath);
console.log(`Excel workbook OK (${filename}) — ${names.length} sheets, file deleted.`);
