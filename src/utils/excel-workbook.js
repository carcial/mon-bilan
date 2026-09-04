/**
 * Excel workbook structure — one domain per workbook.
 */

import { formatNumericDateFr } from "./dates.js";
import { formatFcfa } from "./money.js";

export const CHURCH_EXCEL_SHEETS = ["Résumé", "Entrées", "Sorties", "Vérifications de caisse"];
export const BUSINESS_EXCEL_SHEETS = [
  "Résumé",
  "Ventes",
  "Arrivages",
  "Clients",
  "Fournisseurs",
  "Dépenses",
  "Stock",
];

/** @deprecated Combined list kept for older tests; new exports are domain-scoped. */
export const EXCEL_SHEET_NAMES = [...CHURCH_EXCEL_SHEETS, ...BUSINESS_EXCEL_SHEETS.slice(1)];

function moneyCell(value) {
  return { kind: "money", value: Number(value) || 0 };
}

function textCell(value) {
  return { kind: "text", value: value == null || value === "" ? "—" : String(value) };
}

function dateCell(value) {
  return { kind: "date", value: value ? formatNumericDateFr(value) : "—" };
}

function intCell(value) {
  return { kind: "int", value: Number(value) || 0 };
}

function sheet(name, headers, rows, note = "") {
  return { name, headers, rows, note };
}

function emptyDomainData() {
  return {
    church: {
      incomeTotal: 0,
      expenseTotal: 0,
      variation: 0,
      endingBalance: 0,
      lastReconciliationDifference: null,
    },
    business: {
      revenue: 0,
      cogs: 0,
      operatingExpenses: 0,
      estimatedProfit: 0,
      receivablesTotal: 0,
      payablesTotal: 0,
      stockUnits: 0,
    },
    churchIncome: [],
    churchExpense: [],
    churchReconciliations: [],
    sales: [],
    arrivals: [],
    receivables: [],
    payables: [],
    expenses: [],
    stock: [],
  };
}

/**
 * @param {object} data
 * @param {'church'|'business'} [domain]
 */
export function buildExcelWorkbookData(data, domain = "business") {
  const merged = { ...emptyDomainData(), ...data };
  const rangeLabel =
    merged.range?.from && merged.range?.to
      ? `${formatNumericDateFr(merged.range.from)} → ${formatNumericDateFr(merged.range.to)}`
      : merged.periodLabel;
  const prefix = domain === "church" ? "eglise" : "commerce";

  return {
    filename: `mon-bilan-${prefix}-${(merged.range?.from || "periode").replaceAll("-", "")}-${(merged.range?.to || "export").replaceAll("-", "")}.xlsx`,
    domain,
    sheets:
      domain === "church"
        ? churchSheets(merged, rangeLabel)
        : businessSheets(merged, rangeLabel),
  };
}

function churchSheets(data, rangeLabel) {
  return [
    sheet("Résumé", ["Libellé", "Valeur"], [
      [textCell("Période"), textCell(rangeLabel)],
      [textCell("Fichier généré le"), textCell(data.generatedAt)],
      [textCell(""), textCell("")],
      [textCell("Entrées"), moneyCell(data.church.incomeTotal)],
      [textCell("Sorties"), moneyCell(data.church.expenseTotal)],
      [textCell("Variation"), moneyCell(data.church.variation)],
      [textCell("Solde"), moneyCell(data.church.endingBalance)],
      [
        textCell("Dernier écart de caisse"),
        data.church.lastReconciliationDifference == null
          ? textCell("Aucune vérification")
          : moneyCell(data.church.lastReconciliationDifference),
      ],
    ]),
    sheet(
      "Entrées",
      ["Date", "Caisse", "Motif", "Montant FCFA", "Note"],
      data.churchIncome.map((row) => [
        dateCell(row.transaction_date),
        textCell(row.church_funds?.name),
        textCell(row.reason),
        moneyCell(row.amount_fcfa),
        textCell(row.note),
      ]),
    ),
    sheet(
      "Sorties",
      ["Date", "Caisse", "Motif", "Montant FCFA", "Note"],
      data.churchExpense.map((row) => [
        dateCell(row.transaction_date),
        textCell(row.church_funds?.name),
        textCell(row.reason),
        moneyCell(row.amount_fcfa),
        textCell(row.note),
      ]),
    ),
    sheet(
      "Vérifications de caisse",
      ["Date", "Caisse", "Théorique", "Compté", "Écart", "Note"],
      data.churchReconciliations.map((row) => [
        dateCell(String(row.reconciled_at || "").slice(0, 10)),
        textCell(row.church_funds?.name || "Toutes les caisses"),
        moneyCell(row.theoretical_balance_fcfa),
        moneyCell(row.actual_cash_fcfa),
        moneyCell(row.difference_fcfa),
        textCell(row.note),
      ]),
    ),
  ];
}

