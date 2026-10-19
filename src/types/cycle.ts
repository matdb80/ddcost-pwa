/**
 * DDCost Ciclo Standard — TypeScript types matching Python app & DB schema
 *
 * DB fields: id, rootId, rev, userId, code, description, client, lot,
 *            standardCost / minimumPrice (decimal 30,18), dataJson (text)
 */

export type RigaCategoria =
  | "COMPONENTE"
  | "COMPONENTE/ASSIEME"
  | "LAVORAZIONE INTERNA"
  | "LAVORAZIONE A PESO"
  | "LAVORAZIONE A PEZZO"
  | "LAVORAZIONE TERZISTA A PESO"
  | "LAVORAZIONE TERZISTA A PEZZO"
  | "MATERIA PRIMA DA TRASFORMARE"
  | "SPESA ATTREZZATURA DEDICATA";

export const CATEGORIE_RIGA: RigaCategoria[] = [
  "COMPONENTE",
  "COMPONENTE/ASSIEME",
  "MATERIA PRIMA DA TRASFORMARE",
  "LAVORAZIONE INTERNA",
  "LAVORAZIONE A PESO",
  "LAVORAZIONE A PEZZO",
  "LAVORAZIONE TERZISTA A PESO",
  "LAVORAZIONE TERZISTA A PEZZO",
  "SPESA ATTREZZATURA DEDICATA",
];

export interface RigaCiclo {
  categoria: RigaCategoria;
  codice_articolo: string;
  descrizione: string;
  tipo_materiale: string;
  tipo_materia_prima: string;
  lunghezza: number;
  larghezza: number;
  spessore: number;
  diametro: number;
  peso_kg: number;
  nr_componenti: number;
  colpi_min: number;
  /** When true, internal work time is captured per package instead of pieces/min. */
  confezionamento?: boolean;
  /** Finished pieces in one package. */
  quantita_per_conf?: number;
  /** Direct labor time in minutes per package. */
  tempo_confezionamento_min?: number;
  lotto_voce: number;
  attrezzaggio_min: number;
  fornitore: string;
  costo_unitario: number;
  sfrido: number;
  costo_min: number;
  note: string;
  /** Index of parent row when this is a detail expansion */
  parent_idx?: number | null;
  /** New assemblies only: derive this row cost recursively from its components. Legacy parent_idx rows remain unchanged. */
  assembly_auto?: boolean;
  /** Whether this row contributes to cost (default true for most categories) */
  considera?: boolean | null;
}

export interface Breakdown {
  "COMPONENTE/ASSIEME": number;
  COMPONENTE: number;
  "MATERIA PRIMA DA TRASFORMARE": number;
  "LAVORAZIONE INTERNA": number;
  "LAVORAZIONE TERZISTA A PESO": number;
  "LAVORAZIONE A PESO": number;
  "LAVORAZIONE TERZISTA A PEZZO": number;
  "LAVORAZIONE A PEZZO": number;
  "SPESA ATTREZZATURA DEDICATA": number;
}

export interface SimulazioneLotto {
  lotto: number;
  breakdown: Breakdown;
  costo_standard: number;
  full_cost: number;
  prezzo_minimo: number;
  attrezzaggio_pz: number;
}

/** Shape stored inside dataJson (TEXT column) */
export interface CicloDataJson {
  tipo?: string;
  created_at?: string;
  codice?: string;
  descrizione?: string;
  cliente?: string;
  lotto?: string;
  ricarico_spese?: number;
  margine_minimo?: number;
  costo_lavoro_min?: number;
  righe?: RigaCiclo[];
  breakdown?: Breakdown;
  costo_standard?: number;
  full_cost?: number;
  prezzo_minimo?: number;
  simulazioni?: SimulazioneLotto[];
  note_generali?: string;
  origine_import_excel?: boolean;
  foglio_importato?: string;
  template_importazione?: string;
  root_id?: number;
  rev?: number;
  lotti_personalizzati?: number[];
  // Any extra fields from original import are preserved
  [key: string]: unknown;
}

/** Flattened cycle used by the editor (merged from DB row + parsed dataJson) */
export interface CicloEditorModel {
  id?: number;
  rootId?: number | null;
  rev?: number;
  codice: string;
  descrizione: string;
  cliente: string;
  lotto: string;
  ricarico_spese: number;
  margine_minimo: number;
  costo_lavoro_min: number;
  righe: RigaCiclo[];
  breakdown: Breakdown;
  costo_standard: number;
  full_cost: number;
  prezzo_minimo: number;
  simulazioni: SimulazioneLotto[];
  note_generali: string;
  lotti_personalizzati?: number[];
  // Preserve unknown fields for round-trip
  _extra: Record<string, unknown>;
}

