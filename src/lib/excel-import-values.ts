export type NumberLocale = "it" | "en" | "plain";
export type NumberParseResult = { ok: true; value: number; locale: NumberLocale } | { ok: false; reason: "missing" | "error" | "ambiguous" | "invalid" };
/** No guessing when one separator can represent either decimals or thousands. */
export function parseExcelNumber(value: unknown, preferred?: NumberLocale): NumberParseResult {
  if (value == null || value === "") return { ok: false, reason: "missing" };
  if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value, locale: "plain" } : { ok: false, reason: "invalid" };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  const raw = value.trim();
  if (!raw) return { ok: false, reason: "missing" };
  if (raw.startsWith("#")) return { ok: false, reason: "error" };
  if (/\s|['’]/.test(raw)) return { ok: false, reason: "invalid" };
  const comma = raw.lastIndexOf(","), dot = raw.lastIndexOf(".");
  let locale: NumberLocale = preferred ?? "plain";
  if (!preferred) {
    if (comma >= 0 && dot >= 0) locale = comma > dot ? "it" : "en";
    else if (/^[+-]?[1-9]\d{0,2}[.,]\d{3}$/.test(raw)) return { ok: false, reason: "ambiguous" };
    else if (comma >= 0) locale = (raw.match(/,/g)?.length ?? 0) > 1 ? "en" : "it";
    else if (dot >= 0) locale = (raw.match(/\./g)?.length ?? 0) > 1 ? "it" : "en";
  }
  const syntax = locale === "it"
    ? /^[+-]?(?:(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?|,\d+)$/
    : locale === "en"
      ? /^[+-]?(?:(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/
      : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (!syntax.test(raw)) return { ok: false, reason: "invalid" };
  const normalized = locale === "it" ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? { ok: true, value: n, locale } : { ok: false, reason: "invalid" };
}
