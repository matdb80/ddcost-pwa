// Primo livello di selezione Giotto Plus, definito da Matteo il 24/10/2026.
export const BANDELLE_VENETA_TYPES = [
  { value: "dritte", label: "Bandelle dritte" },
  { value: "dritte-con-sormonto", label: "Bandelle dritte con sormonto" },
  { value: "dritte-zancate", label: "Bandelle dritte zancate" },
  { value: "vicentine-dritte", label: "Bandelle vicentine dritte" },
  { value: "vicentine-doppie", label: "Bandelle vicentine doppie" },
  { value: "snodate", label: "Bandelle snodate" },
  { value: "snodate-zancate", label: "Bandelle snodate zancate" },
] as const;

export type BandellaVenetaType = (typeof BANDELLE_VENETA_TYPES)[number]["value"];

// Secondo livello confermato per il tipo "Bandelle dritte".
export const BANDELLE_DRITTE_TYPOLOGIES = [
  { value: "occhio-decentrato-legno", label: "Occhio decentrato Legno" },
  { value: "occhio-centrale-legno", label: "Occhio centrale Legno" },
  { value: "occhio-decentrato-pvc", label: "Occhio decentrato PVC" },
] as const;

export type BandellaDrittaTypology = (typeof BANDELLE_DRITTE_TYPOLOGIES)[number]["value"];

// Modifiche al prodotto standard ammesse per le tre tipologie di bandelle dritte.
export const BANDELLE_DRITTE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
] as const;

// Tipologie e varianti delle dritte con sormonto, definite da Matteo il 24/10/2026.
export const BANDELLE_DRITTE_CON_SORMONTO_TYPOLOGIES = [
  { value: "occhio-decentrato", label: "Occhio decentrato" },
  { value: "occhio-centrale", label: "Occhio centrale" },
  { value: "occhio-zancato", label: "Occhio zancato" },
] as const;

export const BANDELLE_DRITTE_CON_SORMONTO_VARIANTS = [
  { value: "lunghezza-sormonto", label: "Variazione della lunghezza del sormonto" },
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
  { value: "posizione-occhio", label: "Variazione della posizione dell'occhio (decentratura a misura)" },
] as const;

// Tipologie e varianti delle dritte zancate, definite da Matteo il 24/10/2026.
export const BANDELLE_DRITTE_ZANCATE_TYPOLOGIES = [
  { value: "zanca-filo-legno", label: "Zanca a filo LEGNO" },
  { value: "zanca-90-legno", label: "Zanca a 90° LEGNO" },
  { value: "zanca-filo-pvc", label: "Zanca a filo PVC" },
  { value: "zanca-90-pvc", label: "Zanca a 90° PVC" },
] as const;

export const BANDELLE_DRITTE_ZANCATE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
  { value: "applicazione-sormonto", label: "Applicazione del sormonto" },
  { value: "variazione-zanca", label: "Variazione della zanca (max 60 mm)" },
] as const;

// Tipologie e varianti delle vicentine dritte, definite da Matteo il 24/10/2026.
export const BANDELLE_VICENTINE_DRITTE_TYPOLOGIES = [
  { value: "dritte-legno", label: "Dritte LEGNO" },
  { value: "dritte-pvc", label: "Dritte PVC" },
  { value: "dritte-sormonto-pvc-alluminio", label: "Dritte con sormonto PVC/Alluminio" },
] as const;

export const BANDELLE_VICENTINE_DRITTE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
  { value: "applicazione-sormonto", label: "Applicazione del sormonto" },
] as const;

// Tipologie e varianti delle vicentine doppie, definite da Matteo il 24/10/2026.
export const BANDELLE_VICENTINE_DOPPIE_TYPOLOGIES = [
  { value: "normale", label: "Normale" },
  { value: "zancate", label: "Zancate" },
  { value: "sormonto", label: "Sormonto" },
  { value: "zancate-con-sormonto", label: "Zancate con sormonto" },
  { value: "per-pvc", label: "Per PVC" },
] as const;

export const BANDELLE_VICENTINE_DOPPIE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
  { value: "applicazione-sormonto", label: "Applicazione del sormonto" },
  { value: "zanca-centrale", label: "Applicazione di una zanca centrale" },
] as const;

// Tipologie e varianti delle snodate, definite da Matteo il 24/10/2026.
export const BANDELLE_SNODATE_TYPOLOGIES = [
  { value: "mestrina-legno", label: "Mestrina Legno" },
  { value: "padovana-legno", label: "Padovana Legno" },
  { value: "mestrina-pvc", label: "Mestrina PVC" },
  { value: "padovana-pvc", label: "Padovana PVC" },
] as const;

export const BANDELLE_SNODATE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "posizione-fori-vite", label: "Variazione della posizione dei fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
] as const;

// Tipologie e varianti delle snodate zancate, definite da Matteo il 24/10/2026.
export const BANDELLE_SNODATE_ZANCATE_TYPOLOGIES = [
  { value: "mestrina-zancata-legno", label: "Mestrina Legno" },
  { value: "mestrina-zancata-pvc", label: "Mestrina PVC" },
] as const;