export function emptyBreakdown(): Breakdown {
  return {
    "COMPONENTE/ASSIEME": 0,
    COMPONENTE: 0,
    "MATERIA PRIMA DA TRASFORMARE": 0,
    "LAVORAZIONE INTERNA": 0,
    "LAVORAZIONE TERZISTA A PESO": 0,
    "LAVORAZIONE A PESO": 0,
    "LAVORAZIONE TERZISTA A PEZZO": 0,
    "LAVORAZIONE A PEZZO": 0,
    "SPESA ATTREZZATURA DEDICATA": 0,
  };
}

export function emptyRiga(): RigaCiclo {
  return {
    categoria: "COMPONENTE",
    codice_articolo: "",
    descrizione: "",
    tipo_materiale: "",
    tipo_materia_prima: "",
    lunghezza: 0,
    larghezza: 0,
    spessore: 0,
    diametro: 0,
    peso_kg: 0,
    nr_componenti: 1,
    colpi_min: 0,
    confezionamento: false,
    quantita_per_conf: 0,
    tempo_confezionamento_min: 0,
    lotto_voce: 0,
    attrezzaggio_min: 0,
    fornitore: "",
    costo_unitario: 0,
    sfrido: 0,
    costo_min: 0,
    note: "",
  };
}

export function emptyCicloEditorModel(): CicloEditorModel {
  return {
    codice: "",
    descrizione: "",
    cliente: "",
    lotto: "",
    ricarico_spese: 0.75,
    margine_minimo: 0.2,
    costo_lavoro_min: 0.32,
    righe: [],
    breakdown: emptyBreakdown(),
    costo_standard: 0,
    full_cost: 0,
    prezzo_minimo: 0,
    simulazioni: [],
    note_generali: "",
    _extra: {},
  };
}

/** Parse DB row + dataJson into editor model */
export function parseCycleRow(row: {
  id?: number | null;
  rootId?: number | null;
  rev?: number | null;
  code?: string | null;
  description?: string | null;
  client?: string | null;
  lot?: string | null;
  standardCost?: string | number | null;
  minimumPrice?: string | number | null;
  dataJson?: string | null;
}): CicloEditorModel {
  let parsed: CicloDataJson = {};
  if (row.dataJson) {
    try {
      parsed = JSON.parse(row.dataJson) as CicloDataJson;
    } catch {
      parsed = {};
    }
  }

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (
      ![
        "tipo",
        "codice",
        "descrizione",
        "cliente",
        "lotto",
        "ricarico_spese",
        "margine_minimo",
        "costo_lavoro_min",
        "righe",
        "breakdown",
        "costo_standard",
        "full_cost",
        "prezzo_minimo",
        "simulazioni",
        "note_generali",
        "rev",
        "lotti_personalizzati",
      ].includes(k)
    ) {
      extra[k] = v;
    }
  }

  return {
    id: row.id ?? undefined,
    rootId: row.rootId ?? undefined,
    rev: row.rev ?? undefined,
    codice: row.code ?? parsed.codice ?? "",
    descrizione: row.description ?? parsed.descrizione ?? "",
    cliente: row.client ?? parsed.cliente ?? "",
    lotto: row.lot ?? parsed.lotto ?? "",
    ricarico_spese: parsed.ricarico_spese ?? 0.75,
    margine_minimo: parsed.margine_minimo ?? 0.2,
    costo_lavoro_min: parsed.costo_lavoro_min ?? 0.32,
    righe: parsed.righe ?? [],
    breakdown: parsed.breakdown ?? emptyBreakdown(),
    costo_standard:
      typeof row.standardCost === "string"
        ? parseFloat(row.standardCost)
        : typeof row.standardCost === "number"
          ? row.standardCost
          : parsed.costo_standard ?? 0,
    full_cost: parsed.full_cost ?? 0,
    prezzo_minimo:
      typeof row.minimumPrice === "string"
        ? parseFloat(row.minimumPrice)
        : typeof row.minimumPrice === "number"
          ? row.minimumPrice
          : parsed.prezzo_minimo ?? 0,
    simulazioni: parsed.simulazioni ?? [],
    note_generali: parsed.note_generali ?? "",
    lotti_personalizzati:
      parsed.lotti_personalizzati ??
      (Array.isArray(parsed.simulazioni) && parsed.simulazioni.length > 0
        ? parsed.simulazioni.map((s) => s.lotto)
        : undefined),
    _extra: extra,
  };
}

/** Serialize editor model back to dataJson preserving extra fields */
export function serializeCycleDataJson(model: CicloEditorModel): CicloDataJson {
  return {
    tipo: "ciclo_standard",
    codice: model.codice,
    descrizione: model.descrizione,
    cliente: model.cliente,
    lotto: model.lotto,
    ricarico_spese: model.ricarico_spese,
    margine_minimo: model.margine_minimo,
    costo_lavoro_min: model.costo_lavoro_min,
    righe: model.righe,
    breakdown: model.breakdown,
    costo_standard: model.costo_standard,
    full_cost: model.full_cost,
    prezzo_minimo: model.prezzo_minimo,
    simulazioni: model.simulazioni,
    note_generali: model.note_generali,
    lotti_personalizzati: model.lotti_personalizzati,
    ...model._extra,
  };
}
