import { sql, type SQL } from "drizzle-orm";
import { formatOfferNumber, italianOfferYear } from "../src/lib/commercial-offer-number";

type Executor = { execute: (query: SQL) => Promise<unknown> };
function firstNumber(result: unknown): number {
  const rows = (result as [Array<{ lastNumber: number | string }>, unknown])[0];
  const value = Number(rows?.[0]?.lastNumber ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Contatore documenti non valido");
  return value;
}

// Include legacy DDC references and imported documents, without renumbering them.
async function highestStoredNumber(db: Executor): Promise<number> {
  return firstNumber(await db.execute(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING(documentNumber,4),'/',1) AS UNSIGNED)),0) AS lastNumber
    FROM (
      SELECT name AS documentNumber FROM commercial_offers
      UNION ALL
      SELECT JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(dataJson),dataJson,'{}'),'$.numero_preventivo')) AS documentNumber FROM quotes
    ) AS documents
    WHERE documentNumber REGEXP '^DDC[0-9]{1,5}(/[0-9]{4})?$'
  `));
}

/** A preview never reserves a number. Both editors use the same counter. */
export async function previewCommercialDocumentNumber(db: Executor, at = new Date()): Promise<string> {
  const counter = firstNumber(await db.execute(sql`SELECT lastNumber FROM offer_number_sequence WHERE id=1`));
  return formatOfferNumber(Math.max(counter, await highestStoredNumber(db)) + 1, italianOfferYear(at));
}

/** Call inside the SAME transaction that creates the offer or first quote draft.
 * The continuous progressive is shared across document types; only its year suffix changes.
 * Deletion, revision and overwrite never release or consume another number.
 */
export async function reserveCommercialDocumentNumber(tx: Executor, at = new Date()): Promise<string> {
  const result = await tx.execute(sql`SELECT lastNumber FROM offer_number_sequence WHERE id=1 FOR UPDATE`);
  if (!(result as [unknown[], unknown])[0]?.length) throw new Error("Numerazione documenti non configurata");
  const next = Math.max(firstNumber(result), await highestStoredNumber(tx)) + 1;
  const number = formatOfferNumber(next, italianOfferYear(at));
  await tx.execute(sql`UPDATE offer_number_sequence SET lastNumber=${next} WHERE id=1`);
  return number;
}
