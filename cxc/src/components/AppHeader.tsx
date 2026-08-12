"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useBackdropDismiss, useEscapeClose } from "@/lib/hooks/useModalDismiss";
import FGLogo from "@/components/FGLogo";
import SearchBar, { SEARCH_ROLES } from "@/components/SearchBar";
import NotificationCenter from "@/components/NotificationCenter";
import { getModuleColor } from "@/lib/moduleColors";
import { ALL_MODULES, getVisibleGroups } from "@/lib/modules";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
 contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
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

  const visibleNav = userRole ? getVisibleGroups(userRole, fgModules) : [];
  // Roles fuera de /api/search (ej. gerente_acs): ocultar también el botón de
  // lupa móvil — abriría un overlay vacío (SearchBar se auto-oculta).
  const canSearch = !userRole || SEARCH_ROLES.includes(userRole);

  function handleLogout() {
    fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    sessionStorage.clear();
    router.push("/");
  }

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll when drawer open (hook compartido con ref-count).
  useBodyScrollLock(drawerOpen);

  // El drawer de módulos se cierra con clic fuera (sobre el fondo oscuro) y con
  // Escape, igual que el resto de los modales del sistema.
  const cerrarDrawer = useCallback(() => setDrawerOpen(false), []);
  const backdropDrawer = useBackdropDismiss(cerrarDrawer);
  useEscapeClose(drawerOpen, cerrarDrawer);

  const moduleColor = getModuleColor(pathname);
  const currentNav = ALL_MODULES.find(m => moduleColor && pathname.startsWith(m.href));

  return (
    <>
      <div className={`w-full border-b bg-white sticky top-0 z-10 ${moduleColor ? moduleColor.border : "border-gray-200"}`} style={moduleColor ? { borderBottomWidth: "2px" } : undefined}>
        <div className="h-11 flex items-center px-4 sm:px-6 gap-3">
          <FGLogo variant="icon" theme="light" size={22} />
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-1 min-w-0">
            {currentNav && (() => {
              const Icon = currentNav.icon;
              return <Icon size={14} strokeWidth={1.5} className={`flex-shrink-0 ${moduleColor!.text}`} />;
            })()}
            {/* El nombre del módulo solo se pinta acá en móvil. En desktop lo
                dice el breadcrumb de abajo, así que repetirlo en la barra era
                ruido (nombre 3×: chip + breadcrumb + h1). En móvil no hay
                breadcrumb, y esta barra es sticky: al hacer scroll es lo único
                que recuerda en qué módulo estás. */}
            <span className="truncate sm:hidden">{module}</span>
            {/* breadcrumbs inline removidos — fuente única: breadcrumb bar inferior */}
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
                <div className="text-xs text-gray-400 leading-tight">{ROLE_LABELS[userRole] || userRole}</div>
              </div>
              <button onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className="inline-flex h-11 w-11 items-center justify-center text-gray-300 hover:text-gray-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
              <div className="w-px h-4 bg-gray-200" />
            </div>
          )}
          {/* Mobile: search + notification + hamburger.
              Los tres son 44×44 reales (regla de la casa para el tacto en
              iPhone): este header sale en las 22 páginas, así que cada píxel
              que falte acá se multiplica por toda la app. La campana decide su
              propio tamaño y ya no admite uno chico — ver NotificationCenter. */}
          <div className="sm:hidden"><NotificationCenter /></div>
          {canSearch && (
            <button onClick={() => setMobileSearchOpen(true)} aria-label="Buscar" className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          )}
          <button onClick={() => setDrawerOpen(true)} aria-label="Abrir menú de módulos" className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
        {/* Breadcrumb bar único — desktop only, siempre visible. hideBreadcrumbBar queda como escape hatch.
            Todos los segmentos excepto el último son clicables. El último (página actual) es texto plano. */}
        {!hideBreadcrumbBar && (() => {
          const moduleBaseHref = pathname.split("/").slice(0, 2).join("/") || "/home";
          const segments: { label: string; onClick?: () => void }[] = [
            { label: "Inicio", onClick: () => router.push("/home") },
            { label: module, onClick: () => router.push(moduleBaseHref) },
            ...(breadcrumbs ?? []).map(b => ({ label: b.label, onClick: b.onClick })),
          ];
          const lastIndex = segments.length - 1;
          return (
            <div className="hidden sm:flex flex-wrap px-6 py-1 text-xs text-gray-400 items-center gap-1">
              {segments.map((seg, i) => {
                const isLast = i === lastIndex;
                return (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span>›</span>}
                    {isLast || !seg.onClick ? (
                      <span className="text-gray-600 font-medium cursor-default">{seg.label}</span>
                    ) : (
                      <button onClick={seg.onClick} className="-my-[13px] inline-flex min-h-[44px] min-w-[44px] items-center justify-center hover:text-gray-700 hover:underline transition cursor-pointer">{seg.label}</button>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })()}
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
          <div {...backdropDrawer} className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* "Módulos" queda `sr-only`: el cajón se abre desde el botón de
                menú y adentro está la lista de módulos, a la vista. */}
            <div className="flex items-center justify-end px-5 h-14 border-b border-gray-200">
              <span className="sr-only">Módulos</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" className="min-w-[44px] min-h-[44px] flex items-center justify-center active:bg-gray-100 rounded-md transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {userName && (
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium">{userName[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{userName}</div>
                  <div className="text-xs text-gray-400">{ROLE_LABELS[userRole] || userRole}</div>
                </div>
                {/* El drawer es 100% móvil: acá no hay mouse, solo dedo. El -mr-2
                    recupera el aire que suma el área táctil para que el botón siga
                    alineado con el borde de la fila. */}
                <button onClick={() => { handleLogout(); setDrawerOpen(false); }} className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-xs text-gray-400 hover:text-red-600 transition">Salir</button>
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
              {visibleNav.map(g => {
                const active = pathname === g.href || pathname.startsWith(g.href + "/");
                const Icon = g.icon;
                return (
                  <button key={g.key} onClick={() => { router.push(g.href); setDrawerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-all ${active ? "bg-gray-50 text-black font-medium" : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"}`}>
                    <Icon size={16} strokeWidth={1.5} />
                    {g.label}
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
