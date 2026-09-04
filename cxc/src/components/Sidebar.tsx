"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import FGLogo from "@/components/FGLogo";
import { Home, ChevronRight } from "lucide-react";
import {
  ALL_MODULES, GROUPS, getVisibleGroups, getModulesInGroup,
  type AppGroup, type AppModule,
} from "@/lib/modules";
import { useSidebarCollapsed, writeSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { recordModuleClick } from "@/lib/module-frequents";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
 contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
};

const PUBLIC_PATH_PREFIXES = ["/catalogo-publico", "/pedido-reebok"];

// Acordeón EXCLUSIVO: un solo grupo abierto a la vez. Persistencia simple
// (no crítica) del grupo abierto.
const OPEN_GROUP_KEY = "fg_sidebar_open_group";

function readOpenGroup(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(OPEN_GROUP_KEY) || null;
}

function writeOpenGroup(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key) window.localStorage.setItem(OPEN_GROUP_KEY, key);
  else window.localStorage.removeItem(OPEN_GROUP_KEY);
}

/** Devuelve la key del grupo activo para una pathname dada, o null si estamos en /home u otra ruta neutra. */
function activeGroupForPath(pathname: string): string | null {
  if (!pathname || pathname === "/home" || pathname === "/") return null;
  // Match directo a la página de grupo (ruta dinámica /g/[grupo]).
  const direct = GROUPS.find(
    g => pathname === g.href || pathname.startsWith(g.href + "/")
  );
  if (direct) return direct.key;
  // Match vía el href del módulo, MÁS ESPECÍFICO (href más largo gana). Evita
  // que /admin/usuarios o /admin/data-health (grupo "sistema") resalten CXC
  // ("/admin", grupo "ventas") solo por compartir prefijo.
  let group: string | null = null;
  let bestLen = -1;
  for (const m of ALL_MODULES) {
    if ((pathname === m.href || pathname.startsWith(m.href + "/")) && m.href.length > bestLen) {
      group = m.group;
      bestLen = m.href.length;
    }
  }
  return group;
}

/** Key del módulo hijo activo dentro de un grupo: match por href MÁS específico
 *  (evita doble-resaltado entre /admin y /admin/usuarios, etc.). */
function activeChildKeyFor(children: AppModule[], pathname: string): string | null {
  let key: string | null = null;
  let bestLen = -1;
  for (const m of children) {
    if ((pathname === m.href || pathname.startsWith(m.href + "/")) && m.href.length > bestLen) {
      key = m.key;
      bestLen = m.href.length;
    }
  }
  return key;
}

/** Flyout del sidebar COLAPSADO: panel flotante a la derecha del ícono de grupo
 *  con los módulos hijos (ícono + label). Position fixed para no ser recortado
 *  por el overflow del nav; anclado al top del ícono de grupo (left = ancho del
 *  rail colapsado, w-16 = 64px). */
