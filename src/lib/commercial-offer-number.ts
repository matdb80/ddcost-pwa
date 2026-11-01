/** Calendar year used on commercial offer numbers, independent of server locale. */
export function italianOfferYear(at = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
  }).format(at));
}

export function formatOfferNumber(progressive: number): string {
  if (!Number.isInteger(progressive) || progressive < 1 || progressive > 9999)
    throw new Error("Progressivi offerta esauriti o non validi (0001–9999)");
  return `DDC${String(progressive).padStart(4,"0")}`;
}

/** Preview only; the server reserves the number transactionally on save. */
export function nextOfferNumberPreview(lastNumber: number): string {
  return formatOfferNumber(lastNumber + 1);
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
