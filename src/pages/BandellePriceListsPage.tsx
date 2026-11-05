import { useEffect, useState } from "react";
import { Link, useBlocker } from "react-router";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { PRICE_LIST_CATALOGS, selectablePriceCells, type PriceListFamily } from "@/lib/price-list-catalog";
import type { PriceBook, PriceOperation } from "@/lib/percentage-pricebook";

const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
type Snapshot = { revision: number; prices: PriceBook; author: string; createdAt: string };

export default function BandellePriceListsPage({ family = "veneta" }: { family?: PriceListFamily }) {
  const catalog = PRICE_LIST_CATALOGS[family];
  const api = family === "t" ? trpc.bandelleTPrice : trpc.bandellePrice;
  const { user } = useAuth();
  const query = api.get.useQuery(undefined, { refetchOnWindowFocus: false });
  return <Layout><div className="mx-auto max-w-7xl space-y-4">
    <Link className="text-sm text-emerald-700 underline" to={catalog.calculatorPath}>← Torna al calcolatore</Link>
    <h2 className="text-xl font-semibold">Gestione listini · {catalog.title}</h2>
    {query.isFetching ? <p>Caricamento listino…</p> : query.error ? <div role="alert">{query.error.message} <button className={button} onClick={() => void query.refetch()}>Riprova</button></div>
      : query.data && <PriceEditor family={family} key={`${family}-${query.data.revision}`} snapshot={query.data} canEdit={user?.role === "admin"} reload={() => query.refetch()} />}
  </div></Layout>;
}

