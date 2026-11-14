export function quoteInoxGrade(row: Record<string, any>): string {
  if (row.inox_aisi === "304" || row.inox_aisi === "316") return row.inox_aisi;
  if (row.inox_aisi !== undefined) return "";
  const t = row.codice_temporaneo;
  if (
    !t ||
    typeof t.code !== "string" ||
    (t.code !== row.codice &&
      !(t.code.length === 11 && row.codice === t.code + "P"))
  )
    return "";
  return row.codice_temporaneo?.material === "X"
    ? "304"
    : row.codice_temporaneo?.material === "6"
      ? "316"
      : "";
}
export function quoteInoxError(row: Record<string, any>): string | null {
  if (
    row.materiale_prodotto !== "inox" ||
    row.a_forfait === true ||
    row.prodotto_di_serie === true
  )
    return null;
  if (row.inox_aisi !== undefined && !quoteInoxGrade(row))
    return "Seleziona Inox AISI 304 oppure AISI 316.";
  const issued = row.codice_temporaneo?.material,
    grade = quoteInoxGrade(row);
  if (
    grade &&
    issued &&
    ((issued === "X" && grade !== "304") || (issued === "6" && grade !== "316"))
  )
    return "Il tipo di inox non corrisponde al codice temporaneo: rigenera il codice.";
  return null;
}
