/**
 * Restituisce un messaggio di errore se il materiale ottone è incompatibile
 * con la verniciatura (RAL a livello documento o goffrato a livello riga).
 */
export function quoteOttoneError(
  row: Record<string, any>,
  hasDocumentRal?: boolean
): string | null {
  if (row.materiale_prodotto !== "ottone") return null;
  if (row.a_forfait === true || row.prodotto_di_serie === true) return null;
  if (hasDocumentRal || row.nero_standard_goffrato === true) {
    return "L'ottone non può essere verniciato, cambia materiale o deseleziona la casella RAL e/o Goffrato";
  }
  return null;
}
