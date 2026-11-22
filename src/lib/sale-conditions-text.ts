/**
 * Testo ufficiale della pagina «Condizioni di vendita» allegata ai documenti,
 * trascritto dallo screenshot fornito il 2026-11-21. UNICA FONTE condivisa
 * dalla stampa HTML (quote-pdf.ts) e dal PDF email (quote-pdf-file.ts):
 * non duplicare il testo altrove.
 *
 * La pagina allegata mostra ESCLUSIVAMENTE questo contenuto, bilingue
 * IT/EN su due colonne come nell'originale: niente intestazioni di listino,
 * loghi, piè di pagina o altra grafica superflua.
 *
 * La regola di business sullo sconfezionamento (sezione CONFEZIONI/PACKAGES:
 * «un aumento del 20%» sulle confezioni non conformi ai quantitativi della
 * colonna "pack") è recepita dal calcolo in quote-series.ts
 * (UNPACKING_SURCHARGE_FACTOR).
 */

export const SALE_CONDITIONS_TITLE = "CONDIZIONI DI VENDITA - CONDITIONS OF SALE";

export interface SaleConditionSection {
  it: { title: string; body: string };
  en: { title: string; body: string };
}

export const SALE_CONDITIONS_SECTIONS: SaleConditionSection[] = [
  {
    it: {
      title: "Commissioni",
      body: "Le nostre offerte, come le commissioni assunte dai nostri incaricati, non sono impegnative se non dopo la conferma da parte della nostra ditta. L'importo minimo imponibile per l'evasione di un ordine è di €150,00 (IVA esclusa) non cumulabile con altri ordini in corso. Eventuali aggiunte ad ordini in corso con importi inferiori a €150,00 (IVA esclusa) saranno considerate tali solo se notificate alla nostra sede entro 24 ore dal ricevimento dell'ordine a cui l'aggiunta si presume collegata. Le ordinazioni che non raggiungono il minimo imponibile di €150,00 potranno essere evase solo previa accettazione del cliente di un contributo \"spese di evasione\" di €15,00.",
    },
    en: {
      title: "Commissions",
      body: "Offers or commissions offered by our collaborators are not binding unless confirmed by our company. The minimum taxable amount for executing an order is € 150 (VAT not included), which cannot be accumulated with other orders in progress. Any additions to orders in progress for amounts of less than € 150 (VAT not included) will only be considered if our headquarters is notified within 24 hours of receiving the order, to which the addition is presumably connected. Orders that don't reach the minimum taxable amount of €150,00 will be executed only prior customer's acceptance of a contribution \"executing costs\" of €15,00.",
    },
  },
  {
    it: {
      title: "Confezioni",
      body: "I quantitativi delle confezioni sono quelle espressi nella colonna \"pack\" del presente listino. Sulle confezioni non conformi ai quantitativi espressi nella suddetta colonna, verrà applicato un aumento del 20%.",
    },
    en: {
      title: "Packages",
      body: "Orders shall comply with the quantity of packages indicated in this price list under the heading \"pack\". An increase of 20% shall be applied to any non-conforming quantities.",
    },
  },
  {
    it: {
      title: "Termini di consegna",
      body: "I termini di consegna hanno solo carattere indicativo. In ogni caso qualsiasi indennità per ritardata consegna, non potrà mai essere pretesa dal committente.",
    },
    en: {
      title: "Terms of delivery",
      body: "Terms of delivery are purely indicative. The purchaser shall not claim any damages in the case of late delivery.",
    },
  },
  {
    it: {
      title: "Rischi imballi",
      body: "La merce accuratamente imballata viaggia a rischio e pericolo del committente. Non si assume alcuna responsabilità per furti, avarie, manomissioni che si dovessero verificare durante il trasporto.",
    },
    en: {
      title: "Packaging risks",
      body: "Goods are carefully packaged and travel at the purchaser's risk. We shall not be held liable for any thefts, faults or tampering which may take place during carriage.",
    },
  },
  {
    it: {
      title: "Resi",
      body: "Gli eventuali ritorni di merce non saranno accettati se non autorizzati e fatti franchi di ogni spesa ai magazzini del ns. stabilimento. Nessun reso verrà accettato se non accompagnato da regolare D.D.T.",
    },
    en: {
      title: "Returned goods",
      body: "Any returned goods shall not be accepted unless authorised by us and sent free of charge to our warehouses. Any returned goods will be accepted if not accompanied with a regular document of transport.",
    },
  },
  {
    it: {
      title: "Disegni",
      body: "I disegni del catalogo non sono impegnativi e i ns. prodotti potranno essere variati in qualche particolare, qualora si ritenga opportuno senza che ciò possa provocare reclami da parte del committente.",
    },
    en: {
      title: "Drawings",
      body: "Any drawings in the catalogue are not binding and any part of our products may be modified at any time as necessary without causing complaints from purchasers.",
    },
  },
  {
    it: {
      title: "Pagamenti",
      body: "Ci riserviamo il diritto di proprietà sui materiali forniti fino al completo pagamento dei medesimi. Trascorso il termine stabilito per il pagamento, decorreranno gli interessi di mora in ragione del 6% in più del tasso ufficiale di sconto. Per ordinazioni fino a € 200 (IVA esclusa) il pagamento avverrà in contrassegno.",
    },
    en: {
      title: "Payment",
      body: "We reserve ownership rights on the materials supplied until payment of the materials has been settled entirely. When the established term of payment has expired, interest on arrears shall be applied at the rate of 6% above the official rate of discount. For orders up to € 200(net), payment shall be cash on delivery.",
    },
  },
  {
    it: { title: "Porto", body: "Assegnato" },
    en: { title: "Port", body: "Assigned" },
  },
  {
    it: {
      title: "Reclami",
      body: "Trascorsi trenta giorni dal ricevimento della merce, il compratore si intende decaduto dal diritto di proporre qualsiasi reclamo a qualsiasi titolo.",
    },
    en: {
      title: "Complaints",
      body: "Thirty days following receipt of the goods, the purchaser shall no longer have any right to make complaints whatsoever.",
    },
  },
  {
    it: {
      title: "Domicilio legale",
      body: "Qualunque contestazione in dipendenza delle nostre vendite, resta devoluta all'Autorità giudiziaria competente della ns. sede; in nessun altro caso la ns. ditta potrà essere convenuta dinanzi ad altri giudici.",
    },
    en: {
      title: "Legal domicile",
      body: "Any claim regarding our sales shall be dealt with by the competent Judicial Authorities in our area. Our company shall not be summoned before any other judge.",
    },
  },
];

/** Righe di chiusura della pagina (la prima è in grassetto nell'originale). */
export const SALE_CONDITIONS_CLOSING = {
  it: [
    "Le presenti condizioni, tutte, si intendono accettate col fatto dell'ordinazione della merce",
    "Prezzi in Euro (IVA esclusa)",
    "Il presente listino annulla e sostituisce il precedente",
  ],
  en: [
    "All these conditions are understood to be accepted when an order is placed for any goods.",
    "Prices in Euros (VAT not included).",
    "This price list annuls and replaces any former price lists.",
  ],
} as const;
