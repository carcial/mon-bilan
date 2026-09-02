/**
 * Excel workbook structure — testable without writing a file.
 * Church and Business never share a combined money total.
 */

import { formatNumericDateFr } from "./dates.js";
import { formatFcfa } from "./money.js";

export const EXCEL_SHEET_NAMES = [
  "Résumé",
  "Église - Entrées",
  "Église - Sorties",
  "Église - Rapprochements",
  "Commerce - Ventes",
  "Commerce - Arrivages",
  "Clients - À recevoir",
  "Fournisseurs - À payer",
  "Dépenses",
  "Stock",
];

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

/**
 * @param {{
 *   periodLabel: string,
 *   range: { from?: string|null, to?: string|null },
 *   generatedAt: string,
 *   church: object,
 *   business: object,
 *   churchIncome: object[],
 *   churchExpense: object[],
 *   churchReconciliations: object[],
 *   sales: object[],
 *   arrivals: object[],
 *   receivables: object[],
 *   payables: object[],
 *   expenses: object[],
 *   stock: object[],
 * }} data
 */
export function buildExcelWorkbookData(data) {
  const rangeLabel =
    data.range?.from && data.range?.to
      ? `${formatNumericDateFr(data.range.from)} → ${formatNumericDateFr(data.range.to)}`
      : data.periodLabel;

  const summaryRows = [
    [textCell("Période"), textCell(rangeLabel)],
    [textCell("Fichier généré le"), textCell(data.generatedAt)],
    [textCell(""), textCell("")],
    [textCell("ÉGLISE"), textCell("")],
    [textCell("Entrées"), moneyCell(data.church.incomeTotal)],
    [textCell("Sorties"), moneyCell(data.church.expenseTotal)],
    [textCell("Variation"), moneyCell(data.church.variation)],
    [textCell("Solde"), moneyCell(data.church.endingBalance)],
    [
      textCell("Dernier écart de caisse"),
      data.church.lastReconciliationDifference == null
        ? textCell("Aucun rapprochement")
        : moneyCell(data.church.lastReconciliationDifference),
    ],
    [textCell(""), textCell("")],
    [textCell("COMMERCE"), textCell("")],
    [textCell("Chiffre d'affaires"), moneyCell(data.business.revenue)],
    [textCell("Coût des marchandises vendues"), moneyCell(data.business.cogs)],
    [textCell("Dépenses"), moneyCell(data.business.operatingExpenses)],
    [textCell("Bénéfice estimé"), moneyCell(data.business.estimatedProfit)],
    [textCell("À recevoir (état actuel)"), moneyCell(data.business.receivablesTotal)],
    [textCell("À payer (état actuel)"), moneyCell(data.business.payablesTotal)],
    [textCell("Stock (unités actuelles)"), intCell(data.business.stockUnits)],
    [textCell(""), textCell("")],
    [
      textCell("Note"),
      textCell("Église et Commerce restent séparés. Aucun total combiné n'est calculé."),
    ],
  ];

  return {
    filename: `mon-bilan-${(data.range?.from || "periode").replaceAll("-", "")}-${(data.range?.to || "export").replaceAll("-", "")}.xlsx`,
    sheets: [
      sheet("Résumé", ["Libellé", "Valeur"], summaryRows),
      sheet(
        "Église - Entrées",
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
        "Église - Sorties",
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
        "Église - Rapprochements",
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
      sheet(
        "Commerce - Ventes",
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
        "Commerce - Arrivages",
        ["Date", "Fournisseur", "Produit", "Quantité", "Prix unitaire", "Marchandise", "Transport", "Déchargement", "Autres", "Avance", "Note"],
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
        "Clients - À recevoir",
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
        "Fournisseurs - À payer",
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
        ["Date", "Domaine", "Catégorie", "Montant FCFA", "Motif", "Note"],
        data.expenses.map((row) => [
          dateCell(row.date),
          textCell(row.domain),
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
    ],
  };
}

export function excelFilename(from, to) {
  const a = (from || "periode").replaceAll("-", "");
  const b = (to || "export").replaceAll("-", "");
  return `mon-bilan-${a}-${b}.xlsx`;
}

export function formatSheetMoneyPreview(value) {
  return formatFcfa(value);
}
