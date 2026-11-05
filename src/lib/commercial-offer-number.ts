/** Calendar year used on commercial offer numbers, independent of server locale. */
export function italianOfferYear(at = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
  }).format(at));
}

export function formatOfferNumber(progressive: number, year = italianOfferYear()): string {
  if (!Number.isSafeInteger(progressive) || progressive < 1 || progressive > 99999)
    throw new Error("Progressivi documento esauriti o non validi (00001–99999)");
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Anno documento non valido");
  return `DDC${String(progressive).padStart(5,"0")}/${year}`;
}

/** Preview only; the server reserves the number transactionally on save. */
export function nextOfferNumberPreview(lastNumber: number, year = italianOfferYear()): string {
  return formatOfferNumber(lastNumber + 1, year);
}

/** Keep the JSON snapshot and the searchable database column aligned. */
export function withOfferNumberInJson(dataJson: string | undefined, number: string): string | undefined {
  if (dataJson === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(dataJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return dataJson;
    return JSON.stringify({ ...(parsed as Record<string, unknown>), nome: number });
  } catch {
    return dataJson;
  }
}

/** Stored quote number; historical documents keep their existing ID fallback. */
export function quoteDocumentNumber(value: unknown): string | undefined {
  try {
    const document = typeof value === "string" ? JSON.parse(value) : value;
    if (!document || typeof document !== "object") return undefined;
    const number = (document as Record<string, unknown>).numero_preventivo;
    return typeof number === "string" && number.trim() ? number : undefined;
  } catch { return undefined; }
}
