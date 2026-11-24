export type PrintLanguage = "it" | "en";
const italian = {
  title: "Preventivo una tantum",
  number: "Numero preventivo",
  revision: "Revisione",
  date: "Data",
  client: "Cliente",
  reference: "Riferimento",
  color: "Colore",
  products: "Prodotti e prezzi netti",
  product: "Prodotto",
  quantity: "Quantità",
  netUnitPrice: "Prezzo netto unitario",
  netTotal: "Totale netto",
  total: "Totale netto preventivo",
  notes: "Note",
  unitPrice: "Prezzo unitario",
  discount: "Sconto",
  netPrice: "Prezzo netto",
  withRal: " con RAL",
  pieces: "pz",
  forfait: "a forfait/da definire",
  special: "PRODOTTO SPECIALE REALIZZATO SU DISEGNO",
  country: "Italia",
  vat: "P. IVA / C.F.",
  registry: "Registro Imprese BL",
};
const english: typeof italian = {
  title: "One-time quotation",
  number: "Quotation number",
  revision: "Revision",
  date: "Date",
  client: "Customer",
  reference: "Reference",
  color: "Colour",
  products: "Products and net prices",
  product: "Product",
  quantity: "Quantity",
  netUnitPrice: "Net unit price",
  netTotal: "Net total",
  total: "Total net quotation",
  notes: "Notes",
  unitPrice: "Unit price",
  discount: "Discount",
  netPrice: "Net price",
  withRal: " including RAL",
  pieces: "pcs",
  forfait: "lump sum/to be defined",
  special: "SPECIAL PRODUCT MADE TO DRAWING",
  country: "Italy",
  vat: "VAT / Tax ID",
  registry: "BL Companies Register",
};
export const quotePrintLabels = (language: PrintLanguage) =>
  language === "en" ? english : italian;
export const printLocale = (language: PrintLanguage) =>
  language === "en" ? "en-GB" : "it-IT";

/** v20: dicitura «Consegna stimata» nella testata del PDF cliente.
 *  Restituisce la frase completa (singolare/plurale, IT/EN) oppure null
 *  quando il campo è vuoto o non valido: in tal caso la riga si omette,
 *  così i preventivi storici escono senza attribuire tempi mai concordati. */
export function deliveryWeeksPhrase(weeks: unknown, language: PrintLanguage): string | null {
  // v21: stessa regola del router — una stringa è valida solo se fatta di
  // sole cifre ("4e2" non deve diventare 400 nemmeno su dati preesistenti).
  const n = typeof weeks === "string"
    ? (/^\d+$/.test(weeks) ? Number(weeks) : Number.NaN)
    : weeks;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null;
  return language === "en"
    ? `Estimated delivery: ${n} ${n === 1 ? "week" : "weeks"} from written confirmation`
    : `Consegna stimata: ${n} ${n === 1 ? "settimana" : "settimane"} dalla conferma scritta`;
}

/** R2 (TKT-20261119-86210002): nota fissa precompilata nei preventivi unatantum. */
export const CUSTOM_PRODUCTS_NOTE = {
  it: "Il preventivo contiene prodotti custom realizzati su specifiche del cliente. La variazione delle quantità può comportare variazioni del prezzo finale dovute alla gestione dei costi fissi di approntamento. Non considerare valida l'offerta se le quantità dovessero variare.",
  en: "This quotation contains custom products made to the customer's specifications. Any change in the quantities may affect the final price due to the fixed setup costs involved. The offer shall not be considered valid if the quantities vary.",
} as const;
/** Traduce la nota fissa sui prodotti custom lasciando invariato il testo libero dell'utente. */
export function translateClientNotes(notes: string, language: PrintLanguage): string {
  return language === "en" ? notes.split(CUSTOM_PRODUCTS_NOTE.it).join(CUSTOM_PRODUCTS_NOTE.en) : notes;
}
