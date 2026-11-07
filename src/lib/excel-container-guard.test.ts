import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { verifyXlsxContainer } from "./excel-container-guard";
import { readWorkbookEvidence } from "./excel-workbook-reader";
function zip() {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    w,
    XLSX.utils.aoa_to_sheet([
      ["Text", 42],
      ["value", 1],
    ]),
    "Example"
  );
  return new Uint8Array(
    XLSX.write(w, { type: "array", bookType: "xlsx", compression: true })
  );
}
function central(b: Uint8Array) {
  const v = new DataView(b.buffer);
  for (let i = 0; i < b.length - 4; i++)
    if (v.getUint32(i, true) === 0x02014b50) return i;
  throw Error("missing index");
}
describe("XLSX bounded container validation", () => {
  it("accepts an actual compressed workbook and retains its cells", async () => {
    const b = zip();
    await expect(verifyXlsxContainer(b)).resolves.toBeUndefined();
    const w = await readWorkbookEvidence(new File([b], "synthetic.xlsx"));
    expect(w.sheets[0].cells.B1.raw).toBe(42);
  });
  it("rejects declared inflated size before reading content", async () => {
    const b = zip();
    new DataView(b.buffer).setUint32(central(b) + 24, 32 * 1024 * 1024, true);
    await expect(verifyXlsxContainer(b)).rejects.toThrow("limiti");
  });
  it("detects a dishonest small inflated size by streaming actual bytes", async () => {
    const b = zip();
    new DataView(b.buffer).setUint32(central(b) + 24, 1, true);
    await expect(verifyXlsxContainer(b)).rejects.toThrow();
  });
  it("rejects truncated input and encrypted entries", async () => {
    const b = zip();
    await expect(verifyXlsxContainer(b.slice(0, -10))).rejects.toThrow();
    new DataView(b.buffer).setUint16(central(b) + 8, 1, true);
    await expect(verifyXlsxContainer(b)).rejects.toThrow();
  });
});
