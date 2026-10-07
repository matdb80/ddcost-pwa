import { Link } from "react-router";
import Layout from "@/components/Layout";
import {
  Factory,
  Wrench,
  Scissors,
  FileText,
  Briefcase,
  TrendingUp,
  Database,
  Globe,
} from "lucide-react";

const cards = [
  {
    path: "/cicli",
    title: "Cicli Standard",
    desc: "Determinazione cicli standard, distinta costi, simulazione lotti e prezzi minimi",
    icon: Factory,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconBg: "bg-emerald-100",
  },
  {
    path: "/bandelle-t",
    title: "Bandelle a T",
    desc: "Calcolo prezzi per bandelle a T con occhio standard, decentrato o zanca a filo",
    icon: Wrench,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    iconBg: "bg-blue-100",
  },
  {
    path: "/bandelle-veneta",
    title: "Bandelle Veneta",
    desc: "Calcolo prezzi per scuri alla veneta con misure standard e personalizzate",
    icon: Scissors,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    iconBg: "bg-amber-100",
  },
  {
    path: "/preventivi",
    title: "Preventivi Unatantum",
    desc: "Prezzo per articolo unatantum: testata, prodotti, riepilogo e archivio",
    icon: FileText,
    color: "bg-violet-50 text-violet-700 border-violet-200",
    iconBg: "bg-violet-100",
  },
  {
    path: "/offerte",
    title: "Offerte Commerciali",
    desc: "Gestione offerte commerciali con ricarichi, sconti e marginalità",
    icon: Briefcase,
    color: "bg-rose-50 text-rose-700 border-rose-200",
    iconBg: "bg-rose-100",
  },
];

export default function Home() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Benvenuto in DDCost
          </h1>
          <p className="text-slate-500">
            Scegli una funzione per iniziare il calcolo dei costi e dei preventivi.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.path}
                to={card.path}
                className={`block p-5 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 ${card.color}`}
              >
                <div className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-base mb-1">{card.title}</h3>
                <p className="text-sm opacity-80 leading-relaxed">{card.desc}</p>
              </Link>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600" />
            Vantaggi della versione online
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-700">Dati sempre sincronizzati</p>
                <p className="text-xs mt-0.5">Niente più conflitti di file su OneDrive. Tutti i tuoi dati sono sul cloud.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-700">Accesso da qualsiasi dispositivo</p>
                <p className="text-xs mt-0.5">PC, tablet, smartphone. Basta un browser.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-700">Aggiornamenti automatici</p>
                <p className="text-xs mt-0.5">Non devi più scaricare e ricompilare. La app si aggiorna da sola.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
