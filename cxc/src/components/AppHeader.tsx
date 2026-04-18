"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import SearchBar from "@/components/SearchBar";
import NotificationCenter from "@/components/NotificationCenter";
import { getModuleColor } from "@/lib/moduleColors";
import { ALL_MODULES, getVisibleModules } from "@/lib/modules";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
  director: "Director", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
};

interface AppHeaderProps {
  module: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  hideBreadcrumbBar?: boolean;
}

export default function AppHeader({ module, breadcrumbs, hideBreadcrumbBar }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);

  useEffect(() => {
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, []);

  const visibleNav = userRole ? getVisibleModules(userRole, fgModules) : [];

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
  const currentNav = ALL_MODULES.find(m => moduleColor && pathname.startsWith(m.href));

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
        {/* Breadcrumb bar — hidden on mobile, opt-out via hideBreadcrumbBar for root module pages */}
        {!hideBreadcrumbBar && (
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
        )}
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
              {visibleNav.map(m => {
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