function CollapsedFlyout({
  group, top, role, fgModules, pathname, onClose,
}: {
  group: AppGroup;
  top: number;
  role: string;
  fgModules: string[] | null;
  pathname: string;
  onClose: () => void;
}) {
  const children = getModulesInGroup(group.key, role, fgModules);
  const activeChildKey = activeChildKeyFor(children, pathname);
  return (
    <div
      className="fixed z-50 ml-1 motion-reduce:animate-none animate-in fade-in-0 slide-in-from-left-1 duration-150"
      style={{ top, left: 64 }}
    >
      <div className="min-w-[12rem] max-h-[70vh] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
        <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
          {group.label}
        </p>
        {children.map((m) => {
          const MIcon = m.icon;
          const active = m.key === activeChildKey;
          return (
            <Link
              key={m.key}
              href={m.href}
              onClick={() => {
                recordModuleClick(m.key, typeof window !== "undefined" ? sessionStorage.getItem("fg_user_name") : null);
                onClose();
              }}
              title={m.label}
              className={`w-full flex min-h-[44px] items-center gap-2.5 px-3 text-[13px] transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <MIcon size={14} strokeWidth={1.5} className="flex-shrink-0" />
              <span className="truncate text-left">{m.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const collapsed = useSidebarCollapsed();

  useEffect(() => {
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    writeSidebarCollapsed(!collapsed);
  }, [collapsed]);

  const activeGroup = activeGroupForPath(pathname);

  // Estado del acordeón EXCLUSIVO: un solo grupo abierto. Init = grupo activo,
  // o el último persistido si estamos en una ruta neutra (/home). El grupo
  // activo se abre al navegar (cierra los demás). Hooks ANTES de early returns.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useEffect(() => {
    setOpenGroup(activeGroup ?? readOpenGroup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);
  const toggleGroup = useCallback((key: string) => {
    setOpenGroup(prev => {
      const next = prev === key ? null : key;
      writeOpenGroup(next);
      return next;
    });
  }, []);

  // Flyout del rail colapsado (acordeón exclusivo también acá: un solo grupo).
  // No se auto-abre (a diferencia del acordeón expandido) para no popear un
  // panel flotante al cargar. `top` = posición del ícono de grupo clickeado.
  const asideRef = useRef<HTMLElement>(null);
  const [flyout, setFlyout] = useState<{ key: string; top: number } | null>(null);
  // Cerrar el flyout al navegar o al alternar colapsado/expandido.
  useEffect(() => { setFlyout(null); }, [pathname, collapsed]);
  // Cerrar al hacer click fuera del sidebar. Los clicks dentro del aside
  // (íconos de grupo / items del flyout) los maneja su propio onClick.
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) setFlyout(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [flyout]);

  if (pathname === "/" || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p))) return null;
  if (!userRole) return null;

  const visibleGroups = getVisibleGroups(userRole, fgModules);

  async function handleLogout() {
    // Se ESPERA la revocación antes de navegar (3-sep-2026): la pantalla de
    // login reanuda la sesión si la cookie sigue viva, así que un DELETE
    // fire-and-forget podía perder la carrera y volver a meter al usuario.
    try { await fetch("/api/auth", { method: "DELETE" }); } catch { /* sin red: igual se sale localmente */ }
    sessionStorage.clear();
    router.push("/");
  }

  const width = collapsed ? "w-16" : "w-56";
  const homeActive = pathname === "/home";

  return (
    <aside
      ref={asideRef}
      className={`hidden md:flex fixed left-0 top-0 h-screen ${width} bg-white border-r border-gray-200 flex-col z-20 transition-[width] duration-200 ease-out`}
    >
      {/* Header: logo a la izquierda, toggle SIEMPRE en la esquina superior
          derecha (centrado vertical) en ambos estados — antes el toggle saltaba
          a una fila separada centrada al colapsar. */}
      <div
        className={`h-[57px] border-b border-gray-200 flex items-center justify-between ${
          collapsed ? "px-1.5" : "px-5"
        }`}
      >
        {/* El logo es un ENLACE a /home, así que va a 44 de alto. Sale gratis:
            la fila del encabezado ya mide 57 px. */}
        <Link
          href="/home"
          className="flex min-h-[44px] items-center gap-2 hover:opacity-70 transition min-w-0"
          title={collapsed ? "Fashion Group" : undefined}
        >
          <FGLogo variant="icon" theme="light" size={22} />
          {!collapsed && (
            <span className="text-sm font-medium text-gray-800 truncate">
              Fashion Group
            </span>
          )}
        </Link>
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          title={collapsed ? "Expandir" : "Colapsar"}
          /* ⚠️ 44×44 SOLO expandida, y está medido: colapsada la barra mide
             64 px y con `px-1.5` quedan 52 útiles — el logo (22) más un botón
             de 44 dan 66 y no entran. Dos targets de 44 no caben en un rail de
             64 px, así que ahí se conserva el tamaño chico a propósito. El
             ALTO sí llega a 44 en los dos estados (la fila mide 57). */
          className={`flex-shrink-0 inline-flex min-h-[44px] items-center justify-center text-gray-400 hover:text-gray-700 rounded transition ${
            collapsed ? "w-8" : "w-11"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={collapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <Link
          href="/home"
          title={collapsed ? "Inicio" : undefined}
          className={`w-full flex min-h-[44px] items-center ${collapsed ? "justify-center px-0" : "gap-3 px-5"} text-sm transition-all border-l-2 ${
            homeActive
              ? "bg-gray-50 text-black font-medium border-l-blue-500"
              : "text-gray-600 hover:bg-gray-50 border-l-transparent"
          }`}
        >
          <Home size={16} strokeWidth={1.5} />
          {!collapsed && <span className="truncate">Inicio</span>}
        </Link>
        <div className="h-px bg-gray-100 my-1 mx-5" />
        {visibleGroups.map((g) => {
          const Icon = g.icon;
          const groupActive = activeGroup === g.key;

          // Colapsado (solo íconos): clic en el ícono de grupo abre un FLYOUT a
          // la derecha con los módulos hijos (ícono + label). Exclusivo: un solo
          // flyout abierto a la vez. Ya no navega a /grupo.
          if (collapsed) {
            const isFlyoutOpen = flyout?.key === g.key;
            return (
              <div key={g.key}>
                <button
                  onClick={(e) => {
                    const t = e.currentTarget.getBoundingClientRect().top;
                    setFlyout(prev => (prev?.key === g.key ? null : { key: g.key, top: t }));
                  }}
                  title={g.label}
                  aria-expanded={isFlyoutOpen}
                  className={`w-full flex min-h-[44px] items-center justify-center px-0 text-sm transition-all border-l-2 ${
                    groupActive || isFlyoutOpen
                      ? "bg-gray-50 text-black font-medium border-l-blue-500"
                      : "text-gray-600 hover:bg-gray-50 border-l-transparent"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.5} />
                </button>
                {isFlyoutOpen && (
                  <CollapsedFlyout
                    group={g}
                    top={flyout!.top}
                    role={userRole}
                    fgModules={fgModules}
                    pathname={pathname}
                    onClose={() => setFlyout(null)}
                  />
                )}
              </div>
            );
          }

          // Expandido: el grupo es un toggle de acordeón; los hijos navegan.
          const isOpen = openGroup === g.key;
          const children = getModulesInGroup(g.key, userRole, fgModules);
          const activeChildKey = activeChildKeyFor(children, pathname);

          return (
            <div key={g.key}>
              <button
                onClick={() => toggleGroup(g.key)}
                aria-expanded={isOpen}
                className={`w-full flex min-h-[44px] items-center gap-3 px-5 text-sm transition-all border-l-2 border-l-transparent ${
                  groupActive ? "text-black font-medium" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span className="flex-1 truncate text-left">{g.label}</span>
                {/* chevron-right → rota 90° (apunta abajo) al abrir */}
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className={`flex-shrink-0 text-gray-400 transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              </button>
              {/* Acordeón animado: grid-template-rows 0fr↔1fr anima la altura sin
                  display:none, + fade. Respeta prefers-reduced-motion. */}
              <div
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows] duration-[180ms] ease-out motion-reduce:transition-none ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div
                  className={`min-h-0 overflow-hidden transition-opacity duration-[180ms] ease-out motion-reduce:transition-none ${
                    isOpen ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {children.map((m) => {
                    const MIcon = m.icon;
                    const mActive = m.key === activeChildKey;
                    return (
                      <Link
                        key={m.key}
                        href={m.href}
                        onClick={() => recordModuleClick(m.key, userName)}
                        title={m.label}
                        tabIndex={isOpen ? 0 : -1}
                        className={`w-full flex min-h-[44px] items-center gap-2.5 pl-12 pr-5 text-[13px] transition-colors border-l-2 ${
                          mActive
                            ? "bg-blue-50 text-blue-700 font-medium border-l-blue-500"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-l-transparent"
                        }`}
                      >
                        <MIcon size={14} strokeWidth={1.5} className="flex-shrink-0" />
                        <span className="truncate text-left">{m.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {userName && (
        <div
          className={`border-t border-gray-200 py-3 flex items-center ${
            collapsed ? "justify-center px-0" : "gap-3 px-5"
          }`}
        >
          <div
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0"
            title={collapsed ? `${userName} · ${ROLE_LABELS[userRole] || userRole}` : undefined}
          >
            {userName[0]}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{userName}</div>
                <div className="text-xs text-gray-400">{ROLE_LABELS[userRole] || userRole}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center text-gray-300 hover:text-red-500 transition -my-2 -mr-3"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

/** Wrapper del main content: deja espacio para el Sidebar en desktop. */
export function SidebarAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const collapsed = useSidebarCollapsed();
  const isPublic = pathname === "/" || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p));
  if (isPublic) return <div>{children}</div>;
  return (
    <div
      className={`transition-[margin] duration-200 ease-out ${
        collapsed ? "md:ml-16" : "md:ml-56"
      }`}
    >
      {children}
    </div>
  );
}
