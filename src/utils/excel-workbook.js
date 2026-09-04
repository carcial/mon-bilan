/**
 * Excel workbook structure — one domain per workbook, classic register layout.
 * Values are precomputed by canonical calc helpers; this file only layouts cells.
 */

import { formatNumericDateFr } from "./dates.js";
import {
  EMPTY_PERIOD_MESSAGE,
  TECHNICAL_ID_HEADER,
  excelFilename as buildExcelFilename,
  historyTypeLabel,
  mapArrivalExportRows,
  mapCustomerDebtExportRows,
  mapSaleExportRows,
  mapStockExportRows,
  mapSupplierDebtExportRows,
  pickChurchFund,
  churchFundPeriodTotals,
  registerTableName,
  snapshotStateNote,
} from "./excel-export-map.js";
import { formatFcfa } from "./money.js";
import { toFcfaInteger } from "./money.js";

export const CHURCH_EXCEL_SHEETS = [
  "Résumé",
  "Entrées",
  "Sorties",
  "Caisses",
  "Vérifications de caisse",
  "Historique",
];

export const BUSINESS_EXCEL_SHEETS = [
  "Résumé",
  "Ventes",
  "Paiements clients",
  "Clients",
  "Clients à recevoir",
  "Arrivages",
  "Paiements fournisseurs",
  "Fournisseurs",
  "Fournisseurs à payer",
  "Dépenses",
  "Stock",
];

/** @deprecated Combined list kept for older tests; new exports are domain-scoped. */
export const EXCEL_SHEET_NAMES = [...CHURCH_EXCEL_SHEETS, ...BUSINESS_EXCEL_SHEETS.slice(1)];

export function moneyCell(value) {
  return { kind: "money", value: Number(value) || 0 };
}

export function textCell(value) {
  return { kind: "text", value: value == null || value === "" ? "—" : String(value) };
}

export function dateCell(value) {
  if (!value || value === "—") return { kind: "text", value: "—" };
  return { kind: "date", value: String(value).slice(0, 10) };
}

export function intCell(value) {
  return { kind: "int", value: Number(value) || 0 };
}

function optionalMoneyCell(value) {
  if (value == null || value === "") return textCell("—");
  return moneyCell(value);
}

function dueDateCell(row) {
  if (row?.dueDate) return dateCell(row.dueDate);
  return textCell(row?.dueLabel || "—");
}

function technicalIdCell(id) {
  if (id == null || id === "") return textCell("—");
  return { kind: "text", value: String(id) };
}

function withTechnicalId(headers, rows, ids) {
  return {
    headers: [...headers, TECHNICAL_ID_HEADER],
    rows: rows.map((row, index) => [...row, technicalIdCell(ids[index])]),
  };
}

function tableSheet(name, headers, rows, options = {}) {
  const empty = !rows.length;
  const ids = options.ids || [];
  const withIds = options.technicalIds === false
    ? { headers, rows }
    : withTechnicalId(headers, empty ? [] : rows, ids);
  return {
    name,
    kind: "table",
    tableName: options.tableName || registerTableName(options.domain || "business", name),
    headers: withIds.headers,
    rows: empty ? [] : withIds.rows,
    emptyText: options.emptyText || EMPTY_PERIOD_MESSAGE,
    note: options.note || "",
    snapshot: Boolean(options.snapshot),
    hideTechnicalId: options.technicalIds !== false,
  };
}

