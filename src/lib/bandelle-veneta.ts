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
] as const satisfies readonly {
  screwHoles: number;
  prices: readonly [number, number, number, number, number, number, number];
}[];

export const BANDELLE_DRITTE_SUPPLEMENTS = {
  weldedEyes: 1.50,
  extraThicknessStepMm: 0.5,
  extraThicknessPerStep: 1,
  reinforcement: 2,
  nonStandardDiameter: 2,
} as const;

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
  typology: BandellaDrittaTypology;
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
  if (request.kind !== "dritte") {
    throw new Error("Il listino per questo tipo di bandella non è ancora definito.");
  }
  const typology = BANDELLE_DRITTE_TYPOLOGIES.find((option) => option.value === request.typology);
  if (!typology) {
    throw new Error("Seleziona una delle tipologie ammesse per le bandelle dritte.");
  }
  if (!Number.isInteger(request.quantity) || request.quantity < 1 || request.quantity > 100) {
    throw new Error("Inserisci una quantità intera da 1 a 100 pezzi. Per lotti oltre 100 pezzi il prezzo è da definire.");
  }
  const row = BANDELLE_DRITTE_PRICES.find((price) => price.screwHoles === request.screwHoles);
  if (!row) {
    throw new Error("Il prezzo per questo numero di fori vite non è ancora definito.");
  }
  const extraThicknessMm = request.extraThicknessMm ?? 0;
  const thicknessSteps = extraThicknessMm / BANDELLE_DRITTE_SUPPLEMENTS.extraThicknessStepMm;
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
    additions.push({ description: "Occhi saldati", euro: BANDELLE_DRITTE_SUPPLEMENTS.weldedEyes });
  }
  if (thicknessSteps > 0) {
    additions.push({
      description: "Aumento spessore di " + extraThicknessMm.toLocaleString("it-IT") + " mm rispetto allo standard",
      euro: thicknessSteps * BANDELLE_DRITTE_SUPPLEMENTS.extraThicknessPerStep,
    });
  }
  if (request.reinforcement) {
    additions.push({ description: "Rinforzo", euro: BANDELLE_DRITTE_SUPPLEMENTS.reinforcement });
  }
  if (request.nonStandardDiameter) {
    additions.push({ description: "Diametro occhio diverso da Ø12 mm", euro: BANDELLE_DRITTE_SUPPLEMENTS.nonStandardDiameter });
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
