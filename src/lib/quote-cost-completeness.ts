import { isFixedPrice } from "./quote-series";
import { calculateQuoteMaterial } from "./quote-material-weight";
type Doc = Record<string, any>;
const positive = (v: unknown) =>
  v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
export function quoteCostCompleteness(doc: Doc) {
  const issues: string[] = [];
  const active = (Array.isArray(doc.prodotti) ? doc.prodotti : []).flatMap(
    (p: Doc, index: number) => (isFixedPrice(p) ? [] : [{ p, index }])
  );
  const shared = Number(doc.costi_comuni_versione) >= 2;
  const snapshots = active.map(({ p, index }: { p: Doc; index: number }) => {
    const missing: string[] = [];
    let material = p.materiale_cad;
    if (p.costo_materiale_noto === false) {
      try {
        material = calculateQuoteMaterial(p).materialCostPerPiece;
      } catch {
        material = null;
      }
    }
    const hours =
      doc.lavoro_modalita === "complessivo"
        ? doc.lavoro_ore_totali
        : p.lavoro_h;
    if (!positive(material)) missing.push("materiale");
    if (!positive(hours) || !positive(p.costo_lavoro))
      missing.push("ore/costo di lavorazione");
    const included = shared && doc.trattamenti_modalita === "ore_lavoro";
    const treatment =
      shared && doc.trattamenti_modalita === "globale"
        ? doc.trattamenti_totale_euro
        : p.trattamenti_cad;
    if (!included && !positive(treatment)) missing.push("trattamenti");
    if (missing.length)
      issues.push(`Prodotto ${index + 1}: ${missing.join(", ")}`);
    return [
      index,
      p.quantita,
      material,
      hours,
      p.costo_lavoro,
      included ? "ore_lavoro" : treatment,
    ];
  });
  return {
    issues,
    signature: JSON.stringify([
      1,
      doc.lavoro_modalita ?? "storico",
      doc.trattamenti_modalita ?? "storico",
      snapshots,
    ]),
  };
}
export function withCostCompleteness(doc: Doc, confirmed = false): Doc {
  const { issues, signature } = quoteCostCompleteness(doc);
  if (
    issues.length &&
    !confirmed &&
    doc.costi_incompleti_conferma !== signature
  )
    throw new Error(
      "Attribuzione dei costi incompleta. Conferma esplicitamente per procedere: " +
        issues.join("; ")
    );
  return {
    ...doc,
    costi_incompleti: issues,
    costi_incompleti_conferma: issues.length ? signature : null,
  };
}
export function savedQuoteHasIncompleteCosts(
  raw: string | null | undefined
): boolean {
  try {
    return quoteCostCompleteness(JSON.parse(raw ?? "{}")).issues.length > 0;
  } catch {
    return false;
  }
}
