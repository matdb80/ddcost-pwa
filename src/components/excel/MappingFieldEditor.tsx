import { useEffect, useState } from "react";
import { CATEGORIE_RIGA } from "../../types/cycle";
import type { ImportTransform, SheetEvidence } from "../../types/excel-import";
import type { MappingFieldDecision } from "../../types/excel-mapping-draft";
import { mappingValue } from "../../lib/excel-f3-workflow";
export const FIELD_LABELS: Record<string, string> = {
  "cycle.code": "Codice prodotto",
  "cycle.description": "Descrizione prodotto",
  "cycle.client": "Cliente (facoltativo)",
  categoria: "Categoria DDCost",
  descrizione: "Descrizione",
  nr_componenti: "Quantità",
  colpi_min: "Velocità (pz/min)",
  costo_unitario: "Tariffa unitaria",
  peso_kg: "Peso applicato (kg)",
  lunghezza: "Lunghezza (mm)",
  larghezza: "Larghezza (mm)",
  spessore: "Spessore (mm)",
  diametro: "Diametro (mm)",
  attrezzaggio_min: "Setup (min)",
  lotto_voce: "Lotto riga",
  sfrido: "Sfrido aggiuntivo",
};
export function MappingFieldEditor({
  field,
  sheet,
  shared,
  onChange,
  onReusable,
}: {
  field: MappingFieldDecision;
  sheet: SheetEvidence;
  shared: boolean;
  onChange: (input: {
    value?: unknown;
    address?: string;
    sheetName?: boolean;
    confirm?: boolean;
    transform?: ImportTransform;
  }) => void;
  onReusable: (value: boolean) => void;
}) {
  const current = mappingValue(field),
    [value, setValue] = useState(String(current ?? "")),
    [address, setAddress] = useState(
      field.selectedSource?.addresses[0] ?? field.source.addresses[0] ?? ""
    ),
    [transform, setTransform] = useState<ImportTransform>(field.transform);
  useEffect(() => {
    setValue(String(current ?? ""));
    setAddress(
      field.selectedSource?.addresses[0] ?? field.source.addresses[0] ?? ""
    );
    setTransform(field.transform);
  }, [current, field.id, field.selectedSource, field.transform]);
  const cells = field.source.addresses.map(a => sheet.cells[a]).filter(Boolean),
    chosen =
      field.selectedSource?.addresses
        .map(a => sheet.cells[a])
        .filter(Boolean) ?? [];
  return (
    <div
      className="rounded border bg-white p-3 space-y-2"
      data-testid={`mapping-${field.target}`}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{FIELD_LABELS[field.target] ?? field.target}</strong>
        <span className="text-xs text-slate-600">
          {field.decision === "proposed"
            ? "Proposta da verificare"
            : field.decision === "confirmed"
              ? "Confermato"
              : "Correzione esplicita"}
        </span>
      </div>
      <div className="text-sm break-words">
        <b>Fonte originale: </b>
        {cells.length
          ? cells.map(c => (
              <div key={c.address}>
                {sheet.name}!{c.address} — valore: {String(c.raw ?? "mancante")}{" "}
                · visualizzato: {c.displayText || "vuoto"}
                {c.formula && (
                  <span>
                    {" "}
                    · formula: {c.formula} · cache:{" "}
                    {String(c.cached ?? "mancante")}
                  </span>
                )}
                {c.error && <b> · ERRORE {c.error}</b>}
              </div>
            ))
          : "Derivata dal layout / da specificare"}
        <div>
          Unità: {field.sourceUnit ?? "vedere intestazione Excel"} →{" "}
          {field.targetUnit ?? FIELD_LABELS[field.target] ?? field.target}
        </div>
      </div>
      {chosen.length > 0 && (
        <p className="text-sm text-blue-800">
          Fonte scelta:{" "}
          {chosen
            .map(
              c =>
                `${c.address} = ${c.displayText} (cache ${String(c.cached ?? c.raw ?? "mancante")})`
            )
            .join("; ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 min-w-40">
          Valore DDCost
          {field.target === "categoria" ? (
            <select
              className="block w-full border rounded p-2"
              value={value}
              onChange={e => setValue(e.target.value)}
            >
              <option value="">Da scegliere</option>
              {CATEGORIE_RIGA.map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              className="block w-full border rounded p-2"
              aria-label={`Valore ${FIELD_LABELS[field.target] ?? field.target}`}
              value={value}
              onChange={e => setValue(e.target.value)}
            />
          )}
        </label>
        <button
          className="self-end border rounded px-3 py-2"
          onClick={() => onChange({ value })}
        >
          Applica valore
        </button>
        <button
          className="self-end border rounded px-3 py-2"
          onClick={() => onChange({ confirm: true })}
        >
          Conferma proposta
        </button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          Scegli un'altra cella o trasformazione
        </summary>
        <div className="grid gap-2 mt-2 sm:grid-cols-3">
          <label>
            Cella Excel
            <input
              aria-label={`Cella ${field.target}`}
              className="block border rounded p-2 w-full"
              placeholder="es. I4"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </label>
          <label>
            Trasformazione
            <select
              className="block border rounded p-2 w-full"
              value={transform}
              onChange={e => setTransform(e.target.value as ImportTransform)}
            >
              <option value="text">Testo</option>
              <option value="number">Numero</option>
              <option value="kg">Numero già in kg</option>
              <option value="mm">Numero già in mm</option>
              <option value="percent">Percentuale / 100</option>
              <option value="minutes_to_rate">Min/pezzo → pezzi/min</option>
              <option value="identity">Copia valore</option>
            </select>
          </label>
          <button
            className="border rounded self-end px-3 py-2"
            onClick={() => onChange({ address, transform })}
          >
            Usa cella
          </button>
        </div>
      </details>
      {field.target === "cycle.code" && (
        <button
          className="text-sm underline"
          onClick={() => onChange({ sheetName: true })}
        >
          Usa il nome del foglio come codice
        </button>
      )}
      {shared && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={field.reusable === true}
            onChange={e => onReusable(e.target.checked)}
          />
          Riutilizza questa regola nei file compatibili
          {field.binding === "constant"
            ? " (valore fisso: verrà ripetuto)"
            : ""}
        </label>
      )}
    </div>
  );
}
