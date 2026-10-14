import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  Home, Factory, Wrench, Scissors, FileText, Briefcase,
  LogOut, Download, DatabaseZap, User, ClipboardList,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import FloatingFeedbackButton from "@/components/feedback/FloatingFeedbackButton";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/cicli", label: "Cicli Standard", icon: Factory },
  { path: "/bandelle-t", label: "Bandelle a T", icon: Wrench },
  { path: "/bandelle-veneta", label: "Bandelle Veneta", icon: Scissors },
  { path: "/preventivi", label: "Preventivi Speciali Unatantum", icon: FileText },
  { path: "/offerte", label: "Offerte Commerciali", icon: Briefcase },
  { path: "/importa-storico", label: "Importa storico", icon: DatabaseZap },
];

const adminNavItems = [
  { path: "/segnalazioni", label: "Registro Segnalazioni", icon: ClipboardList },
];

const SIDEBAR_STORAGE_KEY = "ddcost.sidebar.collapsed";

/** Layout is remounted on navigation: persist the state in local browser storage. */
function initialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const setting = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (setting === "1" || setting === "0") return setting === "1";
  } catch { /* Browsers can disable localStorage; manual toggle still works. */ }
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true });
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0"); }
    catch { /* Retain the local UI state even without storage. */ }
  };

  const navLink = (item: (typeof navItems)[number]) => {
    const active = item.path === "/"
      ? location.pathname === "/"
      : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
    const Icon = item.icon;
    return (
      <Link
        key={item.path}
        to={item.path}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-10 items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
        } ${active ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="min-w-0">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Compressed mode becomes an icon rail; full sidebar is always recoverable. */}
      <aside
        id="ddcost-sidebar"
        aria-label="Navigazione principale"
        className={`shrink-0 bg-slate-900 text-white flex flex-col transition-[width] duration-200 ease-in-out ${collapsed ? "w-16" : "w-64"}`}
      >
        <div className={`border-b border-slate-700 ${collapsed ? "p-2" : "px-4 py-5"}`}>
          <div className={`flex ${collapsed ? "flex-col items-center gap-1" : "items-center justify-between gap-2"}`}>
            <div className={collapsed ? "text-center" : "min-w-0"}>
              <h1 className={collapsed ? "text-sm font-bold" : "text-xl font-bold tracking-tight"}>
                {collapsed ? "DD" : "DDCost"}
              </h1>
              {!collapsed && <p className="text-xs text-slate-400 mt-1">Preventivatore Speciali</p>}
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-controls="ddcost-sidebar"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Espandi menu laterale" : "Riduci menu laterale"}
              title={collapsed ? "Espandi menu laterale" : "Riduci menu laterale"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <nav className={`flex-1 space-y-1 overflow-x-hidden overflow-y-auto ${collapsed ? "p-2" : "p-4"}`}>
          {navItems.map(navLink)}
          {user?.role === "admin" && (
            <div className="pt-3 mt-3 border-t border-slate-700">
              {!collapsed && (
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Amministrazione
                </p>
              )}
              {adminNavItems.map(navLink)}
            </div>
          )}
        </nav>

        <div className={`border-t border-slate-700 ${collapsed ? "p-2" : "p-4"}`}>
          <a
            href="/api/backup/download"
            title="Scarica una copia completa dei dati DDCost"
            aria-label={collapsed ? "Esporta backup" : undefined}
            className={`flex min-h-10 items-center rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"}`}
          >
            <Download className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Esporta backup</span>}
          </a>
        </div>

        <div className={`border-t border-slate-700 ${collapsed ? "p-2" : "p-4"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center mb-2" : "gap-3 mb-3"}`}>
            <div
              className="w-8 h-8 shrink-0 rounded-full bg-emerald-600 flex items-center justify-center"
              title={collapsed ? (user?.name || "Utente") : undefined}
            >
              <User className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "Utente"}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email || ""}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Esci" : undefined}
            aria-label={collapsed ? "Esci" : undefined}
            className={`flex min-h-9 items-center rounded-lg text-sm text-slate-400 hover:text-white transition-colors ${collapsed ? "w-full justify-center" : "gap-2 px-2"}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Esci</span>}
          </button>
        </div>
      </aside>

      {/* Main area grows when the sidebar is compact. */}
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 justify-between gap-2">
          <h2 className="text-base md:text-lg font-semibold text-slate-800 truncate">
            {navItems.find(n => n.path === location.pathname ||
              (n.path !== "/" && location.pathname.startsWith(n.path + "/")))?.label ||
              adminNavItems.find(n => n.path === location.pathname)?.label || ""}
          </h2>
          <div className="text-xs text-slate-400 shrink-0">v2.0 PWA</div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto p-3 md:p-6">{children}</div>
      </main>

      <FloatingFeedbackButton />
    </div>
  );
}
