import {
  calculateOfferLotPrice,
  cycleForOfferRow,
  discountFactor,
  offerLotTerms,
  selectedOfferLots,
  withCalculatedOfferRow,
  withOfferLotTerms,
  type CommercialOfferRow,
} from "./commercial-offer-pricing";
import type { CustomerPricePresentation } from "./commercial-offer-pdf";

export type CommercialOfferDocument = {
  cliente?: string;
  righe: CommercialOfferRow[];
  [key: string]: unknown;
};

export type CommercialOfferSplitPrice = {
  rowIndex: number;
  codice: string;
  descrizione: string;
  lotto: number;
  prezzoFinaleCliente: number;
  prezzoDistributore: number;
};

export function distributorNetPriceFromFinalPrice(finalPrice: number, markupPercent: number): number {
  if (!Number.isFinite(finalPrice) || finalPrice <= 0)
    throw new Error("Il prezzo finale al cliente deve essere maggiore di zero");
  if (!Number.isFinite(markupPercent) || markupPercent < 0)
    throw new Error("Il ricarico del distributore deve essere una percentuale non negativa");
  return finalPrice / (1 + markupPercent / 100);
}

export function previewCommercialOfferSplit(
  offer: CommercialOfferDocument,
  markupPercent: number,
  pricePresentation: CustomerPricePresentation = "netto",
): CommercialOfferSplitPrice[] {
  if (!Array.isArray(offer.righe) || !offer.righe.length)
    throw new Error("Inserire almeno un prodotto nel preventivo");

  return offer.righe.flatMap((row, rowIndex) => {
    const isCycleRow = Boolean(cycleForOfferRow(row));
    const selected = selectedOfferLots(row);
    const lots = selected.length ? selected : [positiveInteger(row.lotto)].filter((lot): lot is number => lot != null);
    if (!lots.length)
      throw new Error(`Selezionare almeno un lotto per il prodotto ${rowIndex + 1}`);
    if (!isCycleRow && lots.some((lot) => lot !== Number(row.lotto)))
      throw new Error(`Il prodotto ${rowIndex + 1} deve avere un solo lotto di riferimento`);

    return lots.map((lot) => {
      // The customer PDF presents unit prices to cents. Base the distributor
      // markup on that same visible amount so the two documents reconcile.
      const finalPrice = roundCurrency(finalCustomerNetPrice(row, lot, isCycleRow, rowIndex, pricePresentation));
      return {
        rowIndex,
        codice: String(row.codice ?? ""),
        descrizione: String(row.descrizione ?? ""),
        lotto: lot,
        prezzoFinaleCliente: finalPrice,
        prezzoDistributore: distributorNetPriceFromFinalPrice(finalPrice, markupPercent),
      };
    });
  });
}

export function buildDistributorOffer(
  offer: CommercialOfferDocument,
  distributorName: string,
  markupPercent: number,
  pricePresentation: CustomerPricePresentation = "netto",
): CommercialOfferDocument {
  const preview = previewCommercialOfferSplit(offer, markupPercent, pricePresentation);
  const pricesByRow = new Map<number, CommercialOfferSplitPrice[]>();
  for (const price of preview) {
    const rowPrices = pricesByRow.get(price.rowIndex) ?? [];
    rowPrices.push(price);
    pricesByRow.set(price.rowIndex, rowPrices);
  }

  const rows = offer.righe.map((row, rowIndex) => {
    const prices = pricesByRow.get(rowIndex) ?? [];
    if (cycleForOfferRow(row)) {
      let distributorRow = { ...row };
      for (const price of prices) {
        distributorRow = withOfferLotTerms(distributorRow, price.lotto, {
          prezzo_netto_manuale: price.prezzoDistributore,
          prezzo_finale_riferimento: price.prezzoFinaleCliente,
        });
      }
      return withCalculatedOfferRow(distributorRow);
    }

    if (!prices.length) return row;
    let distributorRow = { ...row };
    for (const price of prices) {
      distributorRow = withOfferLotTerms(distributorRow, price.lotto, {
        prezzo_netto_manuale: price.prezzoDistributore,
        prezzo_finale_riferimento: price.prezzoFinaleCliente,
      });
    }
    const primaryPrice = prices.find((price) => price.lotto === Number(row.lotto)) ?? prices[0];
    return {
      ...distributorRow,
      netto: primaryPrice.prezzoDistributore,
      netto_base: primaryPrice.prezzoDistributore,
      prezzo_netto_proposto: primaryPrice.prezzoDistributore,
      totale_riga: primaryPrice.prezzoDistributore * primaryPrice.lotto,
    };
  });

  return { ...offer, cliente: distributorName, righe: rows };
}

function finalCustomerNetPrice(
  row: CommercialOfferRow,
  lot: number,
  isCycleRow: boolean,
  rowIndex: number,
  pricePresentation: CustomerPricePresentation,
): number {
  if (isCycleRow) {
    const calculated = calculateOfferLotPrice(row, lot);
    if (calculated.manualNetPrice != null || pricePresentation === "netto") return calculated.netPrice;
    return discountedListPrice(row, lot, rowIndex);
  }
  if (pricePresentation === "listino_sconto") return discountedListPrice(row, lot, rowIndex);
  const raw = row.prezzo_netto_proposto ?? row.netto ?? row.netto_base;
  const value = typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`Inserire un prezzo finale positivo per il prodotto ${rowIndex + 1}`);
  return value;
}

function discountedListPrice(row: CommercialOfferRow, lot: number, rowIndex: number): number {
  const listino = offerLotTerms(row, lot).listino ?? row.listino;
  const price = typeof listino === "string" ? Number(listino.trim().replace(",", ".")) : Number(listino);
  if (!Number.isFinite(price) || price <= 0)
    throw new Error(`Inserire un prezzo di listino positivo per il prodotto ${rowIndex + 1}, lotto ${lot}`);
  return price * discountFactor(combinedDiscount(row));
}

function combinedDiscount(row: CommercialOfferRow): string {
  const base = String(row.sconto_base ?? "").trim();
  const extra = Number(row.extra ?? 0);
  return base + (extra > 0 ? (base ? "+" : "") + String(extra).replace(".", ",") + "%" : "");
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
