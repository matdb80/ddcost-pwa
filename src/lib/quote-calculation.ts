import { isForfait, forfaitProductError } from "./quote-forfait";
import { calculateRal, validRal, ralSourceCode } from "./ral-pricing";
import { assertPaintedTemporaryCodes } from "./ral-documents";
import { calculateQuoteMaterial } from "./quote-material-weight";
export type Product = Record<string, any>;
export type QuoteDocument = Record<string, any>;
const val = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const euro = (v: unknown) => val(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const blankProduct = (): Product => ({
  gruppo_merceologico: "", materiale_prodotto: "",
  codice: "", descrizione: "", a_forfait: false, valore_forfait: null, quantita: 1, materiale_cad: 0,
  costo_materiale_noto: true, geometria_materiale: "", diametro_mm: 0, diametro_interno_mm: 0, lunghezza_mm: 0, larghezza_mm: 0, spessore_mm: 0,
  costo_materiale_kg: 0, oggetto_modifica: [], lavoro_h: 0, costo_lavoro: 24,
  trattamenti_cad: 0, attrezzaggi_h: 0, nero_standard_goffrato: false,
  ricarico_spese: 0.75, margine: 0.2, prezzo_manuale: null, quadrabile: true,
});
export const blankQuote = (): QuoteDocument => ({
  tipo: "Prezzo per articolo unatantum", cliente: "", riferimento_preventivo: "",
  titolo_preventivo: "Preventivo unatantum", prodotti: [blankProduct()],
  costi_comuni_versione: 3, progettazione_ore: 0, costo_progettazione_ora: 50,
  progettazione_totale_euro: 0,
  lavoro_modalita: "complessivo", lavoro_ore_totali: 0,
  trattamenti_modalita: "per_prodotto", trattamenti_totale_euro: 0,
  target_totale: null, note_generali: "", note_cliente: "", note_fornitori: "", attachments: [],
});
/** Copies the most recently entered product for another lot, leaving its quantity blank. */
export function duplicateLastProductForNewLot(products: Product[]): Product[] {
  if (!products.length) throw new Error("Inserire almeno un prodotto da copiare");
  const copy = structuredClone(products[products.length - 1]);
  copy.quantita = "";
  return [...products, copy];
}
export function quoteLaborMode(document: QuoteDocument): "complessivo" | "per_prodotto" | "per_pezzo" | "per_riga" {
  if (document.lavoro_modalita == null) return "per_riga"; // Preserve saved quotes.
  if (document.lavoro_modalita === "complessivo" || document.lavoro_modalita === "per_prodotto" || document.lavoro_modalita === "per_pezzo") return document.lavoro_modalita;
  throw new Error("Modalità di imputazione delle ore di lavorazione non valida");
}
export function quoteLaborHours(document: QuoteDocument): number[] {
  const products=document.prodotti as Product[];
  if(products.every(isForfait))return products.map(()=>0);
  const mode=quoteLaborMode(document);
  const quantities=products.map(p=>isForfait(p)?0:Number(p.quantita));
  if(quantities.some((q,i)=>!isForfait(products[i])&&(!Number.isFinite(q)||q<=0)))throw new Error("La quantità dei prodotti deve essere maggiore di zero");
  const hours=(value:unknown)=>{
    const n=Number(value??0);
    if(!Number.isFinite(n)||n<0)throw new Error("Le ore di lavorazione devono essere numeri non negativi");
    return n;
  };
  if(mode==="complessivo"){
    const total=hours(document.lavoro_ore_totali);
    const pieces=quantities.reduce((sum,q)=>sum+q,0);
    return quantities.map(q=>total*q/pieces);
  }
  // per_pezzo is retained only for documents saved by the previous release.
  return products.map((p,i)=>isForfait(p)?0:mode==="per_pezzo"?hours(p.lavoro_h)*quantities[i]:mode==="per_prodotto"?hours(p.lavoro_h):val(p.lavoro_h));
}
/** An explicit mode change conserves the current total hours, without editing stored history. */
export function changeQuoteLaborMode(document: QuoteDocument, mode: "complessivo" | "per_prodotto" | "per_pezzo"): QuoteDocument {
  if(quoteLaborMode(document)===mode)return structuredClone(document);
  const assigned=quoteLaborHours(document);
  const next=structuredClone(document);
  next.lavoro_modalita=mode;
  if(mode==="complessivo")next.lavoro_ore_totali=assigned.reduce((sum,h)=>sum+h,0);
  else next.prodotti=next.prodotti.map((p:Product,i:number)=>isForfait(p)?p:({...p,lavoro_h:mode==="per_prodotto"?assigned[i]:assigned[i]/Number(p.quantita)}));
  return next;
}
export function calculateQuote(document: QuoteDocument): QuoteDocument {
  const d = structuredClone(document);
  if (!Array.isArray(d.prodotti) || !d.prodotti.length) throw new Error("Inserire almeno un prodotto");
  const standardProducts = (d.prodotti as Product[]).filter(p=>!isForfait(p));
  const hasStandard = standardProducts.length > 0;
  const hasForfait = (d.prodotti as Product[]).some(isForfait);
  const shared = Number(d.costi_comuni_versione) >= 2;
  const laborHours = quoteLaborHours(d);
  const treatmentMode = d.trattamenti_modalita === "globale"
    ? "globale"
    : d.trattamenti_modalita === "ore_lavoro" ? "ore_lavoro" : "per_prodotto";
  const quantityTotal = standardProducts.reduce((sum,p) => {
    const q = val(p.quantita);
    if (!(q > 0)) throw new Error("La quantità dei prodotti deve essere maggiore di zero");
    return sum + q;
  }, 0);
  // Historical documents (no schema marker) keep their original per-product
  // engineering costs until the user explicitly upgrades a new revision.
  const engineeringByHours = Number(d.costi_comuni_versione) >= 3;
  const engineeringHours = hasStandard && engineeringByHours ? Number(d.progettazione_ore) : 0;
  const engineeringHourlyRate = hasStandard && engineeringByHours ? Number(d.costo_progettazione_ora) : 0;
  if (engineeringByHours && (![engineeringHours, engineeringHourlyRate].every(Number.isFinite) ||
      engineeringHours < 0 || engineeringHourlyRate < 0))
    throw new Error("Ore e costo orario di progettazione devono essere numeri non negativi");
  const sharedDesignCost = hasStandard && shared
    ? (engineeringByHours ? engineeringHours * engineeringHourlyRate : val(d.progettazione_totale_euro))
    : 0;
  if (hasStandard && engineeringByHours) d.progettazione_totale_euro = sharedDesignCost;
  const sharedTreatmentCost = hasStandard && shared && treatmentMode === "globale" ? val(d.trattamenti_totale_euro) : 0;
  if (hasStandard && shared && (!Number.isFinite(Number(d.progettazione_totale_euro)) || sharedDesignCost < 0 ||
      (treatmentMode === "globale" && (!Number.isFinite(Number(d.trattamenti_totale_euro)) || sharedTreatmentCost < 0))))
    throw new Error("I costi complessivi di progettazione e trattamento devono essere numeri non negativi");
  const engineeringPerPiece = hasStandard && shared ? sharedDesignCost / quantityTotal : 0;
  const treatmentPerPiece = hasStandard && shared && treatmentMode === "globale" ? sharedTreatmentCost / quantityTotal : 0;
  let baseTotal = 0;
  let saleBefore = 0;
  let fullTotal = 0;
  for (const [productIndex,p] of (d.prodotti as Product[]).entries()) {
    if (isForfait(p)) {
      const error = forfaitProductError(p);
      if (error) throw new Error(`Prodotto ${productIndex + 1}: ${error}`);
      const amount = Number(p.valore_forfait);
      // Preserve user inputs for toggling back, but clear all inactive derived costs.
      for (const key of ["materiale_calcolato_cad", "peso_teorico_kg", "materiale_tot", "lavoro_ore_totali", "lavoro_tot",
        "trattamenti_tot", "attrezzaggi_tot", "progettazione_tot", "progettazione_comune_cad", "trattamenti_globali_cad",
        "costo_primo_cad", "full_cost", "prezzo_netto_unitario", "prezzo_vendita_pre_quadratura",
        "prezzo_netto_unitario_finale", "netto_prima_ral", "ral_ricarico_cad", "ral_percentuale"])
        delete p[key];
      Object.assign(p, {totale: amount, totale_vendita_pre_quadratura: amount, totale_finale: amount, rettifica_unitaria: 0});
      baseTotal += amount;
      saleBefore += amount;
      continue;
    }
    const q = val(p.quantita);
    if (!(q > 0)) throw new Error("La quantità dei prodotti deve essere maggiore di zero");
    // Existing documents without the checkbox retain their saved €/piece.
    // When unchecked, geometry/€/kg becomes the sole active material cost.
    const weightCost = p.costo_materiale_noto === false
      ? calculateQuoteMaterial(p)
      : null;
    const m = weightCost?.materialCostPerPiece ?? val(p.materiale_cad);
    p.materiale_calcolato_cad = m;
    p.peso_teorico_kg = weightCost?.theoreticalWeightKg ?? null;
    const hcost = val(p.costo_lavoro);
    const treatment = val(p.trattamenti_cad), ah = val(p.attrezzaggi_h);
    const dh = val(p.progettazione_h), dcost = val(p.costo_progettazione);
    const overhead = val(p.ricarico_spese), margin = val(p.margine);
    if (margin >= 1 || margin < 0 || overhead < 0) throw new Error("Margine e ricarico non validi");
    p.materiale_tot = m * q;
    p.lavoro_ore_totali = laborHours[productIndex];
    p.lavoro_tot = p.lavoro_ore_totali * hcost;
    p.trattamenti_tot = shared && treatmentMode === "ore_lavoro"
      ? 0
      : shared && treatmentMode === "globale" ? treatmentPerPiece * q : treatment * q;
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
  const diff = target === null || !hasStandard ? 0 : target - saleBefore;
  const variable = standardProducts.filter(p => p.quadrabile !== false);
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
    if (hasForfait && p.totale_finale < 0) throw new Error("Il totale desiderato non può ridurre gli importi a forfait o rendere negativi i prodotti standard");
  }
  let totalFinal = (d.prodotti as Product[]).reduce((sum,p) => sum + p.totale_finale, 0);
  const totalBeforeRal = totalFinal;
  assertPaintedTemporaryCodes(standardProducts, d.verniciatura_ral);
  if (hasStandard && d.verniciatura_ral) {
    if (!validRal(d.verniciatura_ral)) throw new Error("Configurazione RAL non valida");
    const options = d.verniciatura_ral;
    const result = calculateRal(standardProducts.map(p => ({ code: ralSourceCode(p, options), net: p.prezzo_netto_unitario_finale, quantity: Number(p.quantita) })), options);
    result.rows.forEach((r, i) => Object.assign(standardProducts[i], { netto_prima_ral: r.baseNet, ral_ricarico_cad: r.surcharge, ral_percentuale: r.percent, prezzo_netto_unitario_finale: r.net, totale_finale: r.total }));
    d.ral_riepilogo = result;
    totalFinal = result.total! + (d.prodotti as Product[]).filter(isForfait).reduce((sum,p)=>sum+p.totale_finale,0);
  } else {
    delete d.ral_riepilogo;
    for (const p of d.prodotti) { delete p.netto_prima_ral; delete p.ral_ricarico_cad; delete p.ral_percentuale; }
  }
  if (shared) {
    d.costi_comuni_riepilogo = {
      quantita_totale: quantityTotal,
      progettazione_totale: sharedDesignCost,
      ...(engineeringByHours ? {progettazione_ore: engineeringHours, costo_progettazione_ora: engineeringHourlyRate} : {}),
      progettazione_cad: engineeringPerPiece,
      trattamenti_modalita: treatmentMode,
      trattamenti_globali_totale: sharedTreatmentCost,
      trattamenti_globali_cad: treatmentPerPiece,
      trattamenti_inclusi_nelle_ore_lavoro: treatmentMode === "ore_lavoro",
    };
  }
  d.num_prodotti = d.prodotti.length;
  d.lavoro_ore_calcolate = laborHours.reduce((sum,h)=>sum+h,0);
  d.quantita = quantityTotal;
  d.totale_pre_quadratura = baseTotal;
  d.totale_vendita_pre_quadratura = saleBefore;
  d.quadratura_applicata = hasStandard && target !== null;
  d.rettifica_totale = totalBeforeRal - saleBefore;
  d.totale_finale = totalFinal;
  d.totale = totalFinal;
  d.prezzo_netto_unitario = hasForfait ? null : d.quantita ? totalFinal / d.quantita : 0;
  d.ha_righe_forfait = hasForfait;
  d.full_cost_totale = hasForfait ? null : fullTotal;
  d.margine_netto_complessivo_valore = hasForfait ? null : totalFinal - fullTotal;
  d.margine_netto_complessivo_perc = hasForfait ? null : totalFinal ? (totalFinal - fullTotal) / totalFinal * 100 : 0;
  d.descrizione = d.titolo_preventivo || "Preventivo unatantum";
  const lines = (d.prodotti as Product[]).map((p,i) =>
    isForfait(p) ? `${i+1}. ${p.descrizione} - a forfait/da definire - € ${euro(p.totale_finale)}` :
    (i + 1) + ". " + p.descrizione + " - " + p.quantita + " pz - € " + euro(p.prezzo_netto_unitario_finale) + "/pz - € " + euro(p.totale_finale)
  );
  d.summary = "PREVENTIVO UNA TANTUM\nCliente: " + (d.cliente || "") +
    "\nRiferimento: " + (d.riferimento_preventivo || "") +
    "\n\n" + lines.join("\n") + (d.ral_riepilogo ? "\nCambio colore RAL: € " + euro(d.ral_riepilogo.fixed) : "") + "\n\nTotale: € " + euro(totalFinal);
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
  const standardProducts=(d.prodotti as Product[]).filter(p=>!isForfait(p));
  const engineering=standardProducts.reduce((sum,p)=>
    sum+val(p.progettazione_h)*val(p.costo_progettazione),0);
  const treatment=standardProducts.reduce((sum,p)=>
    sum+val(p.trattamenti_cad)*val(p.quantita),0);
  if (engineering<0 || treatment<0) throw new Error("Impossibile convertire costi negativi dello storico");
  d.costi_comuni_versione=2;
  d.progettazione_totale_euro=engineering;
  d.trattamenti_modalita="per_prodotto";
  // Remember the current aggregate, ready if the user selects global mode.
  d.trattamenti_totale_euro=treatment;
  for(const p of standardProducts){
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
