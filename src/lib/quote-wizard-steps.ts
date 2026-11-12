import {seriesDiscount} from "./series-discount";
import {quoteInoxError} from "./quote-inox";
import {isSeries,isFixedPrice,seriesPriceError} from "./quote-series";
import {isForfait,forfaitAmountError} from "./quote-forfait";
import { calculateQuoteMaterial, quoteMaterialDimensionFields, quoteMaterialGeometry, QUOTE_MATERIAL_GEOMETRIES, QUOTE_MATERIAL_HELP } from "./quote-material-weight";
import type {QuoteDocument} from "./quote-calculation";
import {modificationObjectError} from "./quote-modification-validation";
import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "./quote-product-description";

export type QuoteWizardStep = {
  id:string; title:string; section:string; hint:string;
  field?:string; index?:number; required?:boolean;
  kind?:"text"|"select"|"number"|"textarea"|"checkbox"|"multiselect";
  numeric?:"euro"|"decimal"|"percent";
  advanced?:boolean;
  maxLength?:number;
};
const step=(id:string,title:string,section:string,hint:string,more:Partial<QuoteWizardStep>={}):QuoteWizardStep=>
  ({id,title,section,hint,...more});

/** The mobile editor exposes the same fields/algorithms, only sequenced. */
export function buildQuoteWizardSteps(doc:QuoteDocument,advanced=false):QuoteWizardStep[]{
  const version=Number(doc.costi_comuni_versione)||0;
  const hasStandard=(doc.prodotti??[]).some((p:Record<string,any>)=>!isFixedPrice(p));
  const steps:QuoteWizardStep[]=[
    step("cliente","Per quale cliente?","Intestazione","Indica il cliente del preventivo.",{field:"cliente",kind:"text",required:true}),
    ...(advanced?[
      step("riferimento_preventivo","Riferimento Interno","Intestazione","Numero o riferimento interno, facoltativo.",{field:"riferimento_preventivo",kind:"text",advanced:true}),
      step("titolo_preventivo","Riferimento Cliente","Intestazione","Riferimento indicato dal cliente.",{field:"titolo_preventivo",kind:"text",advanced:true}),
    ]:[]),
  ];
  if(hasStandard && version>=3){
    steps.push(step("lavoro_modalita","Come attribuire le ore di lavorazione?","Attribuzione dei costi comuni",
      "Scegli un monte ore per tutta l'offerta oppure le ore necessarie per realizzare la quantità indicata in ciascuna riga prodotto.",
      {field:"lavoro_modalita",kind:"select"}));
    if(doc.lavoro_modalita==="complessivo")steps.push(step("lavoro_ore_totali","Ore totali di lavorazione dell'offerta","Attribuzione dei costi comuni",
      "Inserisci il monte ore una sola volta. Sarà ripartito sulle righe in proporzione al numero di pezzi, conservando il totale inserito.",
      {field:"lavoro_ore_totali",kind:"number",numeric:"decimal",required:true}));
  }
  // Historical documents keep their original per-product treatment fields.
  // Newer quotes handle treatments in one dedicated block after all product
  // details, so the mode and its costs cannot be mistaken for repeated fields
  // in each product's input sequence.
  const items=Array.isArray(doc.prodotti)?doc.prodotti:[];
  items.forEach((product,i)=>{
    const s="Prodotto "+(i+1)+" di "+items.length;
    const add=(key:string,title:string,hint:string,more:Partial<QuoteWizardStep>={})=>
      steps.push(step("p:"+i+":"+key,title,s,hint,{field:key,index:i,...more}));
    add("descrizione","Che prodotto vuoi preventivare?","Descrivi l'articolo o la lavorazione: massimo 60 caratteri, spazi inclusi.",{kind:"text",required:true,maxLength:QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH});
    if(isSeries(product)){
      add("codice","Codice articolo","Codice dell’articolo di serie, obbligatorio.",{kind:"text",required:true});
      add("quantita","Quanti pezzi?","Quantità dell’articolo di serie.",{kind:"number",numeric:"decimal",required:true});
      add("prezzo_serie","Prezzo unitario di vendita (€/pz)","Prezzo unitario prima degli sconti cliente e dell’eventuale supplemento RAL.",{kind:"number",numeric:"euro",required:true});
      add("sconto_serie","Sconto cliente","Facoltativo: fino a tre sconti successivi, ad esempio 40+15+5%.",{kind:"text"});
      return;
    }
    if(isForfait(product)){
      add("valore_forfait","Valore di vendita a forfait (€)","Importo complessivo fisso della riga, senza costi, quantità, margini, quadratura o supplementi RAL.",{kind:"number",numeric:"euro",required:true});
      return;
    }
    add("oggetto_modifica","Oggetto della modifica","Seleziona almeno una voce per questo prodotto. Puoi indicare più voci o aggiungerne una personalizzata.",{kind:"multiselect",required:true});
    if(advanced)add("codice","Codice articolo","Codice interno, se già disponibile.",{kind:"text",advanced:true});
    add("gruppo_merceologico","Gruppo merceologico","Seleziona il gruppo di appartenenza.",{kind:"select",required:true});
    add("materiale_prodotto","Materiale del prodotto","Scegli il materiale principale.",{kind:"select",required:true});
    add("quantita","Quanti pezzi?","La quantità serve anche a ripartire i costi comuni.",{kind:"number",numeric:"decimal",required:true});
    add("costo_materiale_noto","Conosco il costo del materiale","Seleziona se conosci già il costo per pezzo. Altrimenti lo calcoliamo dalla geometria e dal prezzo al kg.",{kind:"checkbox"});
    if(product.costo_materiale_noto===false){
      add("geometria_materiale","Geometria del materiale",QUOTE_MATERIAL_HELP,{kind:"select",required:true});
      for(const f of quoteMaterialDimensionFields(product))
        add(f.key,f.label,"Dimensioni in millimetri del materiale necessario per un pezzo.",{kind:"number",numeric:"decimal",required:true});
      add("costo_materiale_kg","Costo materiale al kg","Prezzo di acquisto del materiale in €/kg. Il peso è calcolato dalla geometria selezionata.",{kind:"number",numeric:"euro",required:true});
    }else{
      add("materiale_cad","Costo materiale per pezzo","Costo diretto del materiale in euro per singolo pezzo.",{kind:"number",numeric:"euro"});
    }
    if(doc.lavoro_modalita!=="complessivo")add("lavoro_h",
      doc.lavoro_modalita==="per_pezzo"?"Ore di lavorazione per singolo pezzo (modalità precedente)":"Ore di lavorazione di questo prodotto",
      doc.lavoro_modalita==="per_pezzo"?"Modalità precedente: tempo per un pezzo, moltiplicato per la quantità. Puoi convertirlo al passo di imputazione delle ore.":"Inserisci le ore per produrre tutti i pezzi della riga: 16 ore per 10 pezzi equivalgono a 1,6 ore per pezzo.",
      {kind:"number",numeric:"decimal"});
    if(advanced){
      add("costo_lavoro","Costo orario manodopera","Tariffa di lavorazione in €/ora.",{kind:"number",numeric:"euro",advanced:true});
      add("attrezzaggi_h","Ore complessive di attrezzaggio","Tempo di preparazione relativo a questo prodotto.",{kind:"number",numeric:"decimal",advanced:true});
    }
    if(version<2){
      add("trattamenti_cad","Trattamenti per pezzo","Costo €/pezzo del documento storico.",{kind:"number",numeric:"euro"});
      add("progettazione_h","Ore progettazione della riga (storico)","Campo storico, prima del costo comune.",{kind:"number",numeric:"decimal"});
      add("costo_progettazione","Tariffa progettazione della riga (storico)","Costo orario del modello storico.",{kind:"number",numeric:"euro"});
    }
    if(advanced){
      add("ricarico_spese","Spese generali (%)","Ricarico dei costi diretti di questo prodotto.",{kind:"number",numeric:"percent",advanced:true});
      add("prezzo_manuale","Prezzo manuale per pezzo","Facoltativo: prevale sul prezzo calcolato.",{kind:"number",numeric:"euro",advanced:true});
      add("quadrabile","Prezzo modificabile dalla quadratura?","Disattivando, il prezzo della riga non viene rettificato.",{kind:"checkbox",advanced:true});
    }
  });
  // Current cost models ask for the treatment allocation exactly once. Global
  // mode has one quote-wide amount; split mode has one €/piece value per
  // product; in work-hours mode no separate treatment amounts are requested.
  if(hasStandard && version>=2){
    steps.push(step("trattamenti_modalita","Come gestiamo i trattamenti?","Trattamenti dell'offerta",
      "Scegli una sola modalità per tutta l'offerta. La scelta determina i campi che seguono.",
      {field:"trattamenti_modalita",kind:"select"}));
    if(doc.trattamenti_modalita==="globale"){
      steps.push(step("trattamenti_totale_euro","Costo totale dei trattamenti (€)","Trattamenti dell'offerta",
        "Inserisci una sola cifra per tutti i prodotti. Sarà ripartita sul totale dei pezzi; i costi dei singoli prodotti non verranno conteggiati.",
        {field:"trattamenti_totale_euro",kind:"number",numeric:"euro"}));
    }else if(doc.trattamenti_modalita!=="ore_lavoro"){
      items.forEach((product,i)=>!isFixedPrice(product)&&steps.push(step(
        "p:"+i+":trattamenti_cad",
        "Costo trattamento — prodotto "+(i+1)+" (€/pz)",
        "Trattamenti dell'offerta",
        (product.descrizione?product.descrizione+". ":"")+"Inserisci il costo per pezzo di questo prodotto; usa 0 se non richiede trattamenti.",
        {field:"trattamenti_cad",index:i,kind:"number",numeric:"euro"},
      )));
    }
  }
  if(hasStandard && version>=3){
    steps.push(step("progettazione_ore","Ore totali di progettazione","Costi comuni","Questo tempo riguarda l'intero preventivo.",{field:"progettazione_ore",kind:"number",numeric:"decimal"}));
    steps.push(step("costo_progettazione_ora","Costo orario progettazione","Costi comuni","Le ore vengono moltiplicate per questa tariffa, una sola volta.",{field:"costo_progettazione_ora",kind:"number",numeric:"euro"}));
  }else if(hasStandard && version>=2){
    steps.push(step("progettazione_totale_euro","Progettazione totale (€)","Costi comuni","Importo totale del modello precedente, ripartito tra tutti i pezzi.",{field:"progettazione_totale_euro",kind:"number",numeric:"euro"}));
  }
  items.forEach((p,i)=>!isFixedPrice(p)&&steps.push(step(
    "p:"+i+":margine",
    "Margine netto desiderato (%) — prodotto "+(i+1),
    "Prezzo di vendita",
    "Percentuale di margine netto desiderata sul prezzo di vendita di questo prodotto.",
    {field:"margine",index:i,kind:"number",numeric:"percent"},
  )));
  if(advanced){
    if(hasStandard)steps.push(step("target_totale",doc.verniciatura_ral?"Totale desiderato prima RAL (€)":"Totale desiderato (€)","Opzioni avanzate","Facoltativo: la quadratura adatta i prezzi delle righe non bloccate, prima dell’eventuale verniciatura RAL.",{field:"target_totale",kind:"number",numeric:"euro",advanced:true}));
    if(hasStandard)steps.push(step("listino_prodotto","Prodotto di riferimento per il listino","Opzioni avanzate","Scegli il prodotto a cui riferire lo sconto del cliente.",{kind:"select",advanced:true}));
    if(hasStandard)steps.push(step("listino_sconto","Sconto cliente","Opzioni avanzate","Ad esempio 40+10%. Il listino lordo viene ricavato dal prezzo netto.",{kind:"text",advanced:true}));
    for(const [key,title,hint] of [
      ["note_generali","Note generali","Informazioni interne sul preventivo."],
      ["note_cliente","Note cliente","Queste note possono comparire nella copia destinata al cliente."],
      ["note_fornitori","Note fornitori","Informazioni riservate ai fornitori."],
    ]) steps.push(step(key,title,"Opzioni avanzate",hint,{field:key,kind:"textarea",advanced:true}));
  }
  steps.push(step("riepilogo","Riepilogo finale","Conferma","Verifica il preventivo, salva una bozza o completa la revisione."));
  return steps;
}

