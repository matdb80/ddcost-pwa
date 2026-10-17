/** Calendar year used on commercial offer numbers, independent of server locale. */
export function italianOfferYear(at = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
  }).format(at));
}

export function formatOfferNumber(progressive: number, year = italianOfferYear()): string {
  if (!Number.isInteger(progressive) || progressive <= 0) {
    throw new Error("Il progressivo dell'offerta deve essere un intero positivo");
  }
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error("L'anno dell'offerta non è valido");
  }
  return `DDC${progressive}/${year}`;
}

/** Preview only: create() replaces this with the database-assigned sequence. */
export function nextOfferNumberPreview(maxExistingId: number, at = new Date()): string {
  const maxId = Number.isInteger(maxExistingId) && maxExistingId > 0 ? maxExistingId : 0;
  return formatOfferNumber(maxId + 1, italianOfferYear(at));
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
