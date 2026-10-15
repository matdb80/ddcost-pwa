import type {QuoteDocument} from "./quote-calculation";

export type QuoteWizardStep = {
  id:string; title:string; section:string; hint:string;
  field?:string; index?:number; required?:boolean;
  kind?:"text"|"select"|"number"|"textarea"|"checkbox";
  numeric?:"euro"|"decimal"|"percent";
  advanced?:boolean;
};
const step=(id:string,title:string,section:string,hint:string,more:Partial<QuoteWizardStep>={}):QuoteWizardStep=>
  ({id,title,section,hint,...more});

/** The mobile editor exposes the same fields/algorithms, only sequenced. */
export function buildQuoteWizardSteps(doc:QuoteDocument,advanced=false):QuoteWizardStep[]{
  const version=Number(doc.costi_comuni_versione)||0;
  const steps:QuoteWizardStep[]=[
    step("cliente","Per quale cliente?","Intestazione","Indica il cliente del preventivo.",{field:"cliente",kind:"text",required:true}),
    ...(advanced?[
      step("riferimento_preventivo","Riferimento preventivo","Intestazione","Numero o riferimento interno, facoltativo.",{field:"riferimento_preventivo",kind:"text",advanced:true}),
      step("titolo_preventivo","Titolo preventivo","Intestazione","Titolo descrittivo del documento.",{field:"titolo_preventivo",kind:"text",advanced:true}),
    ]:[]),
  ];
  const items=Array.isArray(doc.prodotti)?doc.prodotti:[];
  items.forEach((_,i)=>{
    const s="Prodotto "+(i+1)+" di "+items.length;
    const add=(key:string,title:string,hint:string,more:Partial<QuoteWizardStep>={})=>
      steps.push(step("p:"+i+":"+key,title,s,hint,{field:key,index:i,...more}));
    add("descrizione","Che prodotto vuoi preventivare?","Descrivi l'articolo o la lavorazione.",{kind:"text",required:true});
    if(advanced)add("codice","Codice articolo","Codice interno, se già disponibile.",{kind:"text",advanced:true});
    add("gruppo_merceologico","Gruppo merceologico","Seleziona il gruppo di appartenenza.",{kind:"select",required:true});
    add("materiale_prodotto","Materiale del prodotto","Scegli il materiale principale.",{kind:"select",required:true});
    add("quantita","Quanti pezzi?","La quantità serve anche a ripartire i costi comuni.",{kind:"number",numeric:"decimal",required:true});
    add("materiale_cad","Costo materiale per pezzo","Costo diretto del materiale in euro per singolo pezzo.",{kind:"number",numeric:"euro"});
    add("lavoro_h","Ore complessive di lavorazione","Tempo totale per produrre la quantità indicata.",{kind:"number",numeric:"decimal"});
    if(advanced){
      add("costo_lavoro","Costo orario manodopera","Tariffa di lavorazione in €/ora.",{kind:"number",numeric:"euro",advanced:true});
      add("attrezzaggi_h","Ore complessive di attrezzaggio","Tempo di preparazione relativo a questo prodotto.",{kind:"number",numeric:"decimal",advanced:true});
    }
    if(version<2){
      add("trattamenti_cad","Trattamenti per pezzo","Costo €/pezzo del documento storico.",{kind:"number",numeric:"euro"});
      add("progettazione_h","Ore progettazione della riga (storico)","Campo storico, prima del costo comune.",{kind:"number",numeric:"decimal"});
      add("costo_progettazione","Tariffa progettazione della riga (storico)","Costo orario del modello storico.",{kind:"number",numeric:"euro"});
    }else if(doc.trattamenti_modalita!=="globale"){
      add("trattamenti_cad","Trattamenti per pezzo","Costo trattamento specifico di questo prodotto.",{kind:"number",numeric:"euro"});
    }
    if(advanced){
      add("ricarico_spese","Spese generali (%)","Ricarico dei costi diretti di questo prodotto.",{kind:"number",numeric:"percent",advanced:true});
      add("margine","Margine commerciale (%)","Margine netto desiderato sul prezzo di vendita.",{kind:"number",numeric:"percent",advanced:true});
      add("prezzo_manuale","Prezzo manuale per pezzo","Facoltativo: prevale sul prezzo calcolato.",{kind:"number",numeric:"euro",advanced:true});
      add("quadrabile","Prezzo modificabile dalla quadratura?","Disattivando, il prezzo della riga non viene rettificato.",{kind:"checkbox",advanced:true});
    }
    steps.push(step("p:"+i+":done","Riepilogo del prodotto",s,"Controlla il risultato o aggiungi un altro prodotto."));
  });
  if(version>=3){
    steps.push(step("progettazione_ore","Ore totali di progettazione","Costi comuni","Questo tempo riguarda l'intero preventivo.",{field:"progettazione_ore",kind:"number",numeric:"decimal"}));
    steps.push(step("costo_progettazione_ora","Costo orario progettazione","Costi comuni","Le ore vengono moltiplicate per questa tariffa, una sola volta.",{field:"costo_progettazione_ora",kind:"number",numeric:"euro"}));
  }else if(version>=2){
    steps.push(step("progettazione_totale_euro","Progettazione totale (€)","Costi comuni","Importo totale del modello precedente, ripartito tra tutti i pezzi.",{field:"progettazione_totale_euro",kind:"number",numeric:"euro"}));
  }
  if(version>=2){
    steps.push(step("trattamenti_modalita","Come attribuire i trattamenti?","Costi comuni","Scegli tra costo complessivo o costo specifico per prodotto.",{field:"trattamenti_modalita",kind:"select"}));
    if(doc.trattamenti_modalita==="globale"){
      steps.push(step("trattamenti_totale_euro","Costo totale trattamenti (€)","Costi comuni","L'importo sarà diviso tra tutti i pezzi dell'offerta.",{field:"trattamenti_totale_euro",kind:"number",numeric:"euro"}));
    }
  }
  if(advanced){
    steps.push(step("target_totale","Totale desiderato (€)","Opzioni avanzate","Facoltativo: la quadratura adatta i prezzi delle righe non bloccate.",{field:"target_totale",kind:"number",numeric:"euro",advanced:true}));
    steps.push(step("listino_prodotto","Prodotto di riferimento per il listino","Opzioni avanzate","Scegli il prodotto a cui riferire lo sconto del cliente.",{kind:"select",advanced:true}));
    steps.push(step("listino_sconto","Sconto cliente","Opzioni avanzate","Ad esempio 40+10%. Il listino lordo viene ricavato dal prezzo netto.",{kind:"text",advanced:true}));
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
  if(!step.required)return null;
  const obj=step.index===undefined?doc:doc.prodotti?.[step.index];
  const value=obj?.[step.field||""];
  if(step.field==="quantita"){
    if(!Number.isFinite(Number(value)) || Number(value)<=0) return "Inserisci una quantità maggiore di zero.";
  }else if(!String(value??"").trim()){
    return "Questo campo è obbligatorio per completare il preventivo.";
  }
  return null;
}