function businessSheets(data, rangeLabel) {
  return [
    sheet("Résumé", ["Libellé", "Valeur"], [
      [textCell("Période"), textCell(rangeLabel)],
      [textCell("Fichier généré le"), textCell(data.generatedAt)],
      [textCell(""), textCell("")],
      [textCell("Chiffre d'affaires"), moneyCell(data.business.revenue)],
      [textCell("Montant fournisseur (quantité vendue)"), moneyCell(data.business.cogs)],
      [textCell("Dépenses"), moneyCell(data.business.operatingExpenses)],
      [textCell("Bénéfice estimé"), moneyCell(data.business.estimatedProfit)],
      [textCell("À recevoir (état actuel)"), moneyCell(data.business.receivablesTotal)],
      [textCell("À payer (état actuel)"), moneyCell(data.business.payablesTotal)],
      [textCell("Stock (unités actuelles)"), intCell(data.business.stockUnits)],
    ]),
    sheet(
      "Ventes",
      ["Date", "Client", "Produit", "Quantité", "Montant FCFA", "Payé", "Mode", "Note"],
      data.sales.map((row) => [
        dateCell(row.sale_date),
        textCell(row.customerName),
        textCell(row.productName),
        intCell(row.quantity),
        moneyCell(row.total),
        moneyCell(row.amountPaid),
        textCell(row.paymentMethod),
        textCell(row.note),
      ]),
    ),
    sheet(
      "Arrivages",
      ["Date", "Fournisseur", "Produit", "Quantité", "Montant fournisseur", "Marchandise", "Transport", "Déchargement", "Autres", "Avance", "Note"],
      data.arrivals.map((row) => [
        dateCell(row.arrival_date),
        textCell(row.supplierName),
        textCell(row.productName),
        intCell(row.quantity_received),
        moneyCell(row.supplier_unit_price_fcfa),
        moneyCell(row.merchandise),
        moneyCell(row.transport_fcfa),
        moneyCell(row.unloading_fcfa),
        moneyCell(row.other_expenses_fcfa),
        moneyCell(row.advance_paid_fcfa),
        textCell(row.note),
      ]),
    ),
    sheet(
      "Clients",
      ["Client", "Achats", "Payé", "Reste dû", "Note période"],
      data.receivables.map((row) => [
        textCell(row.name),
        moneyCell(row.purchases),
        moneyCell(row.paid),
        moneyCell(row.outstanding),
        textCell("État actuel (hors filtre de période)"),
      ]),
      "État actuel — snapshot, pas un flux de période.",
    ),
    sheet(
      "Fournisseurs",
      ["Fournisseur", "Marchandise", "Payé", "Reste dû", "Note période"],
      data.payables.map((row) => [
        textCell(row.name),
        moneyCell(row.merchandise),
        moneyCell(row.paid),
        moneyCell(row.outstanding),
        textCell("État actuel (hors filtre de période)"),
      ]),
      "État actuel — snapshot, pas un flux de période.",
    ),
    sheet(
      "Dépenses",
      ["Date", "Catégorie", "Montant FCFA", "Motif", "Note"],
      data.expenses.map((row) => [
        dateCell(row.date),
        textCell(row.category),
        moneyCell(row.amount),
        textCell(row.reason),
        textCell(row.note),
      ]),
    ),
    sheet(
      "Stock",
      ["Produit", "Unité", "Reçu", "Vendu", "Ajustements", "Disponible", "Note"],
      data.stock.map((row) => [
        textCell(row.product_name),
        textCell(row.unit_type),
        intCell(row.quantity_received),
        intCell(row.quantity_sold),
        intCell(row.quantity_adjustments),
        intCell(row.quantity_available),
        textCell("État actuel (hors filtre de période)"),
      ]),
      "État actuel — snapshot, pas un flux de période.",
    ),
  ];
}

export function excelFilename(from, to, domain = "business") {
  const prefix = domain === "church" ? "eglise" : "commerce";
  const a = (from || "periode").replaceAll("-", "");
  const b = (to || "export").replaceAll("-", "");
  return `mon-bilan-${prefix}-${a}-${b}.xlsx`;
}

export function formatSheetMoneyPreview(value) {
  return formatFcfa(value);
}