function emptyDomainData() {
  return {
    church: {
      incomeTotal: 0,
      expenseTotal: 0,
      variation: 0,
      endingBalance: 0,
      lastReconciliationDifference: null,
      byFund: [],
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
    churchFunds: [],
    churchReconciliations: [],
    churchHistory: [],
    sales: [],
    customerPayments: [],
    arrivals: [],
    supplierPayments: [],
    receivables: [],
    payables: [],
    customers: [],
    suppliers: [],
    expenses: [],
    stock: [],
    arrivalInventory: [],
    allArrivals: [],
  };
}

/**
 * @param {object} data
 * @param {'church'|'business'} [domain]
 */
export function buildExcelWorkbookData(data, domain = "business") {
  const merged = { ...emptyDomainData(), ...data };
  if (data?.church) {
    merged.church = { ...emptyDomainData().church, ...data.church };
  }
  if (data?.business) {
    merged.business = { ...emptyDomainData().business, ...data.business };
  }
  const rangeLabel =
    merged.periodLabel ||
    (merged.range?.from && merged.range?.to
      ? `${formatNumericDateFr(merged.range.from)} → ${formatNumericDateFr(merged.range.to)}`
      : "");
  return {
    filename: buildExcelFilename(
      merged.range?.from,
      merged.range?.to,
      domain,
      merged.periodKind || merged.period || "",
    ),
    domain,
    sheets:
      domain === "church"
        ? churchSheets(merged, rangeLabel)
        : businessSheets(merged, rangeLabel),
  };
}

function resumeRows(items) {
  return items.map(([label, cell, comment]) => [
    textCell(label),
    cell,
    textCell(comment || ""),
  ]);
}

function churchSheets(data, rangeLabel) {
  const byFund = data.church.byFund || [];
  const ordinary = churchFundPeriodTotals(
    pickChurchFund(byFund, /ordinaire|ordinary|principale/i) || data.church.ordinary,
  );
  const works = churchFundPeriodTotals(
    pickChurchFund(byFund, /travaux|works|œuvre|oeuvre/i) || data.church.works,
  );
  const periodComment = "Période du rapport";
  const snapshotComment = "Solde actuel";

  const resume = resumeRows([
    ["Période", textCell(rangeLabel), ""],
    ["Fichier généré le", textCell(data.generatedAt), ""],
    ["Ordinaire — Entrées", moneyCell(ordinary.incomeTotal), periodComment],
    ["Ordinaire — Sorties", moneyCell(ordinary.expenseTotal), periodComment],
    ["Ordinaire — Solde", moneyCell(ordinary.endingBalance), snapshotComment],
    ["Travaux — Entrées", moneyCell(works.incomeTotal), periodComment],
    ["Travaux — Sorties", moneyCell(works.expenseTotal), periodComment],
    ["Travaux — Solde", moneyCell(works.endingBalance), snapshotComment],
    ["Entrées", moneyCell(data.church.incomeTotal), periodComment],
    ["Sorties", moneyCell(data.church.expenseTotal), periodComment],
    ["Variation", moneyCell(data.church.variation), periodComment],
    ["Solde", moneyCell(data.church.endingBalance), snapshotComment],
    data.church.lastReconciliationDifference == null
      ? ["Dernier écart de caisse", textCell("Aucune vérification"), ""]
      : ["Dernier écart de caisse", moneyCell(data.church.lastReconciliationDifference), ""],
  ]);

  const incomeRows = (data.churchIncome || []).map((row) => [
    dateCell(row.transaction_date),
    textCell(row.reference || shortOrDash(row.id)),
    textCell(row.church_funds?.name || row.fundName),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.reason),
    textCell(row.note),
  ]);
  const expenseRows = (data.churchExpense || []).map((row) => [
    dateCell(row.transaction_date),
    textCell(row.reference || shortOrDash(row.id)),
    textCell(row.church_funds?.name || row.fundName),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.reason),
    textCell(row.note),
  ]);
  const fundRows = (data.churchFunds || []).map((row) => [
    textCell(row.name || row.fund?.name),
    textCell(row.code || row.fund?.code),
    moneyCell(row.opening_balance_fcfa ?? row.openingBalance),
    moneyCell(row.incomeTotal),
    moneyCell(row.expenseTotal),
    moneyCell(row.endingBalance ?? row.balance),
  ]);
  const reconRows = (data.churchReconciliations || []).map((row) => [
    dateCell(String(row.reconciled_at || "").slice(0, 10)),
    textCell(row.church_funds?.name || row.fundName || "Toutes les caisses"),
    moneyCell(row.theoretical_balance_fcfa),
    moneyCell(row.actual_cash_fcfa),
    moneyCell(row.difference_fcfa),
    textCell(row.note),
  ]);
  const historyRows = (data.churchHistory || []).map((row) => [
    dateCell(row.date),
    textCell(row.reference || shortOrDash(row.sourceId || row.id)),
    textCell(historyTypeLabel(row.type) || row.typeLabel),
    textCell(row.subtitle || row.fundName),
    row.amount == null ? textCell("—") : moneyCell(row.amount),
    textCell(row.title || row.reason),
    textCell(row.note),
  ]);

  return [
    tableSheet("Résumé", ["Indicateur", "Valeur", "Commentaire"], resume, {
      domain: "church",
      technicalIds: false,
    }),
    tableSheet(
      "Entrées",
      ["Date", "Référence", "Caisse", "Montant", "Motif", "Note"],
      incomeRows,
      { domain: "church", ids: (data.churchIncome || []).map((row) => row.id) },
    ),
    tableSheet(
      "Sorties",
      ["Date", "Référence", "Caisse", "Montant", "Motif", "Note"],
      expenseRows,
      { domain: "church", ids: (data.churchExpense || []).map((row) => row.id) },
    ),
    tableSheet(
      "Caisses",
      ["Caisse", "Code", "Solde d’ouverture", "Entrées période", "Sorties période", "Solde"],
      fundRows,
      {
        domain: "church",
        ids: (data.churchFunds || []).map((row) => row.id || row.fund?.id),
        emptyText: "Aucune caisse enregistrée.",
        snapshot: true,
        note: "Soldes de fin de période — calcul canonique des caisses.",
      },
    ),
    tableSheet(
      "Vérifications de caisse",
      ["Date", "Caisse", "Solde théorique", "Argent compté", "Écart", "Note"],
      reconRows,
      { domain: "church", ids: (data.churchReconciliations || []).map((row) => row.id) },
    ),
    tableSheet(
      "Historique",
      ["Date", "Référence", "Type", "Caisse", "Montant", "Libellé", "Note"],
      historyRows,
      { domain: "church", ids: (data.churchHistory || []).map((row) => row.sourceId || row.id) },
    ),
  ];
}