/** Field validation for advancing; drafts are allowed to remain incomplete. */
export function quoteWizardStepError(step:QuoteWizardStep,doc:QuoteDocument):string|null{
  if(step.field==="sconto_serie"){try{seriesDiscount(doc.prodotti?.[step.index!]?.sconto_serie);return null;}catch(e){return (e as Error).message;}}
  if(!step.required)return null;
  const obj=step.index===undefined?doc:doc.prodotti?.[step.index];
  const value=obj?.[step.field||""];
  if(step.maxLength!==undefined && String(value??"").length>step.maxLength)
    return `Massimo ${step.maxLength} caratteri, spazi inclusi.`;
  if(step.field==="materiale_prodotto"&&obj){const error=quoteInoxError(obj);if(error)return error;}
  if(step.field==="prezzo_serie")return seriesPriceError(value);
  if(step.field==="valore_forfait")return forfaitAmountError(value);
  if(step.field==="geometria_materiale")return QUOTE_MATERIAL_GEOMETRIES.some(g=>g.id===quoteMaterialGeometry(obj??{}))
    ?null:"Seleziona la geometria del materiale.";
  if(step.field==="diametro_interno_mm" && Number(value)>=Number(obj?.diametro_mm))
    return "Il diametro interno deve essere inferiore a quello esterno.";
  if(step.field==="oggetto_modifica")return modificationObjectError(value);
  if(step.field==="quantita" || ["lunghezza_mm","larghezza_mm","spessore_mm","diametro_mm","diametro_interno_mm"].includes(step.field??"")){
    if(!Number.isFinite(Number(value)) || Number(value)<=0) return "Inserisci un numero maggiore di zero.";
  }else if(step.field==="lavoro_ore_totali"){
    if(value==="" || value==null || !Number.isFinite(Number(value)) || Number(value)<0)return "Inserisci un monte ore valido, maggiore o uguale a zero.";
  }else if(step.field==="costo_materiale_kg"){
    if(!Number.isFinite(Number(value)) || Number(value)<0) return "Inserisci un costo al kg valido, non negativo.";
    try{calculateQuoteMaterial(obj??{});}catch(error){return error instanceof Error?error.message:"Materiale non valido";}
  }else if(!String(value??"").trim()){
    return "Questo campo è obbligatorio per completare il preventivo.";
  }
  return null;
}