function PriceEditor({ snapshot, canEdit, reload, family }: { family: PriceListFamily; snapshot: Snapshot; canEdit: boolean; reload: () => Promise<unknown> }) {
  const catalog = PRICE_LIST_CATALOGS[family];
  const api = family === "t" ? trpc.bandelleTPrice : trpc.bandellePrice;
  const money = (units: number) => `${(units / 10 ** catalog.decimals).toLocaleString("it-IT", { minimumFractionDigits: catalog.decimals, maximumFractionDigits: catalog.decimals })} €`;
  const [kind, setKind] = useState(catalog.tables[0].value);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("");
  const [operations, setOperations] = useState<PriceOperation[]>([]);
  const [error, setError] = useState("");
  const [restoreRevision, setRestoreRevision] = useState<number | null>(null);
  const history = api.history.useQuery(undefined, { enabled: canEdit, refetchOnWindowFocus: false });
  const save = api.save.useMutation();
  const restore = api.restore.useMutation();
  const utils = trpc.useUtils();
  const busy = save.isPending || restore.isPending;
  const draft = operations.length ? catalog.apply(snapshot.prices, operations) : snapshot.prices;
  const changed = Object.keys(draft).filter(id => draft[id] !== snapshot.prices[id]);
  const dirty = operations.length > 0;
  const blocker = useBlocker(dirty || busy);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  const config = catalog.tables.find(table => table.value === kind)!;
  const rows = config.rows;
  const rowIds = selectablePriceCells;
  const columnIds = (index: number) => rows.flatMap(row => row.cellIds[index] === null ? [] : [row.cellIds[index]!]);
  const tableIds = rows.flatMap(rowIds);
  const toggle = (ids: string[]) => setSelection(previous => {
    const next = new Set(previous);
    const remove = ids.every(id => next.has(id));
    for (const id of ids) { if (remove) next.delete(id); else next.add(id); }
    return next;
  });
  const preview = () => {
    try {
      const normalized = percent.trim().replace(",", ".").replace("−", "-");
      if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Inserisci una percentuale con al massimo due decimali, ad esempio 5 oppure 2,50.");
      const next = [...operations, { cellIds: [...selection], basisPoints: Math.round(Number(normalized) * 100) }];
      catalog.apply(snapshot.prices, next);
      setOperations(next); setRestoreRevision(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Variazione non valida."); }
  };
  const afterSave = async () => {
    setOperations([]); setError("");
    await (family === "t" ? utils.bandelleTPrice : utils.bandellePrice).history.invalidate();
    await reload();
  };
  const saveDraft = async () => {
    try { await save.mutateAsync({ expectedRevision: snapshot.revision, operations }); await afterSave(); }
    catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito. La bozza è ancora disponibile."); }
  };
  const confirmRestore = async () => {
    if (restoreRevision === null) return;
    try { await restore.mutateAsync({ expectedRevision: snapshot.revision, restoreRevision }); await afterSave(); }
    catch (e) { setError(e instanceof Error ? e.message : "Ripristino non riuscito."); }
  };
  return <>
    <p className="text-sm text-slate-600">Listino salvato: revisione {snapshot.revision} · {snapshot.author} · {snapshot.createdAt}. Prezzi unitari; supplementi esclusi dalle variazioni.</p>
    {!canEdit && <p className="rounded-lg bg-slate-100 p-3">Consultazione listini. Le modifiche sono riservate agli amministratori.</p>}
    {canEdit && <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Variazione percentuale">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={button} onClick={() => setSelection(new Set(Object.keys(draft)))}>Seleziona tutte le tabelle</button>
        <button disabled={busy} className={button} onClick={() => toggle(tableIds)}>Seleziona / deseleziona categoria</button>
        <button disabled={busy || !selection.size} className={button} onClick={() => setSelection(new Set())}>Azzera selezione</button>
      </div>
      <p className="text-sm"><strong>{selection.size} celle selezionate</strong> in {catalog.tables.filter(table => table.rows.some(row => rowIds(row).some(id => selection.has(id)))).length} categorie. Puoi selezionare anche righe, colonne o singole celle.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Variazione %<input aria-label="Variazione percentuale" inputMode="decimal" className="mt-1 block w-40 rounded-lg border px-3 py-2" placeholder="Es. 5 oppure −3" value={percent} onChange={e => setPercent(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !selection.size || !percent} className={button} onClick={preview}>Applica in anteprima</button>
        <button disabled={busy || !dirty} className={button} onClick={() => { setOperations(operations.slice(0, -1)); setError(""); }}>Annulla ultima variazione</button>
      </div>
      <p className="text-xs text-slate-500">Nuovo prezzo = prezzo attuale × (1 + variazione / 100), arrotondato {catalog.decimals === 3 ? "al millesimo (3 decimali)" : "al centesimo"}. Percentuali positive aumentano i prezzi; negative li riducono. Più variazioni si applicano in successione ai prezzi in anteprima.</p>
    </section>}
    <nav aria-label="Categorie di bandelle" className="flex flex-wrap gap-2">
      {catalog.tables.map(type => <button key={type.value} onClick={() => setKind(type.value)} aria-pressed={kind === type.value} className={`${button} ${kind === type.value ? "!border-emerald-700 !bg-emerald-50 font-semibold text-emerald-900" : ""}`}>
        {type.label.replace("Bandelle ", "")} {type.rows.some(row => rowIds(row).some(id => changed.includes(id))) ? "•" : ""}
      </button>)}
    </nav>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="space-y-1 border-b p-4">
        <h3 className="font-semibold">{config.label}</h3>
        <p className="text-sm text-slate-600">{config.description}</p>
        {config.note && <p className="text-xs">{config.note}</p>}
      </div>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Prezzi unitari per {config.rowHeader} e lotto. Seleziona una cella per includerla nella variazione.</caption>
          <thead className="sticky top-0 z-20 bg-slate-100"><tr>
            <th className="sticky left-0 z-30 min-w-28 border-b bg-slate-100 p-3 text-left">{config.rowHeader}</th>
            {catalog.tiers.map((tier, index) => <th key={tier.label} className="min-w-28 border-b p-3">
              {canEdit && <input type="checkbox" disabled={busy || !columnIds(index).length} aria-label={`Seleziona colonna ${tier.label}`} className="mr-2 accent-emerald-600" checked={columnIds(index).length > 0 && columnIds(index).every(id => selection.has(id))} onChange={() => toggle(columnIds(index))} />}{tier.label} pz
            </th>)}
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.key}>
            <th className="sticky left-0 z-10 border-b bg-slate-50 p-3 text-left font-medium">
              {canEdit && <input type="checkbox" disabled={busy} aria-label={`Seleziona riga ${row.key}`} className="mr-2 accent-emerald-600" checked={rowIds(row).every(id => selection.has(id))} onChange={() => toggle(rowIds(row))} />}
              {row.label}
            </th>
            {row.cellIds.map((id, tier) => {
              if (id === null) return <td key={tier} className="border-b border-l bg-slate-50 p-3 text-center text-xs text-slate-500">Non disponibile</td>;
              const modified = draft[id] !== snapshot.prices[id];
              return <td key={id} className="border-b border-l p-1 text-center"><button type="button" disabled={busy || !canEdit} aria-pressed={selection.has(id)} aria-label={`${config.rowHeader} ${row.label}, lotto ${catalog.tiers[tier].label}: ${money(draft[id])}`} onClick={() => toggle([id])}
                className={`w-full rounded p-2 tabular-nums ${selection.has(id) ? "bg-blue-100 ring-2 ring-inset ring-blue-600" : "hover:bg-slate-50"} ${modified ? "font-semibold text-emerald-800" : ""}`}>
                {modified && <span className="block text-xs font-normal text-slate-500 line-through">{money(snapshot.prices[id])}</span>}{money(draft[id])}
              </button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    {canEdit && <section className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-lg" aria-label="Salvataggio listino">
      <p className="mr-auto text-sm"><strong>{changed.length} prezzi modificati</strong> · {operations.length} variazioni in anteprima</p>
      <button className={button} disabled={busy || !dirty} onClick={() => { setOperations([]); setError(""); }}>Scarta anteprima</button>
      <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !changed.length} onClick={() => void saveDraft()}>{save.isPending ? "Salvataggio…" : "Salva nuovi prezzi"}</button>
    </section>}
    {error && <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button disabled={busy} className={button} onClick={() => void reload()}>Scarta bozza e ricarica il listino</button></div>}
    {canEdit && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Storico e ripristino listini</summary>
      <p className="my-3 text-sm">Il ripristino crea una nuova revisione con tutti i prezzi della versione scelta. Le revisioni precedenti restano conservate.</p>
      {history.error && <p role="alert">Impossibile caricare lo storico. <button className={button} onClick={() => void history.refetch()}>Riprova</button></p>}
      <ul className="divide-y">{history.data?.map(item => <li key={item.revision} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><strong>Revisione {item.revision}</strong> · {item.createdAt} · {item.author}<p>{item.description}</p></div>
        <button className={button} disabled={busy || dirty || item.revision === snapshot.revision} onClick={() => setRestoreRevision(item.revision)}>Ripristina</button></li>)}</ul>
      {restoreRevision !== null && <div role="alert" className="mt-3 space-y-3 rounded-lg bg-amber-50 p-3"><p>Ripristinare tutti i prezzi della revisione {restoreRevision}? Il listino corrente rimarrà nello storico.</p><button className={button} disabled={busy} onClick={() => void confirmRestore()}>Conferma ripristino</button> <button className={button} disabled={busy} onClick={() => setRestoreRevision(null)}>Annulla</button></div>}
    </details>}
    {blocker.state === "blocked" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="leave-list-title" className="max-w-md space-y-4 rounded-xl bg-white p-5"><h3 id="leave-list-title" className="font-semibold">Modifiche non salvate</h3><p>Uscendo perderai le variazioni in anteprima.</p><button className={button} onClick={() => blocker.reset()}>Continua qui</button> <button disabled={busy} className={button} onClick={() => blocker.proceed()}>Esci senza salvare</button></div></div>}
  </>;
}
