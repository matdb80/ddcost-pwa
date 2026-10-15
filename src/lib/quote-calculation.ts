import { calculateMaterialByWeight, type MaterialName } from "./quote-material-weight";
export type Product = Record<string, any>;
export type QuoteDocument = Record<string, any>;
const val = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const euro = (v: unknown) => val(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const blankProduct = (): Product => ({
  gruppo_merceologico: "", materiale_prodotto: "",
  codice: "", descrizione: "", quantita: 1, materiale_cad: 0, lavoro_h: 0, costo_lavoro: 24,
  trattamenti_cad: 0, attrezzaggi_h: 0,
  ricarico_spese: 0.75, margine: 0.2, prezzo_manuale: null, quadrabile: true,
});
export const blankQuote = (): QuoteDocument => ({
  tipo: "Prezzo per articolo unatantum", cliente: "", riferimento_preventivo: "",
  titolo_preventivo: "Preventivo unatantum", prodotti: [blankProduct()],
  costi_comuni_versione: 3, progettazione_ore: 0, costo_progettazione_ora: 50,
  progettazione_totale_euro: 0,
  trattamenti_modalita: "per_prodotto", trattamenti_totale_euro: 0,
  target_totale: null, note_generali: "", note_cliente: "", note_fornitori: "", attachments: [],
});
export function calculateQuote(document: QuoteDocument): QuoteDocument {
  const d = structuredClone(document);
  if (!Array.isArray(d.prodotti) || !d.prodotti.length) throw new Error("Inserire almeno un prodotto");
  const shared = Number(d.costi_comuni_versione) >= 2;
  const treatmentMode = d.trattamenti_modalita === "globale" ? "globale" : "per_prodotto";
  const quantityTotal = (d.prodotti as Product[]).reduce((sum,p) => {
    const q = val(p.quantita);
    if (!(q > 0)) throw new Error("La quantità dei prodotti deve essere maggiore di zero");
    return sum + q;
  }, 0);
  // Historical documents (no schema marker) keep their original per-product
  // engineering costs until the user explicitly upgrades a new revision.
  const engineeringByHours = Number(d.costi_comuni_versione) >= 3;
  const engineeringHours = engineeringByHours ? Number(d.progettazione_ore) : 0;
  const engineeringHourlyRate = engineeringByHours ? Number(d.costo_progettazione_ora) : 0;
  if (engineeringByHours && (![engineeringHours, engineeringHourlyRate].every(Number.isFinite) ||
      engineeringHours < 0 || engineeringHourlyRate < 0))
    throw new Error("Ore e costo orario di progettazione devono essere numeri non negativi");
  const sharedDesignCost = shared
    ? (engineeringByHours ? engineeringHours * engineeringHourlyRate : val(d.progettazione_totale_euro))
    : 0;
  if (engineeringByHours) d.progettazione_totale_euro = sharedDesignCost;
  const sharedTreatmentCost = shared && treatmentMode === "globale" ? val(d.trattamenti_totale_euro) : 0;
  if (shared && (!Number.isFinite(Number(d.progettazione_totale_euro)) || sharedDesignCost < 0 ||
      (treatmentMode === "globale" && (!Number.isFinite(Number(d.trattamenti_totale_euro)) || sharedTreatmentCost < 0))))
    throw new Error("I costi complessivi di progettazione e trattamento devono essere numeri non negativi");
  const engineeringPerPiece = shared ? sharedDesignCost / quantityTotal : 0;
  const treatmentPerPiece = shared && treatmentMode === "globale" ? sharedTreatmentCost / quantityTotal : 0;
  let baseTotal = 0;
  let saleBefore = 0;
  let fullTotal = 0;
  for (const p of d.prodotti as Product[]) {
    const q = val(p.quantita);
    if (!(q > 0)) throw new Error("La quantità dei prodotti deve essere maggiore di zero");
    const m = val(p.materiale_cad), lh = val(p.lavoro_h), hcost = val(p.costo_lavoro);
    const treatment = val(p.trattamenti_cad), ah = val(p.attrezzaggi_h);
    const dh = val(p.progettazione_h), dcost = val(p.costo_progettazione);
    const overhead = val(p.ricarico_spese), margin = val(p.margine);
    if (margin >= 1 || margin < 0 || overhead < 0) throw new Error("Margine e ricarico non validi");
    p.materiale_tot = m * q;
    p.lavoro_tot = lh * hcost;
    p.trattamenti_tot = shared && treatmentMode === "globale" ? treatmentPerPiece * q : treatment * q;
    p.attrezzaggi_tot = ah * hcost;
    p.progettazione_tot = shared ? engineeringPerPiece * q : dh * dcost;
    if (shared) {
      p.progettazione_comune_cad = engineeringPerPiece;
      p.trattamenti_globali_cad = treatmentMode === "globale" ? treatmentPerPiece : 0;
    }
    p.costo_primo_cad = (p.materiale_tot + p.lavoro_tot + p.trattamenti_tot + p.attrezzaggi_tot + p.progettazione_tot) / q;
    p.full_cost = p.costo_primo_cad * (1 + overhead);
    p.prezzo_netto_unitario = p.full_cost / (1 - margin);
    p.totale = p.prezzo_netto_unitario * q;
    const manual = p.prezzo_manuale === null || p.prezzo_manuale === "" || p.prezzo_manuale === undefined
      ? null : val(p.prezzo_manuale);
    p.prezzo_manuale = manual;
    p.prezzo_vendita_pre_quadratura = manual ?? p.prezzo_netto_unitario;
    p.totale_vendita_pre_quadratura = p.prezzo_vendita_pre_quadratura * q;
    p.rettifica_unitaria = 0;
    p.prezzo_netto_unitario_finale = p.prezzo_vendita_pre_quadratura;
    p.totale_finale = p.totale_vendita_pre_quadratura;
    baseTotal += p.totale;
    saleBefore += p.totale_vendita_pre_quadratura;
    fullTotal += p.full_cost * q;
  }
  const target = d.target_totale === null || d.target_totale === "" || d.target_totale === undefined
    ? null : val(d.target_totale);
  d.target_totale = target;
  const diff = target === null ? 0 : target - saleBefore;
  const variable = (d.prodotti as Product[]).filter(p => p.quadrabile !== false);
  const variableTotal = variable.reduce((sum, p) => sum + p.totale_vendita_pre_quadratura, 0);
  const variableQuantity = variable.reduce((sum, p) => sum + val(p.quantita), 0);
  if (Math.abs(diff) > 1e-8 && variableQuantity === 0) {
    throw new Error("Quadratura impossibile: tutte le righe hanno prezzo bloccato");
  }
  for (const p of variable) {
    // Proportional to variable line values; quantity fallback for zero-valued lines.
    const weight = Math.abs(variableTotal) > 1e-12
      ? p.totale_vendita_pre_quadratura / variableTotal
      : val(p.quantita) / variableQuantity;
    const adjustment = diff * weight;
    p.rettifica_unitaria = adjustment / val(p.quantita);
    p.prezzo_netto_unitario_finale = p.prezzo_vendita_pre_quadratura + p.rettifica_unitaria;
    p.totale_finale = p.prezzo_netto_unitario_finale * val(p.quantita);
  }
  const totalFinal = (d.prodotti as Product[]).reduce((sum,p) => sum + p.totale_finale, 0);
  if (shared) {
    d.costi_comuni_riepilogo = {
      quantita_totale: quantityTotal,
      progettazione_totale: sharedDesignCost,
      ...(engineeringByHours ? {progettazione_ore: engineeringHours, costo_progettazione_ora: engineeringHourlyRate} : {}),
      progettazione_cad: engineeringPerPiece,
      trattamenti_modalita: treatmentMode,
      trattamenti_globali_totale: sharedTreatmentCost,
      trattamenti_globali_cad: treatmentPerPiece,
    };
  }
  d.num_prodotti = d.prodotti.length;
  d.quantita = (d.prodotti as Product[]).reduce((sum,p) => sum + val(p.quantita), 0);
  d.totale_pre_quadratura = baseTotal;
  d.totale_vendita_pre_quadratura = saleBefore;
  d.quadratura_applicata = target !== null;
  d.rettifica_totale = totalFinal - saleBefore;
  d.totale_finale = totalFinal;
  d.totale = totalFinal;
  d.prezzo_netto_unitario = d.quantita ? totalFinal / d.quantita : 0;
  d.full_cost_totale = fullTotal;
  d.margine_netto_complessivo_valore = totalFinal - fullTotal;
  d.margine_netto_complessivo_perc = totalFinal ? (totalFinal - fullTotal) / totalFinal * 100 : 0;
  d.descrizione = d.titolo_preventivo || "Preventivo unatantum";
  const lines = (d.prodotti as Product[]).map((p,i) =>
    (i + 1) + ". " + p.descrizione + " - " + p.quantita + " pz - € " + euro(p.prezzo_netto_unitario_finale) + "/pz - € " + euro(p.totale_finale)
  );
  d.summary = "PREVENTIVO UNA TANTUM\nCliente: " + (d.cliente || "") +
    "\nRiferimento: " + (d.riferimento_preventivo || "") +
    "\n\n" + lines.join("\n") + "\n\nTotale: € " + euro(totalFinal);
  return d;
}

/**
 * Explicit opt-in upgrade for a historic quote. The original revision is
 * untouched. Engineering costs already distributed across historic products
 * are combined ONCE into the new quote-wide engineering amount. Per-product
 * treatments remain the default to preserve original costs on conversion.
 */
export function migrateQuoteToSharedCosts(document: QuoteDocument): QuoteDocument {
  if (Number(document.costi_comuni_versione) >= 2) return structuredClone(document);
  const d=structuredClone(document);
  if (!Array.isArray(d.prodotti) || !d.prodotti.length) throw new Error("Preventivo privo di prodotti");
  const engineering=(d.prodotti as Product[]).reduce((sum,p)=>
    sum+val(p.progettazione_h)*val(p.costo_progettazione),0);
  const treatment=(d.prodotti as Product[]).reduce((sum,p)=>
    sum+val(p.trattamenti_cad)*val(p.quantita),0);
  if (engineering<0 || treatment<0) throw new Error("Impossibile convertire costi negativi dello storico");
  d.costi_comuni_versione=2;
  d.progettazione_totale_euro=engineering;
  d.trattamenti_modalita="per_prodotto";
  // Remember the current aggregate, ready if the user selects global mode.
  d.trattamenti_totale_euro=treatment;
  for(const p of d.prodotti as Product[]){
    delete p.progettazione_h;
    delete p.costo_progettazione;
  }
  return d;
}

/**
 * Explicit historical upgrade, only applied in a new revision after user
 * confirmation. One hour at the old total amount reproduces its exact
 * aggregate cost; the user MUST replace this provisional split with actual
 * design hours and hourly rate if known. Never silently infer work hours.
 */
export function migrateQuoteToEngineeringHours(document: QuoteDocument): QuoteDocument {
  if (Number(document.costi_comuni_versione) >= 3) return structuredClone(document);
  const d=Number(document.costi_comuni_versione) >= 2
    ? structuredClone(document) : migrateQuoteToSharedCosts(document);
  const total=Number(d.progettazione_totale_euro ?? 0);
  if(!Number.isFinite(total) || total<0)
    throw new Error("Costo storico di progettazione non valido");
  d.costi_comuni_versione=3;
  d.progettazione_ore=total>0?1:0;
  d.costo_progettazione_ora=total>0?total:50;
  return d;
}