export const BANDELLE_SNODATE_ZANCATE_VARIANTS = [
  { value: "numero-fori-vite", label: "Variazione del numero di fori vite" },
  { value: "lunghezza-totale", label: "Lunghezza totale" },
  { value: "applicazione-sormonto", label: "Applicazione di un sormonto" },
  { value: "variazione-zanca-filo", label: "Variazione zanca a filo (max 30 mm, solo versione Mestrina)" },
] as const;

export type BandellaVenetaTypology = BandellaDrittaTypology
  | (typeof BANDELLE_DRITTE_CON_SORMONTO_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_DRITTE_ZANCATE_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_VICENTINE_DRITTE_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_VICENTINE_DOPPIE_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_SNODATE_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_SNODATE_ZANCATE_TYPOLOGIES)[number]["value"];

type BandellaVenetaPriceRow = {
  screwHoles: number;
  shoulderHoles?: number;
  tipHoles?: number;
  prices: readonly [number, number, number, number, number, number, number];
};

type BandellaVenetaConfiguration = {
  typologies: readonly { value: BandellaVenetaTypology; label: string }[];
  variants: readonly { value: string; label: string }[];
  prices?: readonly BandellaVenetaPriceRow[];
  supplements?: {
    weldedEyes: number;
    extraThicknessStepMm: number;
    extraThicknessPerStep: number;
    reinforcement: number;
    nonStandardDiameter: number;
  };
};

export const BANDELLE_VENETA_LOT_TIERS = [
  { min: 4, max: 10, label: "4–10" },
  { min: 11, max: 20, label: "11–20" },
  { min: 21, max: 30, label: "21–30" },
  { min: 31, max: 40, label: "31–40" },
  { min: 41, max: 60, label: "41–60" },
  { min: 61, max: 80, label: "61–80" },
  { min: 81, max: 100, label: "81–100" },
] as const;

/**
 * Prezzi di vendita unitari in euro dalla tabella fornita da Matteo il 24/10/2026,
 * verificata anche sull'immagine allegata "image(8).png".
 * Ambito: bandelle dritte, nelle tre tipologie definite sopra.
 * Le colonne seguono BANDELLE_VENETA_LOT_TIERS; si usa il valore esatto della
 * tabella, senza interpolazioni o correzioni per rendere i prezzi crescenti.
 * Per 1–3 pezzi si usa il prezzo unitario della fascia 4–10, come richiesto.
 * I prezzi per 4–7 fori e per lotti oltre 100 pezzi non sono stati forniti.
 */