function businessSheets(data) {
  const currentStateNote = snapshotStateNote(data.generatedAt);
  const periodComment = "Période du rapport";
  const snapshotComment = "État actuel";
  const sales = mapSaleExportRows(data.sales || [], data.remainderBySaleId || new Map());
  const saleRows = sales.map((row) => [
    dateCell(row.sale_date),
    textCell(row.reference),
    textCell(row.customerName),
    textCell(row.productName),
    textCell(row.lotLabel),
    intCell(row.quantity),
    optionalMoneyCell(row.supplierUnitPrice),
    optionalMoneyCell(row.saleUnitPrice),
    moneyCell(row.total),
    moneyCell(row.supplierAmount),
    moneyCell(row.margin),
    textCell(row.paymentStatus),
    moneyCell(row.paidImmediately),
    moneyCell(row.remaining),
    textCell(row.paymentMethod),
    textCell(row.dueType),
    dueDateCell(row),
    textCell(row.note),
  ]);

  const paymentRows = (data.customerPayments || []).map((row) => [
    dateCell(row.payment_date || row.date),
    textCell(row.reference || shortOrDash(row.id)),
    textCell(row.customerName || row.customers?.name),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.paymentMethodLabel || row.payment_method || "—"),
    row.previousOutstanding == null ? textCell("—") : moneyCell(row.previousOutstanding),
    row.remainingAfter == null ? textCell("—") : moneyCell(row.remainingAfter),
    textCell(row.saleReference || "—"),
    textCell(row.note),
  ]);

  const debts = mapCustomerDebtExportRows(data.receivables || []);
  const debtRows = debts.map((row) => [
    dateCell(row.sale_date),
    textCell(row.customerName),
    textCell(row.reference),
    moneyCell(row.total),
    moneyCell(row.paid),
    moneyCell(row.remaining),
    textCell(row.dueType),
    dueDateCell(row),
    textCell(row.status),
    textCell(row.note),
  ]);

  const arrivals = mapArrivalExportRows(data.arrivals || [], data.supplierPaymentsAll || []);
  const arrivalRows = arrivals.map((row) => [
    dateCell(row.arrival_date),
    textCell(row.reference),
    textCell(row.supplierName),
    textCell(row.productName),
    intCell(row.quantity_received),
    moneyCell(row.supplier_unit_price_fcfa),
    moneyCell(row.merchandise),
    moneyCell(row.transport_fcfa),
    moneyCell(row.unloading_fcfa),
    moneyCell(row.other_expenses_fcfa),
    textCell(row.expensesOwedToSupplier ? "Oui" : "Non"),
    moneyCell(row.advance_paid_fcfa),
    moneyCell(row.obligation),
    moneyCell(row.remaining),
    textCell(row.note),
  ]);

  const supplierPaymentRows = (data.supplierPayments || []).map((row) => [
    dateCell(row.payment_date || row.date),
    textCell(row.reference || shortOrDash(row.id)),
    textCell(row.supplierName || row.suppliers?.name),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.paymentMethodLabel || row.payment_method || "—"),
    textCell(row.arrivalReference || "—"),
    textCell(row.note),
  ]);

  const supplierDebts = mapSupplierDebtExportRows(
    data.allArrivals?.length ? data.allArrivals : data.arrivals || [],
    data.supplierPaymentsAll || [],
  );
  const supplierDebtRows = supplierDebts.map((row) => [
    dateCell(row.arrival_date),
    textCell(row.supplierName),
    textCell(row.reference),
    textCell(row.productName),
    intCell(row.quantity_received),
    moneyCell(row.merchandise),
    moneyCell(row.feesOwed),
    moneyCell(row.obligation),
    moneyCell(row.paid),
    moneyCell(row.remaining),
    textCell(row.note),
  ]);

  const expenseRows = (data.expenses || []).map((row) => [
    dateCell(row.date || row.expense_date),
    textCell(row.reference || shortOrDash(row.id)),
    textCell(row.category),
    textCell(row.reason || row.description),
    moneyCell(row.amount ?? row.amount_fcfa),
    textCell(row.supplierName || "—"),
    textCell(row.relatedLabel || "—"),
    textCell(row.note),
  ]);

  const stockSource = (data.stock || []).some((row) => row.lotLabel || row.arrival_date)
    ? data.stock
    : mapStockExportRows(data.allArrivals || [], data.arrivalInventory || [], data.stock || []);
  const stockRows = stockSource.map((row) => [
    dateCell(row.arrival_date),
    textCell(row.supplierName || "—"),
    textCell(row.productName || row.product_name),
    textCell(row.lotLabel || "—"),
    intCell(row.quantity_received),
    intCell(row.quantity_sold),
    intCell(row.quantity_adjustments),
    intCell(row.quantity_available),
    optionalMoneyCell(row.supplier_unit_price_fcfa),
  ]);

  const customerRows = (data.customers || []).map((row) => [
    textCell(row.name),
    textCell(row.phone),
    textCell(row.note),
    moneyCell(row.purchases),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
    dateCell(row.lastOperation),
    row.nextDueDate ? dateCell(row.nextDueDate) : textCell(row.nextDueLabel || "—"),
  ]);

  const supplierRows = (data.suppliers || []).map((row) => [
    textCell(row.name),
    textCell(row.phone),
    textCell(row.note),
    moneyCell(row.merchandise),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
    intCell(row.arrivalCount),
    dateCell(row.lastOperation),
  ]);

  const biz = data.business;
  const resume = resumeRows([
    ["Période", textCell(data.periodLabel || ""), ""],
    ["Fichier généré le", textCell(data.generatedAt), ""],
    ["Chiffre d'affaires", moneyCell(biz.revenue), periodComment],
    ["Montant fournisseur", moneyCell(biz.cogs), periodComment],
    [
      "Marge estimée",
      moneyCell(biz.grossMargin ?? toFcfaInteger(biz.revenue) - toFcfaInteger(biz.cogs)),
      periodComment,
    ],
    ["Dépenses", moneyCell(biz.operatingExpenses), periodComment],
    ["Bénéfice estimé", moneyCell(biz.estimatedProfit), periodComment],
    ["Paiements reçus", moneyCell(biz.cashCollected), periodComment],
    ["À recevoir", moneyCell(biz.receivablesTotal), snapshotComment],
    ["À payer fournisseurs", moneyCell(biz.payablesTotal), snapshotComment],
    ["Stock actuel", intCell(biz.stockUnits), snapshotComment],
  ]);

  return [
    tableSheet("Résumé", ["Indicateur", "Valeur", "Commentaire"], resume, {
      domain: "business",
      technicalIds: false,
    }),
    tableSheet(
      "Ventes",
      [
        "Date",
        "Référence",
        "Client",
        "Produit",
        "Lot / Arrivage",
        "Quantité",
        "Montant fournisseur par unité",
        "Prix de vente par unité",
        "Total vente",
        "Montant fournisseur total",
        "Marge",
        "Statut paiement",
        "Montant payé immédiatement",
        "Reste à recevoir",
        "Mode de paiement",
        "Type échéance",
        "Date échéance",
        "Note",
      ],
      saleRows,
      { domain: "business", ids: sales.map((row) => row.id) },
    ),
    tableSheet(
      "Paiements clients",
      [
        "Date",
        "Référence",
        "Client",
        "Montant reçu",
        "Mode de paiement",
        "Dette avant",
        "Dette après",
        "Vente associée",
        "Note",
      ],
      paymentRows,
      { domain: "business", ids: (data.customerPayments || []).map((row) => row.id) },
    ),
    tableSheet(
      "Clients",
      [
        "Nom",
        "Téléphone",
        "Note",
        "Total achats",
        "Total payé",
        "Reste à recevoir",
        "Dernière opération",
        "Prochaine échéance",
      ],
      customerRows,
      {
        domain: "business",
        ids: (data.customers || []).map((row) => row.id),
        emptyText: "Aucun client enregistré.",
      },
    ),
    tableSheet(
      "Clients à recevoir",
      [
        "Date vente",
        "Client",
        "Référence vente",
        "Montant vente",
        "Payé",
        "Reste",
        "Type échéance",
        "Date échéance",
        "Statut",
        "Note",
      ],
      debtRows,
      {
        domain: "business",
        ids: debts.map((row) => row.id),
        snapshot: true,
        note: currentStateNote,
        emptyText: "Aucune créance client actuellement.",
      },
    ),
    tableSheet(
      "Arrivages",
      [
        "Date",
        "Référence",
        "Fournisseur",
        "Produit",
        "Quantité reçue",
        "Montant fournisseur par unité",
        "Montant marchandise",
        "Transport",
        "Déchargement",
        "Autres frais",
        "Frais dus au fournisseur ?",
        "Avance fournisseur",
        "Total dû fournisseur",
        "Reste fournisseur",
        "Note",
      ],
      arrivalRows,
      { domain: "business", ids: arrivals.map((row) => row.id) },
    ),
    tableSheet(
      "Paiements fournisseurs",
      [
        "Date",
        "Référence",
        "Fournisseur",
        "Montant payé",
        "Mode paiement",
        "Arrivage associé",
        "Note",
      ],
      supplierPaymentRows,
      { domain: "business", ids: (data.supplierPayments || []).map((row) => row.id) },
    ),
    tableSheet(
      "Fournisseurs",
      [
        "Nom",
        "Téléphone",
        "Note",
        "Marchandise reçue",
        "Déjà payé",
        "Reste à payer",
        "Nombre d'arrivages",
        "Dernière opération",
      ],
      supplierRows,
      {
        domain: "business",
        ids: (data.suppliers || []).map((row) => row.id),
        emptyText: "Aucun fournisseur enregistré.",
      },
    ),
    tableSheet(
      "Fournisseurs à payer",
      [
        "Date",
        "Fournisseur",
        "Référence arrivage",
        "Produit",
        "Quantité",
        "Montant marchandise",
        "Frais dus fournisseur",
        "Total obligation",
        "Déjà payé",
        "Reste",
        "Note",
      ],
      supplierDebtRows,
      {
        domain: "business",
        ids: supplierDebts.map((row) => row.id),
        snapshot: true,
        note: currentStateNote,
        emptyText: "Aucune dette fournisseur actuellement.",
      },
    ),
    tableSheet(
      "Dépenses",
      [
        "Date",
        "Référence",
        "Type / Catégorie",
        "Motif",
        "Montant",
        "Fournisseur lié",
        "Arrivage lié",
        "Note",
      ],
      expenseRows,
      { domain: "business", ids: (data.expenses || []).map((row) => row.id) },
    ),
    tableSheet(
      "Stock",
      [
        "Date arrivage",
        "Fournisseur",
        "Produit",
        "Référence lot",
        "Quantité reçue",
        "Quantité vendue",
        "Ajustements",
        "Quantité disponible",
        "Montant fournisseur/unité",
      ],
      stockRows,
      {
        domain: "business",
        ids: stockSource.map((row) => row.id),
        snapshot: true,
        note: currentStateNote,
        emptyText: "Aucun stock enregistré.",
      },
    ),
  ];
}

function shortOrDash(id) {
  if (!id) return "—";
  const raw = String(id).replace(/-/g, "");
  return raw.length >= 8 ? raw.slice(0, 8).toUpperCase() : raw.toUpperCase();
}

export function excelFilename(from, to, domain = "business", periodKind = "") {
  return buildExcelFilename(from, to, domain, periodKind);
}

export function formatSheetMoneyPreview(value) {
  return formatFcfa(value);
}

export function summaryValue(workbook, label) {
  const resume = workbook?.sheets?.[0];
  const row = (resume?.rows || []).find((cells) => cells[0]?.value === label);
  return row?.[1]?.value;
}
