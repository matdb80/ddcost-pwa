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

export type BandellaVenetaTypology = BandellaDrittaTypology
  | (typeof BANDELLE_DRITTE_CON_SORMONTO_TYPOLOGIES)[number]["value"]
  | (typeof BANDELLE_DRITTE_ZANCATE_TYPOLOGIES)[number]["value"];

type BandellaVenetaPriceRow = {
  screwHoles: number;
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
};

export type BandellaVenetaRequest = {
  kind: BandellaVenetaType;
  typology: string;
  screwHoles: number;
  quantity: number;
  weldedEyes?: boolean;
  extraThicknessMm?: number;
  reinforcement?: boolean;
  nonStandardDiameter?: boolean;
};

export type BandellaVenetaQuote = {
  typology: BandellaVenetaTypology;
  screwHoles: number;
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
  const row = configuration.prices.find((price) => price.screwHoles === request.screwHoles);
  if (!row) {
    throw new Error("Il prezzo per questo numero di fori vite non è ancora definito.");
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
  const base = row.prices[tierIndex];
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
  const unitCents = Math.round(base * 100) + supplementCents;
  return {
    typology: typology.value,
    screwHoles: request.screwHoles,
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
