import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layout from "@/components/Layout";
import FormulaTooltip from "@/components/FormulaTooltip";
import { trpc } from "@/providers/trpc";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, CreditCard, ExternalLink, FileText, Pencil, Plus, Printer, Save, Search, ShoppingCart, StickyNote, Trash2, Truck, UserRound, X } from "lucide-react";
import { applyStandardCycleToOfferRow } from "@/lib/commercial-offer-cycle";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";
import {
  additionalDiscountPercent,
  calculateOfferLotPrice,
  cycleForOfferRow,
  discountFactor,
  generateListinoFromNet,
  offerLotTerms,
  offerLotsForRow,
  selectedOfferLots,
  simulationsForOfferRow,
  withCalculatedOfferRow,
  withOfferLotTerms,
  withSelectedOfferLot,
  type CommercialOfferRow,
  type OfferLotTerms,
} from "@/lib/commercial-offer-pricing";
import {
  buildCommercialOfferPrintHtml,
  openCommercialOfferPrintWindow,
  type CustomerPricePresentation,
  type OfferPrintMode,
} from "@/lib/commercial-offer-pdf";

type OfferRow = CommercialOfferRow & {
  codice?: string;
  descrizione?: string;
  lotto?: number | string;
  listino?: number | string;
  tipo_listino?: string;
  sconto_base?: string;
  extra?: number | string;
  netto_base?: number;
  netto?: number;
  sconto_finale?: string;
  full_cost?: number | null;
  prezzo_minimo?: number | null;
  margine_pct?: number | null;
  totale_riga?: number;
  record_id?: number;
  root_id?: number;
  rev?: number;
  cycle_lot?: string;
  lotti_selezionati?: number[];
  lotti_aggiuntivi?: number[];
  prezzi_lotti?: Record<string, OfferLotTerms>;
  data?: unknown;
};
type OfferDocument = {
  nome?: string;
  cliente?: string;
  riferimento?: string;
  pagamento?: string;
  trasporto?: string;
  note?: string;
  note_cliente?: string;
  righe: OfferRow[];
  [key: string]: unknown;
};

