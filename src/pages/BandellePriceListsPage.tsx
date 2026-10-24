import { useEffect, useState } from "react";
import { Link, useBlocker } from "react-router";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { BANDELLE_VENETA_TYPES, BANDELLE_VENETA_CONFIGURATIONS, BANDELLE_VENETA_LOT_TIERS, type BandellaVenetaType, type BandellaVenetaPriceRow } from "@/lib/bandelle-veneta";
import { applyBandellePriceOperations, bandellaCellId, bandellaRowKey, type BandellePriceBook, type BandellePriceOperation } from "@/lib/bandelle-pricebook";

const money = (cents: number) => `${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
type Snapshot = { revision: number; prices: BandellePriceBook; author: string; createdAt: string };

export default function BandellePriceListsPage() {
  const { user } = useAuth();
  const query = trpc.bandellePrice.get.useQuery(undefined, { refetchOnWindowFocus: false });
  return <Layout><div className="mx-auto max-w-7xl space-y-4">
    <Link className="text-sm text-emerald-700 underline" to="/bandelle-veneta">← Torna al calcolatore</Link>
    <h2 className="text-xl font-semibold">Gestione listini · Bandelle Giotto Plus</h2>
    {query.isFetching ? <p>Caricamento listino…</p> : query.error ? <div role="alert">{query.error.message} <button className={button} onClick={() => void query.refetch()}>Riprova</button></div>
      : query.data && <PriceEditor key={query.data.revision} snapshot={query.data} canEdit={user?.role === "admin"} reload={() => query.refetch()} />}
  </div></Layout>;
}

function PriceEditor({ snapshot, canEdit, reload }: { snapshot: Snapshot; canEdit: boolean; reload: () => Promise<unknown> }) {
  const [kind, setKind] = useState<BandellaVenetaType>("dritte");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("");
  const [operations, setOperations] = useState<BandellePriceOperation[]>([]);
  const [error, setError] = useState("");
  const [restoreRevision, setRestoreRevision] = useState<number | null>(null);
  const history = trpc.bandellePrice.history.useQuery(undefined, { enabled: canEdit, refetchOnWindowFocus: false });
  const save = trpc.bandellePrice.save.useMutation();
  const restore = trpc.bandellePrice.restore.useMutation();
  const utils = trpc.useUtils();
  const busy = save.isPending || restore.isPending;
  const draft = operations.length ? applyBandellePriceOperations(snapshot.prices, operations) : snapshot.prices;
  const changed = Object.keys(draft).filter(id => draft[id] !== snapshot.prices[id]);
  const dirty = operations.length > 0;
  const blocker = useBlocker(dirty || busy);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  const config = BANDELLE_VENETA_CONFIGURATIONS[kind]!;
  const rows = config.prices!;
  const rowIds = (row: BandellaVenetaPriceRow) => row.prices.map((_, tier) => bandellaCellId(kind, row, tier));
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
      applyBandellePriceOperations(snapshot.prices, next);
      setOperations(next); setRestoreRevision(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Variazione non valida."); }
  };
  const afterSave = async () => {
    setOperations([]); setError("");
    await utils.bandellePrice.history.invalidate();
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
      <p className="text-sm"><strong>{selection.size} celle selezionate</strong> in {BANDELLE_VENETA_TYPES.filter(type => [...selection].some(id => id.startsWith(`${type.value}:`))).length} categorie. Puoi selezionare anche righe, colonne o singole celle.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Variazione %<input aria-label="Variazione percentuale" inputMode="decimal" className="mt-1 block w-40 rounded-lg border px-3 py-2" placeholder="Es. 5 oppure −3" value={percent} onChange={e => setPercent(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !selection.size || !percent} className={button} onClick={preview}>Applica in anteprima</button>
        <button disabled={busy || !dirty} className={button} onClick={() => { setOperations(operations.slice(0, -1)); setError(""); }}>Annulla ultima variazione</button>
      </div>
      <p className="text-xs text-slate-500">Nuovo prezzo = prezzo attuale × (1 + variazione / 100), arrotondato al centesimo. Percentuali positive aumentano i prezzi; negative li riducono. Più variazioni si applicano in successione ai prezzi in anteprima.</p>
    </section>}
    <nav aria-label="Categorie di bandelle" className="flex flex-wrap gap-2">
      {BANDELLE_VENETA_TYPES.map(type => <button key={type.value} onClick={() => setKind(type.value)} aria-pressed={kind === type.value} className={`${button} ${kind === type.value ? "!border-emerald-700 !bg-emerald-50 font-semibold text-emerald-900" : ""}`}>
        {type.label.replace("Bandelle ", "")} {changed.some(id => id.startsWith(`${type.value}:`)) ? "•" : ""}
      </button>)}
    </nav>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="space-y-1 border-b p-4">
        <h3 className="font-semibold">{BANDELLE_VENETA_TYPES.find(type => type.value === kind)?.label}</h3>
        <p className="text-sm text-slate-600">La tabella vale per: {config.typologies.map(t => t.label).join(", ")}.</p>
        {kind === "vicentine-doppie" && <p className="text-xs">Le coppie asimmetriche usano la somma dei fori; per i totali dispari si ricalcola la media dei prezzi aggiornati.</p>}
      </div>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Prezzi unitari per numero di fori e lotto. Seleziona una cella per includerla nella variazione.</caption>
          <thead className="sticky top-0 z-20 bg-slate-100"><tr>
            <th className="sticky left-0 z-30 min-w-28 border-b bg-slate-100 p-3 text-left">Fori vite{kind.startsWith("snodate") && <span className="block text-xs font-normal">spalla+punta</span>}</th>
            {BANDELLE_VENETA_LOT_TIERS.map((tier, index) => <th key={tier.label} className="min-w-28 border-b p-3">
              {canEdit && <input type="checkbox" disabled={busy} aria-label={`Seleziona colonna ${tier.label}`} className="mr-2 accent-emerald-600" checked={rows.every(row => selection.has(bandellaCellId(kind, row, index)))} onChange={() => toggle(rows.map(row => bandellaCellId(kind, row, index)))} />}{tier.label} pz
            </th>)}
          </tr></thead>
          <tbody>{rows.map(row => <tr key={bandellaRowKey(row)}>
            <th className="sticky left-0 z-10 border-b bg-slate-50 p-3 text-left font-medium">
              {canEdit && <input type="checkbox" disabled={busy} aria-label={`Seleziona riga ${bandellaRowKey(row)}`} className="mr-2 accent-emerald-600" checked={rowIds(row).every(id => selection.has(id))} onChange={() => toggle(rowIds(row))} />}
              {kind === "vicentine-doppie" ? `${row.screwHoles / 2}+${row.screwHoles / 2}` : bandellaRowKey(row)}
            </th>
            {row.prices.map((_, tier) => {
              const id = bandellaCellId(kind, row, tier); const modified = draft[id] !== snapshot.prices[id];
              return <td key={id} className="border-b border-l p-1 text-center"><button type="button" disabled={busy || !canEdit} aria-pressed={selection.has(id)} aria-label={`${bandellaRowKey(row)} fori, lotto ${BANDELLE_VENETA_LOT_TIERS[tier].label}: ${money(draft[id])}`} onClick={() => toggle([id])}
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