export const BANDELLE_DRITTE_PRICES = [
  { screwHoles: 2, prices: [10.03, 7.45, 6.27, 5.54, 4.18, 4.08, 3.24] },
  { screwHoles: 3, prices: [10.33, 7.68, 6.46, 5.71, 4.31, 4.20, 3.33] },
  { screwHoles: 8, prices: [13.87, 7.42, 5.13, 4.82, 4.44, 4.09, 3.99] },
  { screwHoles: 9, prices: [13.91, 7.46, 5.16, 4.85, 4.47, 4.12, 4.02] },
  { screwHoles: 10, prices: [14.03, 7.56, 5.27, 4.95, 4.58, 4.22, 4.13] },
  { screwHoles: 11, prices: [14.15, 7.68, 5.37, 5.06, 4.67, 4.32, 4.23] },
  { screwHoles: 12, prices: [14.27, 7.79, 5.47, 5.16, 4.78, 4.42, 4.33] },
  { screwHoles: 13, prices: [14.70, 8.03, 5.63, 5.31, 4.92, 4.56, 4.46] },
  { screwHoles: 14, prices: [15.13, 8.26, 5.80, 5.48, 5.07, 4.69, 4.60] },
  { screwHoles: 15, prices: [15.60, 8.51, 5.98, 5.63, 5.21, 4.83, 4.73] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino dedicato alle bandelle dritte con sormonto, immagine "image(9).png"
 * fornita da Matteo il 24/10/2026. Prezzi unitari in euro per 3–12 fori vite.
 * Le sette colonne seguono BANDELLE_VENETA_LOT_TIERS. Si riportano gli importi
 * esatti dell'immagine, senza aggiungere un ulteriore supplemento per il sormonto.
 */
export const BANDELLE_DRITTE_CON_SORMONTO_PRICES = [
  { screwHoles: 3, prices: [13.05, 7.87, 7.21, 6.37, 4.81, 4.69, 3.73] },
  { screwHoles: 4, prices: [13.40, 8.30, 7.43, 6.57, 4.96, 4.83, 3.83] },
  { screwHoles: 5, prices: [13.93, 8.90, 5.90, 5.54, 5.11, 4.70, 4.59] },
  { screwHoles: 6, prices: [14.12, 9.12, 5.93, 5.58, 5.14, 4.74, 4.62] },
  { screwHoles: 7, prices: [15.10, 10.26, 6.06, 5.69, 5.27, 4.85, 4.75] },
  { screwHoles: 8, prices: [15.25, 10.42, 6.18, 5.82, 5.37, 4.97, 4.86] },
  { screwHoles: 9, prices: [15.37, 10.57, 6.29, 5.93, 5.50, 5.08, 4.98] },
  { screwHoles: 10, prices: [15.50, 10.71, 6.47, 6.11, 5.66, 5.24, 5.13] },
  { screwHoles: 11, prices: [16.13, 11.41, 6.67, 6.30, 5.83, 5.39, 5.29] },
  { screwHoles: 12, prices: [16.25, 11.59, 6.88, 6.47, 5.99, 5.55, 5.44] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino dedicato alle bandelle dritte zancate, immagine "image(10).png"
 * fornita da Matteo il 24/10/2026. Prezzi unitari in euro per 5–15 fori vite.
 * Le sette colonne seguono BANDELLE_VENETA_LOT_TIERS. Si usano i valori esatti
 * della tabella, anche quando non crescono con il numero di fori.
 */
export const BANDELLE_DRITTE_ZANCATE_PRICES = [
  { screwHoles: 5, prices: [13.57, 7.48, 6.63, 5.86, 4.43, 4.31, 3.43] },
  { screwHoles: 6, prices: [14.05, 7.77, 6.84, 6.04, 4.56, 4.44, 3.52] },
  { screwHoles: 7, prices: [14.30, 8.21, 5.43, 5.10, 4.70, 4.32, 4.22] },
  { screwHoles: 8, prices: [14.86, 8.77, 5.46, 5.13, 4.73, 4.36, 4.25] },
  { screwHoles: 9, prices: [15.50, 9.41, 5.58, 5.23, 4.85, 4.46, 4.37] },
  { screwHoles: 10, prices: [15.75, 9.66, 5.69, 5.35, 4.94, 4.57, 4.47] },
  { screwHoles: 11, prices: [16.84, 10.33, 5.79, 5.46, 5.06, 4.67, 4.58] },
  { screwHoles: 12, prices: [18.03, 11.06, 5.95, 5.62, 5.21, 4.82, 4.72] },
  { screwHoles: 13, prices: [19.29, 11.83, 6.14, 5.80, 5.36, 4.96, 4.87] },
  { screwHoles: 14, prices: [20.64, 12.66, 6.33, 5.95, 5.51, 5.11, 5.00] },
  { screwHoles: 15, prices: [22.08, 13.54, 6.79, 6.20, 5.80, 5.30, 4.89] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino delle bandelle vicentine dritte, immagine "image(20261024-071349).png"
 * fornita da Matteo il 24/10/2026. Prezzi unitari in euro per 2–5 fori vite.
 * Le sette colonne seguono BANDELLE_VENETA_LOT_TIERS. Non si aggiunge un
 * supplemento per il sormonto alla tipologia che lo prevede.
 */
export const BANDELLE_VICENTINE_DRITTE_PRICES = [
  { screwHoles: 2, prices: [13.73, 6.91, 3.97, 3.03, 2.65, 2.42, 2.22] },
  { screwHoles: 3, prices: [13.79, 6.97, 4.01, 3.07, 2.70, 2.47, 2.25] },
  { screwHoles: 4, prices: [13.93, 7.10, 4.12, 3.17, 2.79, 2.56, 2.35] },
  { screwHoles: 5, prices: [14.55, 7.71, 4.63, 3.62, 3.23, 3.01, 2.79] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino delle bandelle vicentine doppie dall'immagine
 * "image(20261024-072132).png", fornita da Matteo il 24/10/2026.
 * I fori indicati 2+2, 3+3, ..., 6+6 sono memorizzati come totale 4, 6, ..., 12.
 * Le sette colonne seguono BANDELLE_VENETA_LOT_TIERS. Per un totale dispari
 * compreso tra due righe si usa la media dei prezzi della fascia corrispondente.
 * Il minimo ammesso è 2+2: ogni metà ha da 2 a 6 fori vite.
 */
export const BANDELLE_VICENTINE_DOPPIE_PRICES = [
  { screwHoles: 4, prices: [13.64, 7.67, 5.54, 5.06, 4.66, 4.25, 3.93] },
  { screwHoles: 6, prices: [13.79, 7.84, 5.71, 5.23, 4.83, 4.41, 4.09] },
  { screwHoles: 8, prices: [14.00, 8.04, 5.90, 5.42, 5.03, 4.62, 4.29] },
  { screwHoles: 10, prices: [14.18, 8.21, 6.08, 5.60, 5.20, 4.80, 4.47] },
  { screwHoles: 12, prices: [14.38, 8.42, 6.29, 5.81, 5.40, 5.00, 4.67] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino delle bandelle snodate dall'immagine "image(20261024-073706).png"
 * fornita da Matteo il 24/10/2026. La riga è identificata dalla coppia
 * spalla+punta, non dal solo totale dei fori. Le colonne seguono le sette
 * BANDELLE_VENETA_LOT_TIERS. Si rispettano anche le anomalie del listino:
 * per esempio 5+4 ha un prezzo inferiore a 4+4 in alcune fasce.
 */
export const BANDELLE_SNODATE_PRICES = [
  { shoulderHoles: 2, tipHoles: 2, screwHoles: 4, prices: [11.78, 6.55, 5.13, 4.63, 4.22, 3.98, 3.90] },
  { shoulderHoles: 3, tipHoles: 2, screwHoles: 5, prices: [10.19, 6.60, 5.18, 4.67, 4.27, 4.02, 3.94] },
  { shoulderHoles: 4, tipHoles: 2, screwHoles: 6, prices: [9.20, 6.71, 5.29, 4.78, 4.38, 4.13, 4.04] },
  { shoulderHoles: 5, tipHoles: 2, screwHoles: 7, prices: [8.49, 6.77, 5.35, 4.85, 4.45, 4.20, 4.12] },
  { shoulderHoles: 2, tipHoles: 3, screwHoles: 5, prices: [11.88, 6.66, 5.24, 4.72, 4.33, 4.08, 3.99] },
  { shoulderHoles: 3, tipHoles: 3, screwHoles: 6, prices: [11.92, 6.70, 5.28, 4.78, 4.37, 4.13, 4.04] },
  { shoulderHoles: 4, tipHoles: 3, screwHoles: 7, prices: [12.03, 6.80, 5.38, 4.88, 4.47, 4.23, 4.15] },
  { shoulderHoles: 5, tipHoles: 3, screwHoles: 8, prices: [12.10, 6.88, 5.45, 4.95, 4.55, 4.29, 4.22] },
  { shoulderHoles: 2, tipHoles: 4, screwHoles: 6, prices: [12.57, 7.35, 5.93, 5.41, 5.02, 4.77, 4.69] },
  { shoulderHoles: 3, tipHoles: 4, screwHoles: 7, prices: [12.61, 7.39, 5.97, 5.47, 5.06, 4.82, 4.73] },
  { shoulderHoles: 4, tipHoles: 4, screwHoles: 8, prices: [12.72, 7.49, 6.07, 5.57, 5.16, 4.92, 4.84] },
  { shoulderHoles: 5, tipHoles: 4, screwHoles: 9, prices: [12.01, 6.77, 5.35, 4.85, 4.45, 4.20, 4.12] },
  { shoulderHoles: 2, tipHoles: 5, screwHoles: 7, prices: [12.65, 7.43, 6.01, 5.51, 5.10, 4.86, 4.78] },
  { shoulderHoles: 3, tipHoles: 5, screwHoles: 8, prices: [12.71, 7.48, 6.05, 5.55, 5.15, 4.90, 4.82] },
  { shoulderHoles: 4, tipHoles: 5, screwHoles: 9, prices: [12.81, 7.59, 6.17, 5.65, 5.26, 5.01, 4.92] },
  { shoulderHoles: 5, tipHoles: 5, screwHoles: 10, prices: [12.87, 7.65, 6.23, 5.73, 5.32, 5.08, 5.00] },
  { shoulderHoles: 2, tipHoles: 6, screwHoles: 8, prices: [12.74, 7.51, 6.09, 5.59, 5.18, 4.92, 4.86] },
  { shoulderHoles: 3, tipHoles: 6, screwHoles: 9, prices: [12.78, 7.56, 6.13, 5.63, 5.22, 4.96, 4.90] },
  { shoulderHoles: 4, tipHoles: 6, screwHoles: 10, prices: [12.88, 7.66, 6.24, 5.74, 5.33, 5.07, 5.01] },
  { shoulderHoles: 5, tipHoles: 6, screwHoles: 11, prices: [12.96, 7.73, 6.31, 5.81, 5.40, 5.14, 5.08] },
  { shoulderHoles: 2, tipHoles: 7, screwHoles: 9, prices: [13.07, 7.85, 6.43, 5.93, 5.52, 5.28, 5.19] },
  { shoulderHoles: 3, tipHoles: 7, screwHoles: 10, prices: [12.83, 7.61, 6.19, 5.67, 5.28, 5.03, 4.94] },
  { shoulderHoles: 4, tipHoles: 7, screwHoles: 11, prices: [12.98, 7.75, 6.33, 5.83, 5.42, 5.18, 5.10] },
  { shoulderHoles: 5, tipHoles: 7, screwHoles: 12, prices: [13.05, 7.83, 6.41, 5.90, 5.50, 5.26, 5.17] },
  { shoulderHoles: 2, tipHoles: 8, screwHoles: 10, prices: [12.93, 7.70, 6.28, 5.77, 5.37, 5.12, 5.04] },
  { shoulderHoles: 3, tipHoles: 8, screwHoles: 11, prices: [12.97, 7.74, 6.32, 5.82, 5.41, 5.17, 5.09] },
  { shoulderHoles: 4, tipHoles: 8, screwHoles: 12, prices: [13.07, 7.85, 6.43, 5.93, 5.52, 5.28, 5.19] },
  { shoulderHoles: 5, tipHoles: 8, screwHoles: 13, prices: [13.15, 7.92, 6.50, 6.00, 5.59, 5.34, 5.27] },
  { shoulderHoles: 2, tipHoles: 9, screwHoles: 11, prices: [13.00, 7.77, 6.35, 5.85, 5.44, 5.19, 5.12] },
  { shoulderHoles: 3, tipHoles: 9, screwHoles: 12, prices: [13.05, 7.82, 6.40, 5.89, 5.50, 5.25, 5.16] },
  { shoulderHoles: 4, tipHoles: 9, screwHoles: 13, prices: [13.16, 7.92, 6.50, 6.00, 5.60, 5.35, 5.27] },
  { shoulderHoles: 5, tipHoles: 9, screwHoles: 14, prices: [13.22, 7.99, 6.57, 6.07, 5.66, 5.42, 5.34] },
  { shoulderHoles: 2, tipHoles: 10, screwHoles: 12, prices: [14.19, 8.97, 7.54, 7.03, 6.64, 6.38, 6.30] },
  { shoulderHoles: 3, tipHoles: 10, screwHoles: 13, prices: [14.23, 9.01, 7.59, 7.09, 6.68, 6.44, 6.35] },
  { shoulderHoles: 4, tipHoles: 10, screwHoles: 14, prices: [14.34, 9.11, 7.69, 7.19, 6.78, 6.54, 6.46] },
  { shoulderHoles: 5, tipHoles: 10, screwHoles: 15, prices: [14.41, 9.19, 7.76, 7.26, 6.86, 6.61, 6.53] },
  { shoulderHoles: 2, tipHoles: 11, screwHoles: 13, prices: [14.29, 9.06, 7.64, 7.13, 6.73, 6.48, 6.40] },
  { shoulderHoles: 3, tipHoles: 11, screwHoles: 14, prices: [14.33, 9.10, 7.68, 7.18, 6.77, 6.53, 6.45] },
  { shoulderHoles: 4, tipHoles: 11, screwHoles: 15, prices: [14.43, 9.21, 7.79, 7.28, 6.88, 6.64, 6.55] },
  { shoulderHoles: 5, tipHoles: 11, screwHoles: 16, prices: [14.50, 9.28, 7.86, 7.36, 6.95, 6.70, 6.63] },
  { shoulderHoles: 2, tipHoles: 12, screwHoles: 14, prices: [14.37, 9.14, 7.71, 7.21, 6.81, 6.56, 6.48] },
  { shoulderHoles: 3, tipHoles: 12, screwHoles: 15, prices: [14.41, 9.19, 7.76, 7.26, 6.86, 6.61, 6.53] },
  { shoulderHoles: 4, tipHoles: 12, screwHoles: 16, prices: [14.52, 9.29, 7.87, 7.37, 6.96, 6.72, 6.64] },
  { shoulderHoles: 5, tipHoles: 12, screwHoles: 17, prices: [14.59, 9.36, 7.94, 7.43, 7.03, 6.78, 6.70] },
] as const satisfies readonly BandellaVenetaPriceRow[];

/**
 * Listino delle snodate zancate dall'immagine "image(20261024-074709).png".
 * Ogni riga è una coppia esatta spalla+punta; le cinque coppie aggiuntive
 * 6+5, 7+5, 7+6, 8+6 e 8+7 sono presenti nel listino. Le colonne sono le
 * sette fasce di BANDELLE_VENETA_LOT_TIERS. Conserviamo i valori originali,
 * compresi quelli non monotoni, senza interpolare coppie non presenti.
 * Per 1–3 pezzi si usa il prezzo unitario della fascia 4–10.
 */
export const BANDELLE_SNODATE_ZANCATE_PRICES = [
  { shoulderHoles: 2, tipHoles: 2, screwHoles: 4, prices: [15.43, 7.88, 5.83, 5.10, 4.51, 4.16, 4.04] },
  { shoulderHoles: 3, tipHoles: 2, screwHoles: 5, prices: [13.10, 7.93, 5.87, 5.14, 4.57, 4.21, 4.09] },
  { shoulderHoles: 4, tipHoles: 2, screwHoles: 6, prices: [11.63, 8.04, 5.98, 5.25, 4.67, 4.32, 4.19] },
  { shoulderHoles: 5, tipHoles: 2, screwHoles: 7, prices: [15.65, 8.10, 6.05, 5.32, 4.73, 4.38, 4.26] },
  { shoulderHoles: 2, tipHoles: 3, screwHoles: 5, prices: [15.53, 7.98, 5.93, 5.19, 4.62, 4.26, 4.14] },
  { shoulderHoles: 3, tipHoles: 3, screwHoles: 6, prices: [15.58, 8.03, 5.98, 5.25, 4.66, 4.31, 4.19] },
  { shoulderHoles: 4, tipHoles: 3, screwHoles: 7, prices: [15.69, 8.13, 6.08, 5.35, 4.77, 4.41, 4.29] },
  { shoulderHoles: 5, tipHoles: 3, screwHoles: 8, prices: [15.75, 8.20, 6.14, 5.42, 4.84, 4.48, 4.37] },
  { shoulderHoles: 2, tipHoles: 4, screwHoles: 6, prices: [16.22, 8.67, 6.61, 5.89, 5.31, 4.95, 4.84] },
  { shoulderHoles: 3, tipHoles: 4, screwHoles: 7, prices: [16.27, 8.72, 6.67, 5.94, 5.35, 5.00, 4.88] },
  { shoulderHoles: 4, tipHoles: 4, screwHoles: 8, prices: [16.38, 8.82, 6.77, 6.04, 5.45, 5.10, 4.98] },
  { shoulderHoles: 5, tipHoles: 4, screwHoles: 9, prices: [15.84, 8.30, 6.24, 5.52, 4.93, 4.58, 4.46] },
  { shoulderHoles: 2, tipHoles: 5, screwHoles: 7, prices: [16.30, 8.76, 6.71, 5.98, 5.39, 5.04, 4.92] },
  { shoulderHoles: 3, tipHoles: 5, screwHoles: 8, prices: [16.35, 8.81, 6.75, 6.02, 5.44, 5.09, 4.96] },
  { shoulderHoles: 4, tipHoles: 5, screwHoles: 9, prices: [16.46, 8.91, 6.86, 6.12, 5.55, 5.19, 5.07] },
  { shoulderHoles: 5, tipHoles: 5, screwHoles: 10, prices: [16.53, 8.98, 6.93, 6.20, 5.61, 5.26, 5.14] },
  { shoulderHoles: 6, tipHoles: 5, screwHoles: 11, prices: [17.36, 9.43, 7.27, 6.51, 5.89, 5.52, 5.40] },
  { shoulderHoles: 7, tipHoles: 5, screwHoles: 12, prices: [18.22, 9.90, 7.64, 6.83, 6.19, 5.80, 5.66] },
  { shoulderHoles: 7, tipHoles: 6, screwHoles: 13, prices: [19.13, 10.40, 8.02, 7.17, 6.50, 6.09, 5.95] },
  { shoulderHoles: 8, tipHoles: 6, screwHoles: 14, prices: [20.08, 10.91, 8.42, 7.53, 6.82, 6.40, 6.25] },
  { shoulderHoles: 8, tipHoles: 7, screwHoles: 15, prices: [21.10, 11.46, 8.84, 7.91, 7.17, 6.71, 6.56] },
  { shoulderHoles: 2, tipHoles: 6, screwHoles: 8, prices: [16.39, 8.84, 6.78, 6.06, 5.48, 5.10, 5.01] },
  { shoulderHoles: 3, tipHoles: 6, screwHoles: 9, prices: [16.44, 8.88, 6.83, 6.10, 5.52, 5.14, 5.05] },
  { shoulderHoles: 4, tipHoles: 6, screwHoles: 10, prices: [16.54, 8.99, 6.94, 6.21, 5.62, 5.25, 5.15] },
  { shoulderHoles: 5, tipHoles: 6, screwHoles: 11, prices: [16.61, 9.06, 7.01, 6.28, 5.70, 5.32, 5.23] },
  { shoulderHoles: 2, tipHoles: 7, screwHoles: 9, prices: [16.48, 8.93, 6.88, 6.16, 5.57, 5.21, 5.09] },
  { shoulderHoles: 3, tipHoles: 7, screwHoles: 10, prices: [16.53, 8.98, 6.93, 6.20, 5.61, 5.26, 5.14] },
  { shoulderHoles: 4, tipHoles: 7, screwHoles: 11, prices: [16.64, 9.08, 7.03, 6.30, 5.72, 5.36, 5.25] },
  { shoulderHoles: 5, tipHoles: 7, screwHoles: 12, prices: [16.70, 9.15, 7.10, 6.37, 5.79, 5.43, 5.32] },
  { shoulderHoles: 2, tipHoles: 8, screwHoles: 10, prices: [16.57, 9.03, 6.97, 5.25, 5.66, 5.31, 5.18] },
  { shoulderHoles: 3, tipHoles: 8, screwHoles: 11, prices: [16.63, 9.07, 7.02, 6.29, 5.71, 5.35, 5.24] },
  { shoulderHoles: 4, tipHoles: 8, screwHoles: 12, prices: [16.73, 9.18, 7.13, 6.40, 5.81, 5.45, 5.34] },
  { shoulderHoles: 5, tipHoles: 8, screwHoles: 13, prices: [16.79, 9.25, 7.19, 6.47, 5.88, 5.53, 5.41] },
  { shoulderHoles: 2, tipHoles: 9, screwHoles: 11, prices: [16.65, 9.10, 7.04, 5.32, 5.74, 5.38, 5.27] },
  { shoulderHoles: 3, tipHoles: 9, screwHoles: 12, prices: [16.70, 9.14, 7.10, 6.36, 5.78, 5.42, 5.31] },
  { shoulderHoles: 4, tipHoles: 9, screwHoles: 13, prices: [16.80, 9.25, 7.20, 6.47, 5.88, 5.53, 5.41] },
  { shoulderHoles: 5, tipHoles: 9, screwHoles: 14, prices: [16.87, 9.32, 7.27, 6.54, 5.96, 5.60, 5.49] },
  { shoulderHoles: 2, tipHoles: 10, screwHoles: 12, prices: [17.84, 10.29, 8.23, 6.51, 6.93, 6.57, 6.45] },
  { shoulderHoles: 3, tipHoles: 10, screwHoles: 13, prices: [17.89, 10.34, 8.29, 7.56, 6.97, 6.61, 6.50] },
  { shoulderHoles: 4, tipHoles: 10, screwHoles: 14, prices: [17.99, 10.44, 8.39, 7.66, 7.07, 6.72, 6.60] },
  { shoulderHoles: 5, tipHoles: 10, screwHoles: 15, prices: [18.06, 10.51, 8.45, 7.73, 7.15, 6.79, 6.68] },
  { shoulderHoles: 2, tipHoles: 11, screwHoles: 13, prices: [17.93, 10.39, 8.33, 6.60, 7.02, 6.67, 6.54] },
  { shoulderHoles: 3, tipHoles: 11, screwHoles: 14, prices: [17.98, 10.43, 8.38, 7.65, 7.06, 6.71, 6.59] },
  { shoulderHoles: 4, tipHoles: 11, screwHoles: 15, prices: [18.09, 10.53, 8.49, 7.75, 7.17, 6.81, 6.70] },
  { shoulderHoles: 5, tipHoles: 11, screwHoles: 16, prices: [18.15, 10.61, 8.55, 7.83, 7.24, 6.89, 6.77] },
  { shoulderHoles: 2, tipHoles: 12, screwHoles: 14, prices: [18.02, 10.47, 8.41, 6.69, 7.11, 6.75, 6.63] },
  { shoulderHoles: 3, tipHoles: 12, screwHoles: 15, prices: [18.06, 10.51, 8.45, 7.73, 7.15, 6.79, 6.68] },
  { shoulderHoles: 4, tipHoles: 12, screwHoles: 16, prices: [18.16, 10.62, 8.56, 7.84, 7.25, 6.90, 6.78] },
  { shoulderHoles: 5, tipHoles: 12, screwHoles: 17, prices: [18.24, 10.69, 8.63, 7.91, 7.33, 6.97, 6.84] },
] as const satisfies readonly BandellaVenetaPriceRow[];

export const BANDELLE_DRITTE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle dritte con sormonto.
export const BANDELLE_DRITTE_CON_SORMONTO_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle dritte zancate.
export const BANDELLE_DRITTE_ZANCATE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle vicentine dritte.
export const BANDELLE_VICENTINE_DRITTE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle vicentine doppie.
export const BANDELLE_VICENTINE_DOPPIE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle snodate.
export const BANDELLE_SNODATE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

// Supplementi confermati separatamente per le bandelle snodate zancate.
export const BANDELLE_SNODATE_ZANCATE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

export const BANDELLE_VENETA_CONFIGURATIONS: Partial<Record<BandellaVenetaType, BandellaVenetaConfiguration>> = {
  dritte: {
    typologies: BANDELLE_DRITTE_TYPOLOGIES,
    variants: BANDELLE_DRITTE_VARIANTS,
    prices: BANDELLE_DRITTE_PRICES,
    supplements: BANDELLE_DRITTE_SUPPLEMENTS,
  },
  "dritte-con-sormonto": {
    typologies: BANDELLE_DRITTE_CON_SORMONTO_TYPOLOGIES,
    variants: BANDELLE_DRITTE_CON_SORMONTO_VARIANTS,
    prices: BANDELLE_DRITTE_CON_SORMONTO_PRICES,
    supplements: BANDELLE_DRITTE_CON_SORMONTO_SUPPLEMENTS,
  },
  "dritte-zancate": {
    typologies: BANDELLE_DRITTE_ZANCATE_TYPOLOGIES,
    variants: BANDELLE_DRITTE_ZANCATE_VARIANTS,
    prices: BANDELLE_DRITTE_ZANCATE_PRICES,
    supplements: BANDELLE_DRITTE_ZANCATE_SUPPLEMENTS,
  },
  "vicentine-dritte": {
    typologies: BANDELLE_VICENTINE_DRITTE_TYPOLOGIES,
    variants: BANDELLE_VICENTINE_DRITTE_VARIANTS,
    prices: BANDELLE_VICENTINE_DRITTE_PRICES,
    supplements: BANDELLE_VICENTINE_DRITTE_SUPPLEMENTS,
  },
  "vicentine-doppie": {
    typologies: BANDELLE_VICENTINE_DOPPIE_TYPOLOGIES,
    variants: BANDELLE_VICENTINE_DOPPIE_VARIANTS,
    prices: BANDELLE_VICENTINE_DOPPIE_PRICES,
    supplements: BANDELLE_VICENTINE_DOPPIE_SUPPLEMENTS,
  },
  snodate: {
    typologies: BANDELLE_SNODATE_TYPOLOGIES,
    variants: BANDELLE_SNODATE_VARIANTS,
    prices: BANDELLE_SNODATE_PRICES,
    supplements: BANDELLE_SNODATE_SUPPLEMENTS,
  },
  "snodate-zancate": {
    typologies: BANDELLE_SNODATE_ZANCATE_TYPOLOGIES,
    variants: BANDELLE_SNODATE_ZANCATE_VARIANTS,
    prices: BANDELLE_SNODATE_ZANCATE_PRICES,
    supplements: BANDELLE_SNODATE_ZANCATE_SUPPLEMENTS,
  },
};

export type BandellaVenetaRequest = {
  kind: BandellaVenetaType;
  typology: string;
  screwHoles: number;
  holesFirst?: number;
  holesSecond?: number;
  shoulderHoles?: number;
  tipHoles?: number;
  quantity: number;
  weldedEyes?: boolean;
  extraThicknessMm?: number;
  reinforcement?: boolean;
  nonStandardDiameter?: boolean;
};

export type BandellaVenetaQuote = {
  typology: BandellaVenetaTypology;
  screwHoles: number;
  holePair?: readonly [number, number];
  interpolatedFrom?: readonly [number, number];
  quantity: number;
  tier: string;
  minimumTierApplied: boolean;
  base: number;
  additions: { description: string; euro: number }[];
  supplements: number;
  unit: number;
  total: number;
};

export function quoteBandellaVeneta(request: BandellaVenetaRequest): BandellaVenetaQuote {
  const configuration = BANDELLE_VENETA_CONFIGURATIONS[request.kind];
  if (!configuration?.prices || !configuration.supplements) {
    throw new Error("Il listino per questo tipo di bandella non è ancora definito.");
  }
  const supplementRates = configuration.supplements;
  const typology = configuration.typologies.find((option) => option.value === request.typology);
  if (!typology) {
    throw new Error("Seleziona una delle tipologie ammesse per il tipo di bandella scelto.");
  }
  if (!Number.isInteger(request.quantity) || request.quantity < 1 || request.quantity > 100) {
    throw new Error("Inserisci una quantità intera da 1 a 100 pezzi. Per lotti oltre 100 pezzi il prezzo è da definire.");
  }
  const isDouble = request.kind === "vicentine-doppie";
  const isJointed = request.kind === "snodate" || request.kind === "snodate-zancate";
  let holePair: BandellaVenetaQuote["holePair"];
  if (isDouble) {
    const { holesFirst, holesSecond } = request;
    if (typeof holesFirst !== "number" || typeof holesSecond !== "number"
      || !Number.isInteger(holesFirst) || !Number.isInteger(holesSecond)
      || holesFirst < 2 || holesFirst > 6 || holesSecond < 2 || holesSecond > 6
      || holesFirst + holesSecond !== request.screwHoles) {
      throw new Error("Indica i fori delle due metà, da 2 a 6 per lato; il totale deve essere la loro somma.");
    }
    holePair = [holesFirst, holesSecond];
  }
  if (isJointed) {
    const { shoulderHoles, tipHoles } = request;
    if (typeof shoulderHoles !== "number" || typeof tipHoles !== "number"
      || !Number.isInteger(shoulderHoles) || !Number.isInteger(tipHoles)
      || (request.kind === "snodate" && (shoulderHoles < 2 || shoulderHoles > 5 || tipHoles < 2 || tipHoles > 12))
      || shoulderHoles + tipHoles !== request.screwHoles) {
      throw new Error(request.kind === "snodate"
        ? "Indica i fori della spalla da 2 a 5 e della punta da 2 a 12; il totale deve essere la loro somma."
        : "Indica i fori della spalla e della punta; il totale deve essere la loro somma.");
    }
    holePair = [shoulderHoles, tipHoles];
  }
  const row = configuration.prices.find((price) => isJointed
    ? price.shoulderHoles === request.shoulderHoles && price.tipHoles === request.tipHoles
    : price.screwHoles === request.screwHoles);
  let interpolatedFrom: BandellaVenetaQuote["interpolatedFrom"];
  let lowerRow: BandellaVenetaPriceRow | undefined;
  let upperRow: BandellaVenetaPriceRow | undefined;
  if (!row && isDouble && request.screwHoles > 4 && request.screwHoles < 12 && request.screwHoles % 2 === 1) {
    lowerRow = configuration.prices.find((price) => price.screwHoles === request.screwHoles - 1);
    upperRow = configuration.prices.find((price) => price.screwHoles === request.screwHoles + 1);
    if (lowerRow && upperRow) interpolatedFrom = [lowerRow.screwHoles, upperRow.screwHoles];
  }
  if (!row && !interpolatedFrom) {
    throw new Error(isJointed
      ? "Il prezzo per questa coppia di fori spalla+punta non è ancora definito."
      : "Il prezzo per questo numero di fori vite non è ancora definito.");
  }
  const extraThicknessMm = request.extraThicknessMm ?? 0;
  const thicknessSteps = extraThicknessMm / supplementRates.extraThicknessStepMm;
  if (!Number.isSafeInteger(thicknessSteps) || thicknessSteps < 0) {
    throw new Error("L'aumento di spessore rispetto allo standard deve essere zero o un multiplo di 0,5 mm.");
  }
  const tierQuantity = Math.max(BANDELLE_VENETA_LOT_TIERS[0].min, request.quantity);
  const tierIndex = BANDELLE_VENETA_LOT_TIERS.findIndex(
    (tier) => tierQuantity >= tier.min && tierQuantity <= tier.max,
  );
  // La media può finire a mezzo centesimo: si arrotonda il prezzo unitario al centesimo superiore.
  const baseCents = row
    ? Math.round(row.prices[tierIndex] * 100)
    : Math.round((Math.round(lowerRow!.prices[tierIndex] * 100) + Math.round(upperRow!.prices[tierIndex] * 100)) / 2);
  const base = baseCents / 100;
  const additions: BandellaVenetaQuote["additions"] = [];
  if (request.weldedEyes) {
    additions.push({ description: "Occhi saldati", euro: supplementRates.weldedEyes });
  }
  if (thicknessSteps > 0) {
    additions.push({
      description: "Aumento spessore di " + extraThicknessMm.toLocaleString("it-IT") + " mm rispetto allo standard",
      euro: thicknessSteps * supplementRates.extraThicknessPerStep,
    });
  }
  if (request.reinforcement) {
    additions.push({ description: "Rinforzo", euro: supplementRates.reinforcement });
  }
  if (request.nonStandardDiameter) {
    additions.push({ description: "Diametro occhio diverso da Ø12 mm", euro: supplementRates.nonStandardDiameter });
  }
  // Il calcolo in centesimi evita residui decimali; si fattura la quantità effettiva.
  const supplementCents = additions.reduce((sum, addition) => sum + Math.round(addition.euro * 100), 0);
  const unitCents = baseCents + supplementCents;
  return {
    typology: typology.value,
    screwHoles: request.screwHoles,
    holePair,
    interpolatedFrom,
    quantity: request.quantity,
    tier: BANDELLE_VENETA_LOT_TIERS[tierIndex].label,
    minimumTierApplied: request.quantity < BANDELLE_VENETA_LOT_TIERS[0].min,
    base,
    additions,
    supplements: supplementCents / 100,
    unit: unitCents / 100,
    total: (unitCents * request.quantity) / 100,
  };
}
