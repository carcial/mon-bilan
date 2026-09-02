/**
 * Browser / Node Excel writer using ExcelJS (loaded only when exporting).
 */

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod.ExcelJS || mod;
}

const MONEY_FORMAT = "#,##0";
const COLUMN_WIDTHS = {
  default: 18,
  wide: 28,
  note: 36,
};

function applyCell(excelCell, cell) {
  if (!cell) {
    excelCell.value = "";
    return;
  }
  if (cell.kind === "money") {
    excelCell.value = cell.value;
    excelCell.numFmt = MONEY_FORMAT;
    return;
  }
  if (cell.kind === "int") {
    excelCell.value = cell.value;
    excelCell.numFmt = "0";
    return;
  }
  excelCell.value = cell.value;
}

/**
 * @param {{ filename: string, sheets: Array<{ name: string, headers: string[], rows: object[][], note?: string }> }} workbookData
 * @returns {Promise<{ filename: string, buffer: ArrayBuffer }>}
 */
export async function writeExcelBuffer(workbookData) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mon Bilan";
  workbook.created = new Date();

  for (const spec of workbookData.sheets) {
    const sheet = workbook.addWorksheet(spec.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const headerRow = sheet.addRow(spec.headers);
    headerRow.font = { bold: true };
    headerRow.height = 22;

    for (const row of spec.rows) {
      const excelRow = sheet.addRow(row.map((cell) => (cell ? cell.value : "")));
      row.forEach((cell, index) => {
        applyCell(excelRow.getCell(index + 1), cell);
      });
    }

    if (spec.note) {
      sheet.addRow([]);
      const noteRow = sheet.addRow([spec.note]);
      noteRow.font = { italic: true };
    }

    spec.headers.forEach((header, index) => {
      const width = /note|motif|libellé|produit|client|fournisseur/i.test(header)
        ? COLUMN_WIDTHS.wide
        : /montant|marché|théorique|compté|reste|achats|payé/i.test(header)
          ? COLUMN_WIDTHS.default
          : 16;
      sheet.getColumn(index + 1).width = header.toLowerCase().includes("note")
        ? COLUMN_WIDTHS.note
        : width;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: workbookData.filename,
    buffer,
  };
}

export function downloadExcelBuffer({ filename, buffer }) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
