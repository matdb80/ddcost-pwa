import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  Factory,
  Wrench,
  Scissors,
  FileText,
  Briefcase,
  LogOut,
  User,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/cicli", label: "Cicli Standard", icon: Factory },
  { path: "/bandelle-t", label: "Bandelle a T", icon: Wrench },
  { path: "/bandelle-veneta", label: "Bandelle Veneta", icon: Scissors },
  { path: "/preventivi", label: "Preventivi", icon: FileText },
  { path: "/offerte", label: "Offerte Commerciali", icon: Briefcase },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true });
  const location = useLocation();

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-tight">DDCost</h1>
          <p className="text-xs text-slate-400 mt-1">Preventivatore Speciali</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || "Utente"}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Esci
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {navItems.find((n) => n.path === location.pathname)?.label || ""}
          </h2>
          <div className="text-xs text-slate-400">
            v2.0 PWA
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
