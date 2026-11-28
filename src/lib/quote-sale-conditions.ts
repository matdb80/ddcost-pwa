/**
 * Requisiti prossima release (2026-11-21): condizioni di vendita in coda al
 * preventivo e contributo "spese di evasione" per i piccoli ordini.
 *
 * La pagina originale delle condizioni (materiali/Condizioni_di_vendita_pagina_417.pdf)
 * stabilisce: «L'importo minimo imponibile per l'evasione di un ordine è di
 * €150,00 (IVA esclusa)… Le ordinazioni che non raggiungono il minimo
 * imponibile di €150,00 potranno essere evase solo previa accettazione del
 * cliente di un contributo "spese di evasione" di €15,00».
 *
 * Il contributo è addebitato UNA SOLA VOLTA per documento, solo quando
 * l'imponibile è strettamente inferiore a 150 € (e maggiore di zero).
 * Quando il cliente sceglie di nascondere il totale del documento, anche il
 * contributo resta nascosto: mostrare un importo senza il totale contraddirebbe
 * la scelta.
 */
import type { PrintLanguage } from "./quote-print-language";

export const SMALL_ORDER_THRESHOLD_EUR = 150;
export const SMALL_ORDER_CONTRIBUTION_EUR = 15;

/**
 * SCELTA ANCORA APERTA — in attesa della decisione di Matteo.
 * La visibilità del contributo è SEPARATA da quella del totale documento:
 * - false (impostazione commerciale attuale): con «Nascondi totale» attivo
 *   anche il contributo "spese di evasione" resta nascosto;
 * - true: con «Nascondi totale» attivo la voce del contributo da 15 €
 *   compare da sola, SENZA il totale con spese di evasione (135 €).
 * Usata come valore predefinito sia dalla stampa (quote-pdf.ts) sia dal
 * PDF email (quote-pdf-file.ts); entrambi accettano l'opzione
 * `showContributionWhenTotalHidden` per scostarsi da questa impostazione.
 */
export const SHOW_CONTRIBUTION_WHEN_TOTAL_HIDDEN = false;

/**
 * Contributo visibile nel documento: separa la sua visibilità da quella del
 * totale. A totale nascosto il contributo compare solo se richiesto.
 */
export function visibleContribution(
  taxableTotal: number,
  hideDocumentTotal?: boolean,
  showContributionWhenTotalHidden: boolean = SHOW_CONTRIBUTION_WHEN_TOTAL_HIDDEN,
): number {
  return hideDocumentTotal && !showContributionWhenTotalHidden
    ? 0
    : smallOrderContribution(taxableTotal);
}

/** Contributo "spese di evasione" dovuto per l'imponibile indicato (0 se non dovuto). */
export function smallOrderContribution(taxableTotal: number): number {
  return taxableTotal > 0 && taxableTotal < SMALL_ORDER_THRESHOLD_EUR
    ? SMALL_ORDER_CONTRIBUTION_EUR
    : 0;
}

const labels = {
  it: {
    contribution: 'Contributo "spese di evasione" (una tantum, imponibile inferiore a € 150,00)',
    totalWithContribution: "Totale netto preventivo con spese di evasione",
  },
  en: {
    contribution: '"Spese di evasione" handling contribution (one-off, taxable amount below € 150.00)',
    totalWithContribution: "Total net quotation including handling contribution",
  },
} as const;

export function saleConditionsLabels(language: PrintLanguage) {
  return labels[language] ?? labels.it;
}
