/** Formula text shared by the help tooltips on calculated values. */
export const CALCULATION_FORMULAS = {
  cycle: {
    standardCost:
      "Costo industriale standard €/pz = somma delle voci di costo incluse nel ciclo per il lotto selezionato. Comprende materiali, lavorazioni, attrezzaggi ripartiti sul lotto, lavorazioni esterne e attrezzature dedicate.",
    setupPerPiece:
      "Quota attrezzaggio €/pz = (minuti di attrezzaggio × costo lavoro €/min) ÷ lotto applicato. Per ogni riga, il lotto applicato è il maggiore tra Lotto voce e lotto simulato; con «Usa lotto voce del ciclo» si forza Lotto voce per quella simulazione. Se Lotto voce è vuoto o zero, si usa il lotto simulato.",
    fixedCostPerPiece:
      "Costi fissi €/pz = quote degli attrezzaggi più attrezzature dedicate ripartite sul lotto. Sono già compresi nel costo industriale standard e non si sommano di nuovo.",
    fullCost:
      "Full cost €/pz = costo industriale standard × (1 + spese generali % ÷ 100).",
    minimumPrice:
      "Prezzo minimo €/pz = full cost ÷ (1 − margine minimo % ÷ 100). Il margine è calcolato sul prezzo di vendita.",
    minimumMarginEuro:
      "Margine sul prezzo minimo €/pz = prezzo minimo − full cost.",
    minimumMarginPercent:
      "Margine netto sul prezzo minimo % = (prezzo minimo − full cost) ÷ prezzo minimo × 100.",
    marketGrossEuro:
      "Margine lordo €/pz = prezzo di mercato − costo industriale standard.",
    marketGrossPercent:
      "Margine lordo % = (prezzo di mercato − costo industriale standard) ÷ prezzo di mercato × 100.",
    marketNetEuro:
      "Margine netto industriale €/pz = prezzo di mercato − full cost. Esclude imposte e oneri finanziari.",
    marketNetPercent:
      "Margine netto industriale % = (prezzo di mercato − full cost) ÷ prezzo di mercato × 100. Esclude imposte e oneri finanziari.",
    marketExplanation:
      "Il confronto usa: copertura dei costi diretti €/pz = prezzo di mercato − costo industriale standard; scarto dal pareggio €/pz = prezzo di mercato − full cost; copertura percentuale delle spese generali = (prezzo di mercato − costo industriale standard) ÷ (full cost − costo industriale standard) × 100.",
    overheadEuro:
      "Spese generali €/pz = full cost − costo industriale standard = costo industriale standard × spese generali % ÷ 100.",
    costReductionTarget:
      "Costo industriale obiettivo €/pz = prezzo di mercato × (1 − margine netto obiettivo % ÷ 100) ÷ (1 + spese generali % ÷ 100). Risparmio diretto richiesto = costo industriale attuale − costo obiettivo.",
    costReductionPercent:
      "Riduzione complessiva % = risparmio diretto richiesto ÷ costo industriale attuale × 100. Riduzione di categoria % = risparmio richiesto ÷ costo della categoria × 100; ogni categoria è uno scenario alternativo, non cumulativo.",
    costPieShare:
      "Quota % = costo della categoria ÷ somma dei costi classificati nel grafico × 100. Il totale del grafico comprende terzisti, lavorazioni interne e fornitori non terzisti; esclude attrezzature dedicate e mostra a parte i costi non classificati.",
    costPieTotal:
      "Totale categorie rappresentate = costi terzisti + costi lavorazioni interne + costi fornitori non terzisti.",
    costPieDedicatedExcluded:
      "Attrezzature dedicate escluse dalla torta = somma del costo per pezzo delle righe SPESA ATTREZZATURA DEDICATA attive (costo unitario ÷ lotto simulato).",
  },
  commercialOffer: {
    fixedCostPerPiece:
      "Quota fissa €/pz = attrezzaggi del ciclo ripartiti sul lotto + attrezzature dedicate ripartite sul lotto. È già inclusa nel costo industriale standard.",
    overheadPerPiece:
      "Spese generali €/pz = costo industriale standard del lotto × ricarico spese generali % ÷ 100. La percentuale si applica all'intero costo industriale, inclusi attrezzaggi e attrezzature.",
    fullCost:
      "Costo pieno €/pz = costo industriale standard del lotto + spese generali sul costo industriale standard.",
    netPrice:
      "Prezzo netto calcolato €/pz = costo pieno ÷ (1 − margine netto desiderato % ÷ 100). Il margine è calcolato sul prezzo di vendita; il risultato è arrotondato al centesimo superiore per non scendere sotto il margine richiesto.",
    finalNetPrice:
      "Prezzo netto finale €/pz = prezzo netto manuale del lotto, se inserito; altrimenti prezzo netto calcolato dal costo pieno e dal margine desiderato.",
    distributorMarkup:
      "Prezzo al cliente finale = prezzo netto al distributore × (1 + ricarico distributore % ÷ 100). Per ricavare a ritroso il prezzo al distributore dal prezzo finale: prezzo finale ÷ (1 + ricarico distributore % ÷ 100). Il ricarico è calcolato sul prezzo di acquisto del distributore.",
    actualMargin:
      "Margine netto effettivo % = (prezzo netto proposto − costo pieno) ÷ prezzo netto proposto × 100.",
    additionalDiscount:
      "Sconto extra per adeguamento mercato % = (1 − prezzo netto finale ÷ netto dopo lo sconto cliente) × 100. Se il risultato è negativo, indica la maggiorazione necessaria rispetto al netto dopo lo sconto cliente.",
    lotTotal:
      "Totale lotto = prezzo netto unitario × quantità del lotto.",
    listPrice:
      "Listino = prezzo netto ÷ fattore sconto, arrotondato al centesimo superiore. Per sconti in sequenza, fattore sconto = prodotto di (1 − ciascuna percentuale di sconto ÷ 100).",
    netAfterDiscount:
      "Netto dopo sconto = prezzo di listino × prodotto dei fattori (1 − ciascuna percentuale di sconto ÷ 100).",
  },
  quote: {
    engineeringTotal:
      "Progettazione totale € è un costo unico dell'intero preventivo. Nel modello per ore: ore di progettazione × costo €/h; nei preventivi storici convertiti: importo complessivo inserito una sola volta.",
    engineeringPerPiece:
      "Progettazione €/pz = costo totale di progettazione dell'intero preventivo ÷ somma delle quantità di tutti i prodotti.",
    globalTreatmentPerPiece:
      "Trattamenti comuni €/pz = costo totale dei trattamenti dell'offerta ÷ somma delle quantità di tutti i prodotti.",
    productDirectCost:
      "Costo primo €/pz = (materiali + manodopera + trattamenti + attrezzaggi + progettazione assegnata al prodotto) ÷ quantità del prodotto. La progettazione condivisa e i trattamenti globali sono ripartiti sui pezzi totali secondo la modalità scelta.",
    productFullCost:
      "Full cost €/pz = costo primo €/pz × (1 + spese generali % ÷ 100).",
    productNetPrice:
      "Prezzo netto calcolato €/pz = full cost €/pz ÷ (1 − margine % ÷ 100). Il margine è calcolato sul prezzo di vendita.",
    productFinalPrice:
      "Prezzo finale €/pz = prezzo manuale, se inserito; altrimenti prezzo netto calcolato. Se è impostata una quadratura e la riga è quadrabile, si aggiunge la rettifica unitaria: differenza tra target e totale pre-quadratura × peso della riga ÷ quantità. Il peso è proporzionale al totale pre-quadratura delle righe quadrabili; se tale totale è zero, è proporzionale alle quantità.",
    productTotal:
      "Totale riga = prezzo finale €/pz × quantità del prodotto.",
    quoteTotal:
      "Totale preventivo = somma dei totali finali di tutte le righe prodotto.",
    netMarginValue:
      "Margine netto complessivo € = totale preventivo finale − somma dei full cost di tutti i prodotti (full cost €/pz × quantità).",
    netMarginPercent:
      "Margine netto complessivo % = margine netto complessivo € ÷ totale preventivo finale × 100.",
    listPrice:
      "Listino = netto di riferimento ÷ fattore sconto, arrotondato al centesimo superiore. Per sconti in sequenza, fattore sconto = prodotto di (1 − ciascuna percentuale di sconto ÷ 100).",
    netAfterDiscount:
      "Netto dopo sconto = listino lordo × prodotto dei fattori (1 − ciascuna percentuale di sconto ÷ 100).",
    outcomeSummary:
      "Valore = somma degli importi delle revisioni definitive più recenti con questo esito. Le bozze sono escluse; preventivi senza importo non contribuiscono al totale.",
    outcomeCount:
      "Conteggio delle revisioni definitive più recenti con questo esito. Le bozze sono escluse.",
    definitiveTotal:
      "Valore complessivo = somma degli importi delle revisioni definitive più recenti, indipendentemente dall'esito. Le bozze sono escluse; preventivi senza importo non contribuiscono al totale.",
    definitiveCount:
      "Conteggio delle revisioni definitive più recenti, indipendentemente dall'esito. Le bozze sono escluse.",
  },
  material: {
    theoreticalWeight:
      "Peso teorico kg/pezzo = lunghezza mm × larghezza mm × spessore mm × densità kg/mm³. Densità usata: ferro 7,85×10⁻⁶, inox 8,00×10⁻⁶, ottone 8,50×10⁻⁶ kg/mm³.",
    materialCost:
      "Costo materiale €/pz = peso teorico kg/pezzo × costo materiale €/kg. Non comprende fori, sagome, sfridi o lavorazioni aggiuntive.",
  },
  bandelleVeneta: {
    basePrice:
      "Prezzo base unitario = importo della tabella del tipo di bandella selezionato all'incrocio tra numero di fori vite e fascia della quantità. Per 1–3 pezzi si usa il prezzo unitario della fascia 4–10. Il prezzo della fascia si applica a tutti i pezzi del lotto.",
    doubleBasePrice:
      "Vicentine doppie: ciascuna metà ha da 2 a 6 fori vite e il minimo è 2+2. Si sommano i fori delle due metà. Se il totale è 4, 6, 8, 10 o 12 si prende la riga corrispondente. Per 5, 7, 9 o 11 fori si usa la media dei prezzi delle due righe adiacenti nella fascia del lotto, arrotondata al centesimo. Per 1–3 pezzi si usa il prezzo della fascia 4–10.",
    additions:
      "Supplementi per pezzo = somma delle modifiche selezionate: occhi saldati 1,50 €; aumento dello spessore 1,00 € ogni 0,5 mm rispetto allo standard; rinforzo 2,00 €; diametro occhio diverso da Ø12 mm 2,00 €.",
    unitPrice:
      "Prezzo di vendita unitario = prezzo base della tabella + somma dei supplementi per pezzo selezionati.",
    lotTotal:
      "Totale lotto = prezzo di vendita unitario, comprensivo dei supplementi, × quantità effettivamente acquistata. Anche per 1–3 pezzi si moltiplica per la quantità richiesta. Gli importi sono calcolati in centesimi e mostrati con due decimali.",
  },
  bandelleT: {
    basePrice:
      "Prezzo base €/pz = prezzo del listino Smeralda per tipologia, misura di collo più vicina a quella inserita e fascia di quantità. In caso di pari distanza viene usata la misura superiore. Fuori dall'intervallo pubblicato si usa il limite più vicino come prezzo indicativo, da verificare. Il valore del listino già include l'aumento del 4,5% indicato dal 01/03/2026.",
    additions:
      "Supplementi €/pz = somma delle opzioni selezionate: occhio diverso +€3,00; decentratura inversa +€1,00 solo per standard decentrato; sormonto +€2,50 per standard/misura o +€2,00 per zanca.",
    unitPrice:
      "Prezzo netto unitario = prezzo base da listino + supplementi selezionati, arrotondato a 3 decimali.",
    lotTotal:
      "Totale lotto = prezzo netto unitario × quantità, arrotondato a 3 decimali.",
  },
} as const;

