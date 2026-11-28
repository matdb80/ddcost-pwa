import { createHash } from "node:crypto";
import type { Quote } from "@db/schema";

/** Exact persisted snapshot: prevents silently overwriting a concurrent edit. */
export function quoteWriteToken(row: Quote): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

/** Number belongs to the saved document, never to a client preview. */
export function preserveQuoteNumber(document: Record<string, unknown>, source: string | null): Record<string, unknown> {
  const prior = JSON.parse(source ?? "{}");
  const result = { ...document };
  if (Object.prototype.hasOwnProperty.call(prior, "numero_preventivo")) result.numero_preventivo = prior.numero_preventivo;
  else delete result.numero_preventivo;
  return result;
}
