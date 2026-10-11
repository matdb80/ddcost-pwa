import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  Search,
  Trash2,
  RotateCcw,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 25;

export default function CicliPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showDeleted, setShowDeleted] = useState(false);

  const { data, isLoading, refetch } = trpc.cycle.list.useQuery({
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
    includeDeleted: showDeleted,
  });

  const deleteCycle = trpc.cycle.delete.useMutation({ onSuccess: () => refetch() });
  const restoreCycle = trpc.cycle.restore.useMutation({ onSuccess: () => refetch() });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const fmt = (v: string | number | null | undefined) => {
    if (v == null) return "-";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return String(v);
    return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isDeleted = (item: { deleted?: number | null }) => {
    return item.deleted === 1;
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca codice, descrizione, cliente..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Mostra eliminati
            </label>
            <Link
              to="/cicli/new"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuovo Ciclo
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Codice</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Descrizione</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Lotto</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Rev.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Costo Std.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Prezzo Min.</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mx-auto" />
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Nessun ciclo trovato.
                  </td>
                </tr>
              )}
              {items.map((c) => {
                const deleted = isDeleted(c);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-100 ${deleted ? "bg-red-50 opacity-60" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/cicli/${c.id}`}
                        className="font-medium text-slate-800 hover:text-emerald-600"
                      >
                        {c.code}
                        {deleted && (
                          <span className="ml-2 text-xs text-red-500 font-normal">(eliminato)</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.description}</td>
                    <td className="px-4 py-3 text-slate-600">{c.client}</td>
                    <td className="px-4 py-3 text-slate-600">{c.lot}</td>
                    <td className="px-4 py-3 text-slate-500">{c.rev}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {c.standardCost ? `€ ${fmt(c.standardCost)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {c.minimumPrice ? `€ ${fmt(c.minimumPrice)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {!deleted && (
                          <>
                            <Link
                              to={`/cicli/${c.id}`}
                              className="text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Modifica"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => {
                                if (confirm("Eliminare questo ciclo? (potrà essere recuperato)")) {
                                  c.id && deleteCycle.mutate({ id: c.id });
                                }
                              }}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              title="Elimina"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {deleted && (
                          <button
                            onClick={() => {
                              if (confirm("Recuperare questo ciclo?")) {
                                c.id && restoreCycle.mutate({ id: c.id });
                              }
                            }}
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Recupera"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-slate-500">
              {total} cicli totali — Pagina {page} di {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
