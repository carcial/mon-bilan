/**
 * Browser / Node Excel writer using ExcelJS (loaded only when exporting).
 * Classic register style: header row, table, filters, no dashboard decoration.
 */

import { parseLocalDate } from "./dates.js";

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod.ExcelJS || mod;
}

const COLORS = {
  header: "FFF2F2F2",
  text: "FF000000",
  muted: "FF666666",
  border: "FFBFBFBF",
};

const FONT = { name: "Calibri", size: 11, color: { argb: COLORS.text } };
const HEADER_FONT = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.text } };
const NOTE_FONT = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.muted } };

export const MONEY_FORMAT = '#,##0 "FCFA"';
export const DATE_FORMAT = "DD/MM/YYYY";
const INT_FORMAT = "0";

const thinBorder = {
  style: "thin",
  color: { argb: COLORS.border },
};

function boxBorder() {
  return {
    top: thinBorder,
    left: thinBorder,
    bottom: thinBorder,
    right: thinBorder,
  };
}

function fillArgb(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function cellValue(cell) {
  if (!cell) return "";
  if (cell.kind === "money" || cell.kind === "int") return Number(cell.value) || 0;
  if (cell.kind === "date") {
    const parsed = parseLocalDate(cell.value);
    return parsed || cell.value || "";
  }
  if (cell.value === "—") return "";
  return cell.value ?? "";
}

function applyFormat(excelCell, cell) {
  if (!cell) return;
  if (cell.kind === "money") {
    excelCell.numFmt = MONEY_FORMAT;
    return;
  }
  if (cell.kind === "int") {
    excelCell.numFmt = INT_FORMAT;
    return;
  }
  if (cell.kind === "date" && parseLocalDate(cell.value)) {
    excelCell.numFmt = DATE_FORMAT;
  }
}

function headerWidth(header) {
  const text = String(header || "");
  if (/identifiant technique/i.test(text)) return 38;
  if (/note|commentaire/i.test(text)) return 32;
  if (/référence|reference/i.test(text)) return 14;
  if (/motif|indicateur|produit|client|fournisseur|arrivage|échéance|lot/i.test(text)) return 24;
  if (/montant|reste|achats|payé|vente|obligation|marchandise|dette/i.test(text)) return 18;
  if (/date/i.test(text)) return 14;
  if (/quantité|unité|nombre/i.test(text)) return 14;
  return 16;
}

function writeRegisterSheet(sheet, spec) {
  const headers = spec.headers || [];
  const sourceRows = spec.rows?.length ? spec.rows : [headers.map(() => ({ kind: "text", value: "" }))];
  const tableName = String(spec.tableName || "Registre").replace(/[^A-Za-z0-9_]/g, "") || "Registre";

  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = headerWidth(header);
    if (/note|commentaire/i.test(header)) {
      sheet.getColumn(index + 1).alignment = { wrapText: true, vertical: "top" };
    }
  });

  sheet.addTable({
    name: tableName,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleLight1",
      showRowStripes: false,
    },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows: sourceRows.map((row) => row.map(cellValue)),
  });

  headers.forEach((_, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    cell.font = HEADER_FONT;
    cell.fill = fillArgb(COLORS.header);
    cell.border = boxBorder();
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.getRow(1).height = 18;

  sourceRows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(rowIndex + 2);
    row.forEach((cell, index) => {
      const excelCell = excelRow.getCell(index + 1);
      excelCell.font = FONT;
      excelCell.border = boxBorder();
      excelCell.alignment = {
        vertical: "middle",
        wrapText: /note|commentaire/i.test(headers[index] || ""),
      };
      applyFormat(excelCell, cell);
    });
    excelRow.height = 16;
  });

  const lastRow = 1 + sourceRows.length;

  if (spec.hideTechnicalId && headers.length) {
    sheet.getColumn(headers.length).hidden = true;
  }

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  if (!spec.rows?.length && spec.emptyText) {
    const noteRow = lastRow + 2;
    sheet.getCell(noteRow, 1).value = spec.emptyText;
    sheet.getCell(noteRow, 1).font = NOTE_FONT;
  }

  if (spec.note) {
    const noteRow = lastRow + (spec.rows?.length ? 2 : 3);
    sheet.getCell(noteRow, 1).value = spec.note;
    sheet.getCell(noteRow, 1).font = NOTE_FONT;
    sheet.getCell(noteRow, 1).alignment = { wrapText: true };
  }
}

/**
 * @param {{ filename: string, sheets: Array<object> }} workbookData
 * @returns {Promise<{ filename: string, buffer: ArrayBuffer }>}
 */
export async function writeExcelBuffer(workbookData) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mon Bilan";
  workbook.created = new Date();

  for (const spec of workbookData.sheets) {
    const sheet = workbook.addWorksheet(spec.name);
    writeRegisterSheet(sheet, spec);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: workbookData.filename,
    buffer,
  };
}

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1)
  );
}

function canShareExcelFile(filename, blob) {
  if (!isAppleTouchDevice()) return false;
  if (typeof navigator === "undefined" || typeof File === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  try {
    const file = new File([blob], filename, { type: blob.type });
    return navigator.canShare ? navigator.canShare({ files: [file] }) : false;
  } catch {
    return false;
  }
}

export async function downloadExcelBuffer({ filename, buffer }) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (canShareExcelFile(filename, blob)) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
