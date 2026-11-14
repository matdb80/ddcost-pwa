import { BANDELLE_VENETA_TYPES, BANDELLE_VENETA_CONFIGURATIONS, BANDELLE_VENETA_LOT_TIERS } from "./bandelle-veneta";
import { applyBandellePriceOperations, bandellaCellId, bandellaRowKey } from "./bandelle-pricebook";
import { T_PRICE_TYPES, applyBandelleTPriceOperations, bandellaTCellId } from "./bandelle-t-pricebook";
import { PRICES, TIERS } from "./bandelle-t-listino";
import type { PriceBook, PriceOperation } from "./percentage-pricebook";
export type PriceListFamily = "veneta" | "t";
export type PriceMatrixRow = { key: string; label: string; cellIds: (string | null)[] };
export type PriceMatrix = { value: string; label: string; description: string; rowHeader: string; note?: string; rows: PriceMatrixRow[] };
type Catalog = { title: string; calculatorPath: string; decimals: 2 | 3; tiers: readonly { label: string }[]; tables: PriceMatrix[]; apply: (book: PriceBook, operations: PriceOperation[]) => PriceBook };
export const PRICE_LIST_CATALOGS: Record<PriceListFamily, Catalog> = {
  veneta: {
    title: "Bandelle Giotto Plus", calculatorPath: "/bandelle-veneta", decimals: 2,
    tiers: BANDELLE_VENETA_LOT_TIERS, apply: applyBandellePriceOperations,
    tables: BANDELLE_VENETA_TYPES.map(type => {
      const config = BANDELLE_VENETA_CONFIGURATIONS[type.value]!;
      return { ...type, description: `La tabella vale per: ${config.typologies.map(t => t.label).join(", ")}.`,
        rowHeader: type.value.startsWith("snodate") ? "Fori spalla+punta" : "Fori vite",
        note: type.value === "vicentine-doppie" ? "Le coppie asimmetriche usano la somma dei fori; per i totali dispari si ricalcola la media dei prezzi aggiornati." : undefined,
        rows: config.prices!.map(row => ({ key: bandellaRowKey(row), label: type.value === "vicentine-doppie" ? `${row.screwHoles / 2}+${row.screwHoles / 2}` : bandellaRowKey(row), cellIds: row.prices.map((_, tier) => bandellaCellId(type.value, row, tier)) })),
      };
    }),
  },
  t: {
    title: "Bandelle a T · Smeralda", calculatorPath: "/bandelle-t", decimals: 3,
    tiers: TIERS, apply: applyBandelleTPriceOperations,
    tables: T_PRICE_TYPES.map(type => ({ ...type,
      description: type.value === "standard" ? "Prezzi condivisi per occhio centrale e decentrato standard." : "Prezzi del listino Smeralda per lama da 16 cm.",
      rowHeader: "Collo D (mm)",
      note: "Listino iniziale con aumento del 4,5% del 01/03/2026 già incluso. Le celle senza prezzo richiedono quotazione manuale e non sono modificabili.",
      rows: PRICES[type.value].map(row => ({ key: String(row.collo), label: `${row.collo} mm`, cellIds: row.prices.map((price, tier) => price === null ? null : bandellaTCellId(type.value, row.collo, tier)) })),
    })),
  },
};
export const selectablePriceCells = (row: PriceMatrixRow) => row.cellIds.filter((id): id is string => id !== null);