export function cycleCategoryFormula(category: string): string {
  switch (category) {
    case "COMPONENTE":
    case "COMPONENTE/ASSIEME":
      return "Costo riga €/pz = numero componenti × costo unitario. Gli assiemi automatici sommano ricorsivamente i costi dei componenti figli moltiplicati per la quantità dell'assieme.";
    case "MATERIA PRIMA DA TRASFORMARE":
      return "Costo riga €/pz = peso kg × numero componenti × costo €/kg × (1 + sfrido % ÷ 100). Se il peso manca, è stimato dalle dimensioni come L × larghezza × spessore × 7,85×10⁻⁶ kg/mm³.";
    case "LAVORAZIONE INTERNA":
      return "Costo riga €/pz: lavorazione standard = (costo lavoro €/min ÷ pezzi/min) × numero componenti; confezionamento = (tempo confezionamento min/scatola ÷ pezzi/scatola) × costo lavoro €/min. In entrambi i casi si aggiunge l'attrezzaggio: attrezzaggio min × costo lavoro €/min ÷ lotto applicato. Lotto applicato = maggiore tra Lotto voce e lotto simulato; l'override usa Lotto voce per quella simulazione.";
    case "LAVORAZIONE A PESO":
    case "LAVORAZIONE TERZISTA A PESO":
      return "Costo riga €/pz = peso kg × numero componenti × costo unitario €/kg. Se il peso manca, è stimato dalle dimensioni del pezzo.";
    case "LAVORAZIONE A PEZZO":
    case "LAVORAZIONE TERZISTA A PEZZO":
      return "Costo riga €/pz = numero componenti × costo unitario €/pz.";
    case "SPESA ATTREZZATURA DEDICATA":
      return "Costo attrezzatura €/pz = costo unitario dell'attrezzatura ÷ lotto simulato. La riga entra nel calcolo solo se è attiva.";
    default:
      return "Valore di categoria = somma dei costi delle righe incluse appartenenti a questa categoria; le righe di dettaglio già comprese in un assieme non si conteggiano due volte.";
  }
}