const parseNumber = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? number : 0; };
const money = (value: unknown) => parseNumber(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blankRow = (): OfferRow => ({
  codice: "", descrizione: "", lotto: "", listino: 0, tipo_listino: "Listino calcolato",
  sconto_base: "40+10%", extra: 0, netto_base: 0, netto: 0, sconto_finale: "40+10%",
  full_cost: null, prezzo_minimo: null,
  lotti_selezionati: [], lotti_aggiuntivi: [], prezzi_lotti: {},
});
const blankOffer = (): OfferDocument => ({ nome: "", cliente: "", riferimento: "", pagamento: "", trasporto: "", note: "", righe: [blankRow()] });

function combinedDiscount(row: OfferRow): string {
  const base = String(row.sconto_base ?? "").trim();
  const extra = parseNumber(row.extra);
  return base + (extra > 0 ? (base ? "+" : "") + String(extra).replace(".", ",") + "%" : "");
}

function recompute(row: OfferRow): OfferRow {
  const listPrice = parseNumber(row.listino);
  const extra = parseNumber(row.extra);
  if (listPrice < 0 || extra < 0 || extra >= 100) throw Error("Listino o sconto extra non valido");
  const factor = discountFactor(String(row.sconto_base ?? ""));
  const base = listPrice * factor;
  const net = base * (1 - extra / 100);
  return {
    ...row,
    netto_base: base,
    netto: net,
    sconto_finale: combinedDiscount(row),
    margine_pct: net > 0 && row.full_cost != null ? (net - parseNumber(row.full_cost)) / net * 100 : null,
    ...(row.totale_riga === undefined ? {} : { totale_riga: net * parseNumber(row.lotto) }),
  };
}

function lotPrice(row: OfferRow) {
  try { return calculateOfferLotPrice(row, Number(row.lotto)); }
  catch { return null; }
}

function generatedListinoIsCurrent(row: OfferRow, lot: number): boolean {
  const price = (() => { try { return calculateOfferLotPrice(row, lot); } catch { return null; } })();
  const terms = offerLotTerms(row, lot);
  if (!price || terms.listino_generato_per_netto == null) return false;
  return Math.abs(Number(terms.listino_generato_per_netto) - price.netPrice) < 0.000001 &&
    String(terms.listino_generato_sconto ?? "") === combinedDiscount(row);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function OffertaEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const numericId = Number(id ?? 0);
  const [offer, setOffer] = useState<OfferDocument>(blankOffer());
  const [baseline, setBaseline] = useState("");
  const [readOnly, setReadOnly] = useState(!isNew);
  const [offerNumberEdited, setOfferNumberEdited] = useState(false);
  const [error, setError] = useState("");
  const [cyclePickerRow, setCyclePickerRow] = useState<number | null>(null);
  const [cycleSearch, setCycleSearch] = useState("");
  const [cyclePage, setCyclePage] = useState(1);
  const [selectingCycle, setSelectingCycle] = useState(false);
  const [newLotDrafts, setNewLotDrafts] = useState<Record<number, string>>({});
  const [pricePresentation, setPricePresentation] = useState<CustomerPricePresentation>("netto");
  const [hideDocumentTotal, setHideDocumentTotal] = useState(false);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.offer.get.useQuery({ id: numericId }, { enabled: !isNew && numericId > 0 });
  const nextOfferNumber = trpc.offer.nextNumber.useQuery(undefined, { enabled: isNew });
  const cycleDirectory = trpc.cycle.listGrouped.useQuery({
    search: cycleSearch || undefined, page: cyclePage, pageSize: 25,
  }, { enabled: cyclePickerRow !== null });
  const create = trpc.offer.create.useMutation();
  const update = trpc.offer.update.useMutation();

  useEffect(() => {
    if (!data || isNew) return;
    try {
      const original = JSON.parse(data.dataJson ?? "{}") as OfferDocument;
      if (!original || !Array.isArray(original.righe)) throw Error("Manca la lista righe");
      const merged: OfferDocument = {
        ...original,
        nome: data.name ?? original.nome ?? "",
        cliente: data.client ?? original.cliente ?? "",
        riferimento: data.reference ?? original.riferimento ?? "",
        note: data.notes ?? original.note ?? "",
      };
      setOffer(merged);
      setBaseline(JSON.stringify(merged));
      setReadOnly(true);
      setError("");
    } catch {
      setError("Il formato storico dell'offerta non è riconosciuto. Nessun dato è stato modificato.");
    }
  }, [data, isNew]);

  useEffect(() => {
    if (!isNew || offerNumberEdited || !nextOfferNumber.data?.number) return;
    setOffer((previous) => ({ ...previous, nome: nextOfferNumber.data.number }));
  }, [isNew, nextOfferNumber.data, offerNumberEdited]);

  const changed = JSON.stringify(offer) !== baseline;
  const locked = !isNew && readOnly;
  const edit = (key: string, value: unknown) => setOffer((previous) => ({ ...previous, [key]: value }));
  const replaceRow = (index: number, next: OfferRow) => setOffer((previous) => {
    const rows = [...previous.righe];
    rows[index] = next;
    return { ...previous, righe: rows };
  });
  const editRow = (index: number, key: string, value: unknown) => {
    let next = { ...offer.righe[index], [key]: value } as OfferRow;
    let validationMessage = "";
    if (["listino", "sconto_base", "extra"].includes(key)) {
      try { Object.assign(next, recompute(next)); }
      catch (caught) { validationMessage = errorMessage(caught, "Sconto non valido"); }
    }
    if (["lotto", "ricarico_costi_fissi_pct", "margine_netto_desiderato_pct"].includes(key) && cycleForOfferRow(next)) {
      try { next = withCalculatedOfferRow(next) as OfferRow; validationMessage = ""; }
      catch (caught) { validationMessage = errorMessage(caught, "Valori di prezzo non validi"); }
    }
    setOffer((previous) => {
      const righe = [...previous.righe];
      righe[index] = next;
      return { ...previous, righe };
    });
    setError(validationMessage);
  };

  const chooseStandardCycle = async (cycleId: number) => {
    if (cyclePickerRow === null || selectingCycle) return;
    const rowIndex = cyclePickerRow;
    setSelectingCycle(true);
    try {
      const cycle = await utils.cycle.get.fetch({ id: cycleId });
      if (!cycle) throw Error("Il ciclo selezionato non è più disponibile");
      setOffer((previous) => {
        if (!Array.isArray(previous.righe) || !previous.righe[rowIndex]) return previous;
        const righe = [...previous.righe];
        righe[rowIndex] = applyStandardCycleToOfferRow(righe[rowIndex], cycle) as OfferRow;
        try { righe[rowIndex] = withCalculatedOfferRow(righe[rowIndex]) as OfferRow; }
        catch { /* The row remains editable and the validation message is shown below. */ }
        return { ...previous, righe };
      });
      setCyclePickerRow(null);
      setCycleSearch("");
      setCyclePage(1);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "Impossibile caricare il ciclo selezionato"));
    } finally {
      setSelectingCycle(false);
    }
  };

  const generateListino = (index: number) => {
    setError("");
    try {
      const row = offer.righe[index];
      const lots = selectedOfferLots(row);
      if (!lots.length) throw Error("Selezionare almeno un lotto da includere nell'offerta cliente");
      const discount = combinedDiscount(row);
      let next: OfferRow = { ...row, tipo_listino: "Generato dal prezzo netto" };
      for (const lot of lots) {
        const price = calculateOfferLotPrice(row, lot);
        const generated = generateListinoFromNet(price.netPrice, discount);
        next = withOfferLotTerms(next, lot, {
          listino: generated.listino,
          listino_generato_per_netto: price.netPrice,
          listino_generato_sconto: discount,
        }) as OfferRow;
      }
      next = recompute(next);
      replaceRow(index, next);
    } catch (caught) {
      setError(errorMessage(caught, "Impossibile generare il listino"));
    }
  };

  const editLotListino = (index: number, lot: number, value: number | "") => {
    const next = withOfferLotTerms(offer.righe[index], lot, {
      listino: value,
      listino_generato_per_netto: undefined,
      listino_generato_sconto: undefined,
    }) as OfferRow;
    replaceRow(index, recompute(next));
  };

  const editLotNetPrice = (index: number, lot: number, value: string) => {
    const next = withOfferLotTerms(offer.righe[index], lot, {
      prezzo_netto_manuale: value.trim() ? value : undefined,
    }) as OfferRow;
    replaceRow(index, next);
    try {
      if (value.trim()) calculateOfferLotPrice(next, lot);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "Prezzo netto manuale non valido"));
    }
  };

  const selectLot = (index: number, lot: number, selected: boolean) => {
    replaceRow(index, withSelectedOfferLot(offer.righe[index], lot, selected) as OfferRow);
  };

  const addOfferLot = (index: number) => {
    setError("");
    const lot = Number(newLotDrafts[index]);
    if (!Number.isInteger(lot) || lot <= 0) return setError("Inserire un lotto aggiuntivo intero e maggiore di zero");
    const row = offer.righe[index];
    const customLots = Array.isArray(row.lotti_aggiuntivi) ? row.lotti_aggiuntivi : [];
    const isCycleLot = simulationsForOfferRow(row).some((simulation) => Number(simulation.lotto) === lot);
    const nextCustomLots = isCycleLot ? customLots : [...new Set([...customLots, lot])];
    const next = withSelectedOfferLot({ ...row, lotti_aggiuntivi: nextCustomLots }, lot, true) as OfferRow;
    replaceRow(index, next);
    setNewLotDrafts((current) => ({ ...current, [index]: "" }));
  };

  const removeOfferLot = (index: number, lot: number) => {
    const row = offer.righe[index];
    const customLots = (row.lotti_aggiuntivi ?? []).filter((item) => item !== lot);
    const next = withSelectedOfferLot({ ...row, lotti_aggiuntivi: customLots }, lot, false) as OfferRow;
    replaceRow(index, next);
  };

  const preparedOffer = (): OfferDocument => ({
    ...offer,
    righe: offer.righe.map((row) => {
      try { return cycleForOfferRow(row) ? withCalculatedOfferRow(row) as OfferRow : recompute(row); }
      catch { return row; }
    }),
  });

  const save = async () => {
    setError("");
    if (!offer.nome?.trim()) return setError("Inserire il numero dell'offerta");
    if (!Array.isArray(offer.righe) || offer.righe.length < 1) return setError("Inserire almeno una riga");
    if (offer.righe.some((row) => !String(row.descrizione ?? "").trim())) return setError("Inserire la descrizione di ogni riga");
    if (!isNew && !changed) return setError("Nessuna modifica rilevata");
    try {
      const computed = preparedOffer();
      for (const row of computed.righe) {
        discountFactor(String(row.sconto_base ?? ""));
        if (parseNumber(row.listino) < 0 || parseNumber(row.extra) < 0 || parseNumber(row.extra) >= 100)
          throw Error("Listino o sconto extra non valido");
        if (cycleForOfferRow(row)) {
          const lots = selectedOfferLots(row);
          if (!lots.length) throw Error("Selezionare almeno un lotto da includere nell'offerta cliente");
          offerLotsForRow(row).forEach((lot) => calculateOfferLotPrice(row, lot));
          if ((row.lotti_aggiuntivi ?? []).some((lot) => !Number.isInteger(Number(lot)) || Number(lot) <= 0))
            throw Error("I lotti aggiuntivi devono essere interi e maggiori di zero");
        }
      }
      const body = {
        name: String(computed.nome),
        client: String(computed.cliente ?? ""),
        reference: String(computed.riferimento ?? ""),
        notes: String(computed.note ?? ""),
        numRows: computed.righe.length,
        dataJson: JSON.stringify(computed),
      };
      if (isNew) {
        const result = await create.mutateAsync({ ...body, numberEdited: offerNumberEdited });
        navigate("/offerte/" + result.id);
      } else {
        await update.mutateAsync({ id: numericId, ...body });
        setOffer(computed);
        setBaseline(JSON.stringify(computed));
        setReadOnly(true);
        window.alert("Offerta salvata. Riaprila per verificare i dati persistenti.");
        navigate("/offerte");
      }
      void utils.offer.list.invalidate().catch(() => {});
    } catch (caught) {
      setError(errorMessage(caught, "Salvataggio non riuscito"));
    }
  };

  const exportPdf = (mode: OfferPrintMode) => {
    setError("");
    try {
      const computed = preparedOffer();
      if (mode === "customer") {
        for (const row of computed.righe) {
          const lots = cycleForOfferRow(row) ? selectedOfferLots(row) : [Number(row.lotto)].filter((lot) => lot > 0);
          if (!lots.length) throw Error("Selezionare almeno un lotto da includere nell'offerta cliente.");
          if (cycleForOfferRow(row)) lots.forEach((lot) => calculateOfferLotPrice(row, lot));
          if (pricePresentation === "listino_sconto") {
            discountFactor(combinedDiscount(row));
            if (lots.some((lot) => parseNumber(offerLotTerms(row, lot).listino) <= 0))
              throw Error("Generare o inserire il prezzo di listino per ogni lotto selezionato prima dell'esportazione.");
          }
        }
      }
      const html = buildCommercialOfferPrintHtml(
        { ...computed, id: isNew ? undefined : numericId },
        mode,
        pricePresentation,
        new URL("/images/ddf-logo.png", window.location.origin).toString(),
        { hideDocumentTotal },
      );
      openCommercialOfferPrintWindow(html);
    } catch (caught) {
      setError(errorMessage(caught, "Impossibile generare il documento PDF"));
    }
  };

  if (!isNew && isLoading) return <Layout>Caricamento offerta...</Layout>;
  if (!isNew && !data) return <Layout><p>Offerta non trovata.</p><Link to="/offerte">Torna all'elenco</Link></Layout>;

  return <Layout>
    <div className="w-full max-w-screen-2xl mx-auto space-y-5 pb-8">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-3 items-center">
          <Link to="/offerte" className="p-2 border rounded"><ArrowLeft size={16}/></Link>
          <h1 className="font-bold text-2xl">{isNew ? "Nuova offerta commerciale prodotti standard" : "Offerta #" + numericId}</h1>
        </div>
        {locked
          ? <button type="button" onClick={() => setReadOnly(false)} className="flex gap-2 bg-emerald-600 text-white rounded px-4 py-2"><Pencil size={16}/>Modifica</button>
          : <button type="button" disabled={create.isPending || update.isPending || (!isNew && !changed) || (isNew && !offerNumberEdited && !nextOfferNumber.data?.number)} onClick={() => void save()} className="flex gap-2 bg-emerald-600 disabled:opacity-40 text-white rounded px-4 py-2"><Save size={16}/>Salva offerta</button>}
      </div>
      {error && <p role="alert" className="p-3 bg-red-50 border border-red-300 text-red-800 rounded">{error}</p>}
      <p className="text-sm text-slate-600">Scegli un prodotto dai Cicli Standard, confronta i prezzi al variare del lotto e prepara una versione interna o una versione da inviare al cliente.</p>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound size={18} aria-hidden="true"/>Testata</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([["nome", "Numero offerta"], ["cliente", "Cliente"], ["riferimento", "Riferimento"]] as const).map(([key, label]) => <label key={key} className="flex flex-col text-sm gap-1">
            <span>{label}</span><input disabled={locked} value={String(offer[key] ?? "")} onChange={(event) => { if (key === "nome" && isNew) setOfferNumberEdited(true); edit(key, event.target.value); }} className="p-2 border rounded disabled:bg-slate-100"/>
          </label>)}
        </div>
      </section>

      <div className="sticky top-0 z-30 -mx-3 md:-mx-6 px-3 md:px-6 py-2 border-y border-slate-200 bg-slate-50/95 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><ShoppingCart size={20} aria-hidden="true"/>Prodotti ({offer.righe.length})</h2>
          {!locked && <button type="button" className="flex gap-2 px-3 py-2 border border-emerald-600 text-emerald-700 rounded bg-white hover:bg-emerald-50" onClick={() => edit("righe", [...offer.righe, blankRow()])}><Plus size={16}/>Aggiungi prodotto</button>}
        </div>
      </div>

      {offer.righe.map((row, index) => {
        const cycle = cycleForOfferRow(row);
        let lots: number[] = [];
        try { lots = offerLotsForRow(row); } catch { /* Validation appears in the price summary. */ }
        const selectedLots = selectedOfferLots(row);
        const price = lotPrice(row);
        return <section key={index} className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <h3 className="font-semibold">Prodotto {index + 1}{row.record_id ? ` · ciclo ${row.codice || row.record_id} · rev. ${row.rev ?? 1}` : ""}</h3>
            {!locked && offer.righe.length > 1 && <button title="Rimuovi prodotto" className="text-red-500" onClick={() => edit("righe", offer.righe.filter((_, rowIndex) => index !== rowIndex))}><Trash2 size={16}/></button>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!locked && <button type="button" onClick={() => { setCyclePickerRow(index); setCycleSearch(""); setCyclePage(1); }}
              className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              <Search size={16}/>{row.record_id ? "Sostituisci prodotto da Cicli Standard" : "Scegli prodotto da Cicli Standard"}
            </button>}
            {row.record_id && <>
              <Link to={`/cicli/${row.record_id}`} target="_blank" rel="noreferrer" title="Apre il ciclo standard più recente. Per applicare una nuova revisione, riseleziona il prodotto nell'offerta." className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <ExternalLink size={15}/>Apri e modifica ciclo
              </Link>
              <span className="text-xs text-slate-600">Snapshot ciclo {row.codice || row.record_id}, rev. {row.rev ?? 1}. Per aggiornare l’offerta, riseleziona il prodotto.</span>
            </>}
          </div>

          <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
            <label className="flex w-24 shrink-0 flex-col gap-1 text-xs">
              <span>Codice articolo</span>
              <input disabled={locked} className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={String(row.codice ?? "")} onChange={(event) => editRow(index, "codice", event.target.value)}/>
            </label>
            <label className="flex min-w-0 max-w-[65ch] flex-[2_1_24rem] flex-col gap-1 text-xs">
              <span>Descrizione</span>
              <input disabled={locked} className="h-8 w-full min-w-0 rounded border px-2 text-sm disabled:bg-slate-100" value={String(row.descrizione ?? "")} title={String(row.descrizione ?? "")} onChange={(event) => editRow(index, "descrizione", event.target.value)}/>
            </label>
            {!cycle && <label className="flex w-24 shrink-0 flex-col gap-1 text-xs">
              <span>Lotto (pezzi)</span>
              <input disabled={locked} type="number" min="1" step="1" className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={row.lotto ?? ""} onChange={(event) => editRow(index, "lotto", event.target.value === "" ? "" : Number(event.target.value))}/>
            </label>}
            <label className="flex w-24 shrink-0 flex-col gap-1 text-xs" title="Si applica all’intero costo industriale standard del lotto, inclusa la quota di attrezzaggi e attrezzature.">
              <span>Spese gen. %</span>
              <input disabled={locked} type="number" min="0" step="0.1" className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={String(row.ricarico_costi_fissi_pct ?? "")} onChange={(event) => editRow(index, "ricarico_costi_fissi_pct", event.target.value === "" ? "" : Number(event.target.value))}/>
            </label>
            <label className="flex w-24 shrink-0 flex-col gap-1 text-xs">
              <span>Margine netto %</span>
              <input disabled={locked} type="number" min="0" max="99.99" step="0.1" className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={String(row.margine_netto_desiderato_pct ?? "")} onChange={(event) => editRow(index, "margine_netto_desiderato_pct", event.target.value === "" ? "" : Number(event.target.value))}/>
            </label>
            {!cycle && <label className="flex w-28 shrink-0 flex-col gap-1 text-xs">
              <span>Listino €</span>
              <input disabled={locked} type="number" min="0" step="0.01" className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={row.listino ?? ""} onChange={(event) => editRow(index, "listino", Number(event.target.value))}/>
            </label>}
            <label className="flex w-36 shrink-0 flex-col gap-1 text-xs">
              <span>Sconto cliente</span>
              <input disabled={locked} className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={row.sconto_base ?? ""} onChange={(event) => editRow(index, "sconto_base", event.target.value)}/>
            </label>
            <label className="flex w-24 shrink-0 flex-col gap-1 text-xs">
              <span>Sconto extra %</span>
              <input disabled={locked} type="number" min="0" max="99.99" step="0.1" className="h-8 w-full rounded border px-2 text-sm disabled:bg-slate-100" value={row.extra ?? 0} onChange={(event) => editRow(index, "extra", Number(event.target.value))}/>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            {price ? <>
              <span>Costo industriale standard €/pz: <b>€ {money(price.simulation.costo_standard)}<FormulaTooltip label="Costo industriale standard" formula={CALCULATION_FORMULAS.cycle.standardCost}/></b></span>
              <span>Lotto principale: <b>{Number(row.lotto).toLocaleString("it-IT")} pz</b></span>
              <span>Quota costi fissi €/pz: <b>€ {money(price.fixedCostPerPiece)}<FormulaTooltip label="Quota costi fissi per pezzo" formula={CALCULATION_FORMULAS.commercialOffer.fixedCostPerPiece}/></b></span>
              <span>Spese generali ({money(price.markupPercent)}%) €/pz: <b>€ {money(price.overheadPerPiece)}<FormulaTooltip label="Spese generali per pezzo" formula={CALCULATION_FORMULAS.commercialOffer.overheadPerPiece}/></b></span>
              <span>Costo pieno €/pz: <b>€ {money(price.fullCost)}<FormulaTooltip label="Costo pieno dell’offerta" formula={CALCULATION_FORMULAS.commercialOffer.fullCost}/></b></span>
              <span>Prezzo netto finale €/pz: <b className="text-emerald-800">€ {money(price.netPrice)}<FormulaTooltip label="Prezzo netto finale" formula={CALCULATION_FORMULAS.commercialOffer.finalNetPrice}/></b>{price.manualNetPrice != null && <small className="ml-1 text-slate-500">(calcolato: <del>€ {money(price.calculatedNetPrice)}</del>)</small>}</span>
              <span>Margine netto: <b>{money(price.actualMarginPercent)}%<FormulaTooltip label="Margine netto effettivo" formula={CALCULATION_FORMULAS.commercialOffer.actualMargin}/></b></span>
            </> : <p className="md:col-span-3 text-amber-800">Seleziona un prodotto dai Cicli Standard e verifica lotto, ricarico e margine.</p>}
          </div>

          {cycle && <details className="group overflow-hidden rounded-lg border bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Prezzi proposti per lotto</span>
                <span className="block text-xs text-slate-600">{lots.length} lotti disponibili · {selectedLots.length} inclusi nell’offerta{price ? ` · prezzo principale € ${money(price.netPrice)}/pz` : ""}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180"/>
            </summary>
            <div className="border-t p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Seleziona le quantità da presentare al cliente. I lotti aggiuntivi si calcolano sullo stesso ciclo.</p>
              {!locked && <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={"new-offer-lot-" + index}>Nuovo lotto aggiuntivo</label>
                <input id={"new-offer-lot-" + index} type="number" min="1" step="1" value={newLotDrafts[index] ?? ""} onChange={(event) => setNewLotDrafts((current) => ({ ...current, [index]: event.target.value }))} placeholder="Nuovo lotto pz" className="w-36 rounded border p-2 text-sm"/>
                <button type="button" onClick={() => addOfferLot(index)} className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm text-emerald-800"><Plus size={15}/>Aggiungi lotto</button>
              </div>}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="p-2 text-left">Lotto</th><th className="p-2 text-right">Costo industriale standard €/pz</th>
                  <th className="p-2 text-right">Costi fissi €/pz</th>
                  <th className="p-2 text-right">Spese generali €/pz</th>
                  <th className="p-2 text-right">Costo pieno €/pz</th>
                  <th className="p-2 text-right">Prezzo netto finale €/pz</th>
                  <th className="p-2 text-right">Margine netto effettivo</th>
                  <th className="p-2 text-right">Totale lotto</th>
                  {!locked && <th className="p-2 text-center">In offerta</th>}
                </tr></thead>
                <tbody>{lots.map((lot) => {
                  let simulationPrice = null;
                  try { simulationPrice = calculateOfferLotPrice(row, lot); } catch { /* Keep an invalid row visible for correction. */ }
                  const lotTerms = offerLotTerms(row, lot);
                  const manualNet = lotTerms.prezzo_netto_manuale;
                  const custom = (row.lotti_aggiuntivi ?? []).some((customLot) => Number(customLot) === lot) &&
                    !simulationsForOfferRow(row).some((simulation) => Number(simulation.lotto) === lot);
                  return <tr key={lot} className={selectedLots.includes(lot) ? "border-t bg-emerald-50" : "border-t"}>
                    <td className="p-2 font-medium">{lot.toLocaleString("it-IT")} pz</td>
                    <td className="p-2 text-right tabular-nums">€ {money(simulationPrice?.simulation.costo_standard)}<FormulaTooltip label={`Costo industriale standard per lotto ${lot}`} formula={CALCULATION_FORMULAS.cycle.standardCost}/></td>
                    <td className="p-2 text-right tabular-nums">€ {money(simulationPrice?.fixedCostPerPiece)}<FormulaTooltip label={`Costi fissi per pezzo al lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.fixedCostPerPiece}/></td>
                    <td className="p-2 text-right tabular-nums">€ {money(simulationPrice?.overheadPerPiece)}<FormulaTooltip label={`Spese generali per pezzo al lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.overheadPerPiece}/></td>
                    <td className="p-2 text-right tabular-nums">€ {money(simulationPrice?.fullCost)}<FormulaTooltip label={`Costo pieno per pezzo al lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.fullCost}/></td>
                    <td className="p-2 text-right tabular-nums">
                      <input aria-label={`Prezzo netto finale per lotto ${lot}`} disabled={locked} type="text" inputMode="decimal" className="w-28 rounded border p-1.5 text-right font-semibold disabled:bg-slate-100" value={manualNet == null ? (simulationPrice ? money(simulationPrice.calculatedNetPrice) : "") : String(manualNet)} onChange={(event) => editLotNetPrice(index, lot, event.target.value)}/><FormulaTooltip label={`Prezzo netto finale per lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.finalNetPrice}/>
                      {simulationPrice?.manualNetPrice != null && <div className="mt-1 text-xs text-slate-500">Calcolato: <del>€ {money(simulationPrice.calculatedNetPrice)}</del>{!locked && <button type="button" className="ml-1 text-emerald-800 underline" onClick={() => editLotNetPrice(index, lot, "")}>Ripristina</button>}</div>}
                    </td>
                    <td className="p-2 text-right tabular-nums">{simulationPrice ? `${money(simulationPrice.actualMarginPercent)}%` : "—"}<FormulaTooltip label={`Margine netto effettivo per lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.actualMargin}/></td>
                    <td className="p-2 text-right tabular-nums">€ {money((simulationPrice?.netPrice ?? 0) * lot)}<FormulaTooltip label={`Totale del lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.lotTotal}/></td>
                    {!locked && <td className="p-2 text-center">
                      <input type="checkbox" aria-label={"Includi lotto " + lot + " nell'offerta cliente"} checked={selectedLots.includes(lot)} onChange={(event) => selectLot(index, lot, event.target.checked)} className="h-4 w-4 accent-emerald-700"/>
                      {custom && <button type="button" aria-label={"Rimuovi lotto aggiuntivo " + lot} onClick={() => removeOfferLot(index, lot)} className="ml-2 text-xs text-red-700">Rimuovi</button>}
                    </td>}
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {selectedLots.length === 0 && <p className="mt-2 text-sm text-amber-800">Seleziona almeno un lotto per l’offerta cliente.</p>}
            <p className="mt-2 text-xs text-slate-500">Il prezzo calcolato è il valore iniziale. Puoi impostare un netto finale diverso per ogni lotto: il margine effettivo e i PDF si aggiornano di conseguenza.</p>
            </div>
          </details>}

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h4 className="font-semibold">Prezzi di listino per lotto</h4><p className="text-xs text-slate-500">Il listino viene calcolato separatamente sul netto proposto per ciascun lotto selezionato.</p></div>
              {!locked && <button type="button" onClick={() => generateListino(index)} disabled={!price || selectedLots.length === 0} className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-40"><FileText size={16}/>Genera listini selezionati</button>}
            </div>
            {cycle && <div className="overflow-x-auto rounded border">
              <table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Lotto selezionato</th><th className="p-2 text-right">Netto finale €/pz</th><th className="p-2 text-right">Listino €/pz</th><th className="p-2 text-right">Netto dopo sconto cliente €/pz</th><th className="p-2 text-right">Adeguamento manuale</th><th className="p-2 text-left">Esito listino</th></tr></thead>
                <tbody>{selectedLots.map((lot) => {
                  const terms = offerLotTerms(row, lot);
                  const listino = parseNumber(terms.listino);
                  const netAfterDiscount = (() => { try { return listino * discountFactor(combinedDiscount(row)); } catch { return 0; } })();
                  let proposedNet = 0;
                  let lotPriceForDiscount = null;
                  try { lotPriceForDiscount = calculateOfferLotPrice(row, lot); proposedNet = lotPriceForDiscount.netPrice; } catch { /* The row validation explains the error. */ }
                  let marketAdjustment: number | null = null;
                  if (lotPriceForDiscount?.manualNetPrice != null && netAfterDiscount > 0) {
                    try { marketAdjustment = additionalDiscountPercent(netAfterDiscount, proposedNet); } catch { /* The row validation explains the error. */ }
                  }
                  const current = generatedListinoIsCurrent(row, lot);
                  return <tr key={lot} className="border-t"><td className="p-2">{lot.toLocaleString("it-IT")} pz</td><td className="p-2 text-right">€ {money(proposedNet)}<FormulaTooltip label={`Prezzo netto finale per lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.finalNetPrice}/></td>
                    <td className="p-2 text-right"><input aria-label={"Prezzo di listino per lotto " + lot} disabled={locked} type="number" min="0" step="0.01" className="w-32 rounded border p-2 text-right disabled:bg-slate-100" value={terms.listino ?? ""} onChange={(event) => editLotListino(index, lot, event.target.value === "" ? "" : Number(event.target.value))}/></td>
                    <td className="p-2 text-right">€ {money(netAfterDiscount)}<FormulaTooltip label={`Netto dopo sconto cliente per lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.netAfterDiscount}/></td>
                    <td className="p-2 text-right">{marketAdjustment == null ? "—" : marketAdjustment >= 0 ? `${money(marketAdjustment)}% sconto` : `${money(Math.abs(marketAdjustment))}% maggiorazione`}<FormulaTooltip label={`Adeguamento manuale per lotto ${lot}`} formula={CALCULATION_FORMULAS.commercialOffer.additionalDiscount}/></td><td className={current ? "p-2 text-xs text-emerald-700" : "p-2 text-xs text-amber-700"}>{current ? "Allineato al netto" : "Da generare o aggiornare"}</td></tr>;
                })}</tbody>
              </table>
            </div>}
            {!cycle && <div className="flex flex-wrap items-center gap-3">
              {!locked && <button type="button" onClick={() => generateListino(index)} disabled={!price} className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-40"><FileText size={16}/>Genera prezzo di listino</button>}
              {row.listino_generato_per_netto != null && <span className={generatedListinoIsCurrent(row, Number(row.lotto)) ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>{generatedListinoIsCurrent(row, Number(row.lotto)) ? "Listino allineato al prezzo netto attuale." : "Prezzo o sconto cambiato: genera di nuovo il listino."}</span>}
            </div>}
          </div>
          {Boolean(row.data) && <p className="text-xs text-slate-500">I dati del ciclo sorgente e i costi del lotto restano salvati come snapshot nell’offerta.</p>}
        </section>;
      })}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><CreditCard size={18} aria-hidden="true"/>Pagamento</h2>
          <label className="flex flex-col text-sm gap-1"><span>Condizioni di pagamento</span><input disabled={locked} value={String(offer.pagamento ?? "")} onChange={(event) => edit("pagamento", event.target.value)} className="p-2 border rounded disabled:bg-slate-100"/></label>
        </section>
        <section className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Truck size={18} aria-hidden="true"/>Trasporto</h2>
          <label className="flex flex-col text-sm gap-1"><span>Condizioni di trasporto</span><input disabled={locked} value={String(offer.trasporto ?? "")} onChange={(event) => edit("trasporto", event.target.value)} className="p-2 border rounded disabled:bg-slate-100"/></label>
        </section>
      </div>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><StickyNote size={18} aria-hidden="true"/>Note</h2>
        <label className="flex flex-col text-sm gap-1">
          <span>Note interne</span><textarea disabled={locked} rows={3} value={String(offer.note ?? "")} onChange={(event) => edit("note", event.target.value)} className="p-2 border rounded disabled:bg-slate-100"/>
        </label>
        <label className="flex flex-col text-sm gap-1">
          <span>Note da mostrare al cliente</span><textarea disabled={locked} rows={2} value={String(offer.note_cliente ?? "")} onChange={(event) => edit("note_cliente", event.target.value)} className="p-2 border rounded disabled:bg-slate-100"/>
        </label>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Esportazione PDF</h2>
        <p className="text-sm text-slate-600">Il documento interno include i costi del ciclo e tutti i lotti calcolati. Il documento cliente riporta tutti i lotti selezionati e il relativo prezzo netto o listino scontato.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => exportPdf("internal")} className="inline-flex items-center gap-2 rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"><Printer size={16}/>Esporta PDF interno</button>
          <label className="flex items-center gap-2 text-sm"><span>Prezzo cliente</span><select value={pricePresentation} onChange={(event) => setPricePresentation(event.target.value as CustomerPricePresentation)} className="rounded border px-2 py-2">
            <option value="netto">Prezzo netto</option><option value="listino_sconto">Listino con sconto</option>
          </select></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideDocumentTotal} onChange={(event) => setHideDocumentTotal(event.target.checked)} />
            <span>Nascondi totale documento nel PDF cliente</span>
          </label>
          <button type="button" onClick={() => exportPdf("customer")} className="inline-flex items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"><FileText size={16}/>Esporta PDF cliente</button>
        </div>
      </section>

      {cyclePickerRow !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !selectingCycle) setCyclePickerRow(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="standard-cycle-picker-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
            <div><h2 id="standard-cycle-picker-title" className="text-lg font-semibold">Scegli un prodotto dai Cicli Standard</h2><p className="mt-1 text-sm text-slate-600">Costi e dati tecnici restano salvati come fotografia nell’offerta.</p></div>
            <button type="button" aria-label="Chiudi selezione cicli" disabled={selectingCycle} onClick={() => setCyclePickerRow(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={18}/></button>
          </header>
          <div className="border-b p-4"><label className="relative block">
            <span className="sr-only">Cerca nei cicli standard</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input autoFocus type="search" value={cycleSearch} onChange={(event) => { setCycleSearch(event.target.value); setCyclePage(1); }} placeholder="Cerca per codice, descrizione o cliente..." className="w-full rounded border py-2 pl-9 pr-3 text-sm"/>
          </label></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cycleDirectory.isLoading && <p className="p-6 text-center text-sm text-slate-500">Caricamento cicli...</p>}
            {cycleDirectory.isError && <p role="alert" className="p-6 text-sm text-red-700">Impossibile caricare i cicli: {cycleDirectory.error.message}</p>}
            {!cycleDirectory.isLoading && !cycleDirectory.isError && cycleDirectory.data?.groups.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nessun ciclo standard trovato.</p>}
            <ul className="divide-y">{cycleDirectory.data?.groups.map((group) => {
              const cycle = group.latest;
              return <li key={group.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-semibold text-slate-900">{cycle.code || "(senza codice)"} <span className="font-normal text-slate-500">· rev. {cycle.rev ?? 1}</span></p>
                  <p className="break-words text-sm text-slate-700">{cycle.description || "Descrizione non presente"}</p>
                  <p className="mt-1 text-xs text-slate-500">{cycle.client || "Cliente non indicato"} · Lotto ciclo: {cycle.lot || "—"} · Costo industriale standard: € {money(cycle.standardCost)}<FormulaTooltip label="Costo industriale standard" formula={CALCULATION_FORMULAS.cycle.standardCost}/> · Prezzo minimo ciclo: € {money(cycle.minimumPrice)}<FormulaTooltip label="Prezzo minimo del ciclo" formula={CALCULATION_FORMULAS.cycle.minimumPrice}/></p></div>
                <button type="button" disabled={selectingCycle} onClick={() => void chooseStandardCycle(cycle.id)} className="shrink-0 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{selectingCycle ? "Caricamento..." : "Seleziona"}</button>
              </li>;
            })}</ul>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t p-3 sm:px-4">
            <span className="text-xs text-slate-500">{cycleDirectory.data ? `${cycleDirectory.data.total} prodotti` : ""}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={cyclePage <= 1 || cycleDirectory.isFetching} onClick={() => setCyclePage((page) => Math.max(1, page - 1))} className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft size={16}/>Precedente</button>
              <span className="text-xs tabular-nums text-slate-600">{cycleDirectory.data?.page ?? cyclePage} / {Math.max(1, Math.ceil((cycleDirectory.data?.total ?? 0) / 25))}</span>
              <button type="button" disabled={!cycleDirectory.data || cyclePage >= Math.ceil(cycleDirectory.data.total / 25) || cycleDirectory.isFetching} onClick={() => setCyclePage((page) => page + 1)} className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-40">Successiva<ChevronRight size={16}/></button>
            </div>
          </footer>
        </section>
      </div>}
    </div>
  </Layout>;
}
