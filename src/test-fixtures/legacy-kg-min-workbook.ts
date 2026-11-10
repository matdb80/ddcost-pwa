import type { CellEvidence, WorkbookEvidence } from "../types/excel-import";

/** Invented data only; no company workbook or extracted customer data. */
export function legacyKgMinWorkbook(
  code = "TEST-KG-A",
  shiftRow = 0,
  shiftColumn = 0
): WorkbookEvidence {
  const cells: Record<string, CellEvidence> = {};
  const put = (
    r: number,
    c: number,
    raw: string | number,
    formula?: string
  ) => {
    r += shiftRow;
    c += shiftColumn;
    let n = c,
      letters = "";
    while (n) {
      letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
      n = Math.floor((n - 1) / 26);
    }
    const address = letters + r;
    cells[address] = {
      address,
      row: r,
      column: c,
      raw,
      cached: raw,
      displayText: String(raw),
      formula,
      hiddenRow: false,
      hiddenColumn: false,
    };
  };
  [
    "COD.PRODOTTO",
    "COD.LAVORAZONE",
    "VOCE DI COSTO",
    "DIMENSIONI MATERIALI",
    "",
    "",
    "peso",
    "QUANT.",
    "FORNITORE",
    "colpi/min",
    "um",
    "C.U. Kg;MIN",
    "COSTO UN. €/Kg)",
    "COSTO (€)",
    "incidenza",
  ].forEach((v, i) => {
    if (v) put(1, i + 1, v);
  });
  put(2, 4, "lung.");
  put(2, 5, "larg.");
  put(2, 6, "sp.");
  put(3, 1, code);
  const rows = [
    {
      description: "MATERIALE sintetico",
      quantity: 2,
      unit: "kg",
      basis: 0.125,
      rate: 3,
      cost: 0.75,
    },
    {
      description: "Operazione sintetica",
      quantity: 3,
      unit: "min",
      basis: 0.25,
      speed: 4,
      rate: 0.4,
      cost: 0.3,
    },
    {
      description: "Componente sintetico",
      quantity: 4,
      unit: "pz",
      basis: 2,
      rate: 0.05,
      cost: 0.4,
    },
    {
      description: "Zincatura a peso",
      quantity: 1,
      unit: "kg",
      basis: 0.1,
      rate: 5,
      cost: 0.5,
    },
    {
      description: "Zincatura a pezzo",
      quantity: 1,
      unit: "pz",
      basis: 1,
      rate: 0.12,
      cost: 0.12,
    },
    {
      description: "Assemblaggio sintetico",
      quantity: 1,
      unit: "min",
      basis: 0.5,
      speed: 2,
      rate: 0.4,
      cost: 0.2,
    },
  ];
  rows.forEach((v, i) => {
    const r = i + 3;
    put(r, 3, v.description);
    put(r, 8, v.quantity);
    put(r, 9, "Fornitore di prova");
    if (v.speed) put(r, 10, v.speed);
    put(r, 11, v.unit);
    put(r, 12, v.basis);
    put(r, 13, v.rate);
    put(r, 14, v.cost);
    put(r, 15, v.cost / 2.27);
  });
  put(3, 4, 200);
  put(3, 5, "20");
  put(3, 6, "4");
  put(3, 7, 0.128);
  put(10, 2, "TOTALE");
  put(10, 13, "costo primo");
  put(10, 14, 2.27);
  put(11, 13, "full cost");
  put(11, 14, 3.632);
  put(13, 3, "Nota sintetica fuori dal ciclo");
  return {
    fileName: code + ".xls",
    sha256: (code === "TEST-KG-A" ? "a" : "b").repeat(64),
    byteLength: 100,
    parserVersion: "synthetic",
    sheets: [
      {
        name: code,
        hidden: false,
        cells,
        merges: [],
        effectiveRows: 13 + shiftRow,
        effectiveColumns: 15 + shiftColumn,
      },
    ],
  };
}
