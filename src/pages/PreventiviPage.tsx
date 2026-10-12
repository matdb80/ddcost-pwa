import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
import { Link } from "react-router";
import { Plus, Search } from "lucide-react";

export default function PreventiviPage() {
  const [search, setSearch] = useState("");
  const { data: quotes } = trpc.quote.list.useQuery({ search, limit: 100 });


  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca preventivo..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link
            to="/preventivi/new"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuovo Preventivo
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Riferimento</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Rev.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Totale</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {quotes?.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{q.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800"><Link className="text-emerald-700 hover:underline" to={`/preventivi/${q.id}`}>{q.client || "(senza cliente)"}</Link></td>
                  <td className="px-4 py-3 text-slate-600">{q.reference}</td>
                  <td className="px-4 py-3 text-slate-500">{q.rev}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {q.totalFinal != null ? `€ ${Number(q.totalFinal).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link className="text-emerald-700 hover:underline" to={`/preventivi/${q.id}`}>Apri / Modifica</Link>
                  </td>
                </tr>
              ))}
              {(!quotes || quotes.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Nessun preventivo trovato. Crea il tuo primo preventivo con il pulsante in alto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
