import type { WorkbookEvidence, CellEvidence } from "../types/excel-import";
export function f3Workbook(
  code = "TEST-A",
  cost = 2,
  shiftRow = 0,
  shiftColumn = 0
): WorkbookEvidence {
  const cells: Record<string, CellEvidence> = {};
  const put = (r: number, c: number, v: string | number) => {
    r += shiftRow;
    c += shiftColumn;
    let col = "",
      n = c;
    while (n) {
      col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
      n = Math.floor((n - 1) / 26);
    }
    const address = col + r;
    cells[address] = {
      address,
      row: r,
      column: c,
      raw: v,
      cached: v,
      displayText: String(v),
      hiddenRow: false,
      hiddenColumn: false,
    };
  };
  const headers = [
    "TIPO COSTO",
    "TIPO MATERIALE",
    "VOCE DI COSTO",
    "LUNGHEZZA",
    "LARGHEZZA",
    "SPESSORE",
    "PESO LORDO",
    "PESO NETTO",
    "NR COMPONENTI",
    "FORNITORE",
    "COLPI/MIN",
    "UM",
    "TARIFFA FORNITURA",
    "TARIFFA LAVORO",
    "TOT.VOCE DI COSTO",
  ];
  headers.forEach((v, i) => put(2, i + 1, v));
  put(4, 1, "c");
  put(4, 3, "Componente sintetico");
  put(4, 9, 1);
  put(4, 12, "pz");
  put(4, 13, cost);
  put(4, 15, cost);
  put(5, 1, "w");
  put(5, 3, "Operazione sintetica");
  put(5, 9, 1);
  put(5, 11, 2);
  put(5, 12, "min");
  put(5, 14, 0.3);
  put(5, 15, 0.15);
  put(8, 3, "ATTREZZAGGI");
  put(9, 3, "Stampo");
  put(9, 4, 60);
  put(9, 5, 18);
  put(11, 4, 60);
  put(11, 5, 18);
  put(8, 6, "LOTTO");
  put(9, 6, 200);
  return {
    fileName: code + ".xlsx",
    sha256: (code === "TEST-A" ? "a" : "b").repeat(64),
    byteLength: 100,
    parserVersion: "synthetic",
    sheets: [
      {
        name: code,
        hidden: false,
        cells,
        merges: [],
        effectiveRows: 11 + shiftRow,
        effectiveColumns: 15 + shiftColumn,
      },
    ],
  };
}
