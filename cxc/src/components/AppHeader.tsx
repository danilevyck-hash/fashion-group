"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import SearchBar from "@/components/SearchBar";
import NotificationCenter from "@/components/NotificationCenter";
import { getModuleColor } from "@/lib/moduleColors";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
  director: "Director", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
};

const NAV_MODULES = [
  { key: "cxc", label: "CXC", href: "/admin", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  { key: "guias", label: "Guías", href: "/guias", icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7" },
  { key: "cheques", label: "Cheques", href: "/cheques", icon: "M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z" },
  { key: "caja", label: "Caja", href: "/caja", icon: "M21 4H3a1 1 0 00-1 1v14a1 1 0 001 1h18a1 1 0 001-1V5a1 1 0 00-1-1zM1 10h22" },
  { key: "directorio", label: "Directorio", href: "/directorio", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" },
  { key: "reclamos", label: "Reclamos", href: "/reclamos", icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01" },
  { key: "prestamos", label: "Préstamos", href: "/prestamos", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z" },
  { key: "ventas", label: "Ventas", href: "/ventas", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { key: "packing-lists", label: "Packing Lists", href: "/packing-lists", icon: "M3 3h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2z M1 9h22 M9 21V9" },
  { key: "camisetas", label: "Camisetas", href: "/camisetas", icon: "M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" },
  { key: "reebok", label: "Reebok", href: "/catalogo/reebok", icon: "M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12V0L22 4l-4 4" },
];

interface AppHeaderProps {
  module: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
}

export default function AppHeader({ module, breadcrumbs }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    setUserRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  function handleLogout() {
    fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    sessionStorage.clear();
    router.push("/");
  }

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const moduleColor = getModuleColor(pathname);
  const currentNav = NAV_MODULES.find(m => moduleColor && pathname.startsWith(m.href));

  return (
    <>
      <div className={`w-full border-b bg-white sticky top-0 z-10 ${moduleColor ? moduleColor.border : "border-gray-200"}`} style={moduleColor ? { borderBottomWidth: "2px" } : undefined}>
        <div className="h-11 flex items-center px-4 sm:px-6 gap-3">
          <FGLogo variant="icon" theme="light" size={22} />
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-1 min-w-0">
            {currentNav && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 ${moduleColor!.text}`}><path d={currentNav.icon}/></svg>
            )}
            <span className="truncate">{module}</span>
            {breadcrumbs?.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-gray-300">›</span>
                {b.onClick ? (
                  <button onClick={b.onClick} className="hover:text-black transition truncate">{b.label}</button>
                ) : (
                  <span className="text-gray-800 font-medium truncate">{b.label}</span>
                )}
              </span>
            ))}
          </div>
          <div className="hidden sm:block">
            <SearchBar compact />
          </div>
          <div className="hidden sm:block"><NotificationCenter /></div>
          {/* Desktop: user info */}
          {userName && (
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <div className="text-sm text-gray-700 font-medium leading-tight">{userName.split(" ")[0]}</div>
                <div className="text-[10px] text-gray-400 leading-tight">{ROLE_LABELS[userRole] || userRole}</div>
              </div>
              <button onClick={handleLogout} title="Cerrar sesión" className="text-gray-300 hover:text-gray-600 transition p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
              <div className="w-px h-4 bg-gray-200" />
            </div>
          )}
          {/* Desktop: home button */}
          <button
            onClick={() => router.push("/home")}
            className="hidden sm:flex text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1 rounded-full transition flex-shrink-0 items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Inicio
          </button>
          {/* Mobile: search + notification + hamburger */}
          <div className="sm:hidden"><NotificationCenter /></div>
          <button onClick={() => setMobileSearchOpen(true)} className="sm:hidden w-10 h-10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button onClick={() => setDrawerOpen(true)} className="sm:hidden w-10 h-10 flex items-center justify-center -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
        {/* Breadcrumb bar — hidden on mobile */}
        <div className="hidden sm:flex flex-wrap px-6 py-1 text-[11px] text-gray-400 items-center gap-1">
          <button onClick={() => router.push("/home")} className="hover:text-gray-700 transition">Inicio</button>
          <span>›</span>
          <span className="text-gray-500">{module}</span>
          {breadcrumbs?.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>›</span>
              {b.onClick ? (
                <button onClick={b.onClick} className="hover:text-gray-700 transition">{b.label}</button>
              ) : (
                <span className="text-gray-500">{b.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-white sm:hidden">
          <SearchBar fullScreen onClose={() => setMobileSearchOpen(false)} />
        </div>
      )}

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 h-14 border-b border-gray-200">
              <span className="text-sm font-medium">Módulos</span>
              <button onClick={() => setDrawerOpen(false)} className="w-10 h-10 flex items-center justify-center active:bg-gray-100 rounded-md transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {userName && (
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium">{userName[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{userName}</div>
                  <div className="text-[10px] text-gray-400">{ROLE_LABELS[userRole] || userRole}</div>
                </div>
                <button onClick={() => { handleLogout(); setDrawerOpen(false); }} className="text-xs text-gray-400 hover:text-red-600 transition">Salir</button>
              </div>
            )}
            <nav className="flex-1 overflow-y-auto py-2">
              <button onClick={() => { router.push("/home"); setDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                Inicio
              </button>
              {NAV_MODULES.map(m => {
                const active = pathname.startsWith(m.href);
                return (
                  <button key={m.key} onClick={() => { router.push(m.href); setDrawerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-all ${active ? "bg-gray-50 text-black font-medium" : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon}/></svg>
                    {m.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
