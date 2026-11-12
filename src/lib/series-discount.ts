/** Successive discounts, never the sum: 40+15+5 = 1 - .6*.85*.95. */
export function seriesDiscount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { factor: 1, label: "", percentages: [] as number[] };
  const parts = text.split("+");
  if (
    parts.length > 3 ||
    parts.some(p => !/^\s*\d+(?:[.,]\d+)?\s*%?\s*$/.test(p))
  )
    throw new Error(
      "Sconto cliente non valido: usa fino a tre percentuali, ad esempio 40+15+5%."
    );
  const percentages = parts.map(p =>
    Number(p.replace(/[%\s]/g, "").replace(",", "."))
  );
  if (percentages.some(p => !Number.isFinite(p) || p < 0 || p > 100))
    throw new Error("Ogni sconto deve essere compreso tra 0 e 100%.");
  return {
    factor: percentages.reduce((f, p) => f * (1 - p / 100), 1),
    label: percentages.map(p => String(p).replace(".", ",")).join("+") + "%",
    percentages,
  };
}
