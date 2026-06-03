"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { Home, ChevronDown } from "lucide-react";
import { ALL_MODULES, getVisibleGroups, getModulesInGroup } from "@/lib/modules";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
  director: "Director", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
};

const PUBLIC_PATH_PREFIXES = ["/catalogo-publico", "/pedido-reebok", "/pedido-joybees"];
const STORAGE_KEY = "fg_sidebar_collapsed";
const TOGGLE_EVENT = "fg-sidebar-toggle";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function writeCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent<boolean>(TOGGLE_EVENT, { detail: value }),
  );
}

function useCollapsedSync(): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
    const handler = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setCollapsed(Boolean(ce.detail));
    };
    window.addEventListener(TOGGLE_EVENT, handler);
    return () => window.removeEventListener(TOGGLE_EVENT, handler);
  }, []);

  return collapsed;
}

// Acordeón: grupos expandidos en el sidebar. Persistencia simple (no crítica).
const EXPANDED_KEY = "fg_sidebar_expanded";

function readExpanded(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(EXPANDED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

function writeExpanded(keys: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(keys));
}

/** Devuelve la key del grupo activo para una pathname dada, o null si estamos en /home u otra ruta neutra. */
function activeGroupForPath(pathname: string): string | null {
  if (!pathname || pathname === "/home" || pathname === "/") return null;
  // Match directo a la página de grupo
  const direct = ["/operaciones", "/reportes", "/catalogos", "/sistema"].find(
    g => pathname === g || pathname.startsWith(g + "/")
  );
  if (direct) return direct.slice(1);
  // Match vía el href del módulo, MÁS ESPECÍFICO (href más largo gana). Evita
  // que /admin/usuarios o /admin/data-health (grupo "sistema") resalten CXC
  // ("/admin", grupo "reportes") solo por compartir prefijo.
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

export default function Sidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const collapsed = useCollapsedSync();

  useEffect(() => {
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!collapsed);
  }, [collapsed]);

  const activeGroup = activeGroupForPath(pathname);

  // Estado del acordeón: set de grupos abiertos. Init desde localStorage; el
  // grupo activo siempre arranca abierto. Hooks ANTES de los early returns.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpanded(new Set(readExpanded()));
  }, []);
  useEffect(() => {
    if (!activeGroup) return;
    setExpanded(prev => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);
  const toggleGroup = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeExpanded([...next]);
      return next;
    });
  }, []);

  if (pathname === "/" || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p))) return null;
  if (!userRole) return null;

  const visibleGroups = getVisibleGroups(userRole, fgModules);

  function handleLogout() {
    fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    sessionStorage.clear();
    router.push("/");
  }

  const width = collapsed ? "w-16" : "w-56";
  const homeActive = pathname === "/home";

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 h-screen ${width} bg-white border-r border-gray-200 flex-col z-20 transition-[width] duration-200 ease-out`}
    >
      <div
        className={`h-[57px] border-b border-gray-200 flex items-center ${
          collapsed ? "justify-center px-0" : "justify-between px-5"
        }`}
      >
        <button
          onClick={() => router.push("/home")}
          className="flex items-center gap-2 hover:opacity-70 transition min-w-0"
          title={collapsed ? "Fashion Group" : undefined}
        >
          <FGLogo variant="icon" theme="light" size={22} />
          {!collapsed && (
            <span className="text-sm font-medium text-gray-800 truncate">
              Fashion Group
            </span>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Colapsar barra lateral"
            title="Colapsar"
            className="text-gray-400 hover:text-gray-700 p-1 rounded transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggleCollapsed}
          aria-label="Expandir barra lateral"
          title="Expandir"
          className="mx-auto mt-2 mb-1 text-gray-400 hover:text-gray-700 p-1 rounded transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-2">
        <button
          onClick={() => router.push("/home")}
          title={collapsed ? "Inicio" : undefined}
          className={`w-full flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-5"} py-2.5 text-sm transition-all border-l-2 ${
            homeActive
              ? "bg-gray-50 text-black font-medium border-l-blue-500"
              : "text-gray-600 hover:bg-gray-50 border-l-transparent"
          }`}
        >
          <Home size={16} strokeWidth={1.5} />
          {!collapsed && <span className="truncate">Inicio</span>}
        </button>
        <div className="h-px bg-gray-100 my-1 mx-5" />
        {visibleGroups.map((g) => {
          const Icon = g.icon;
          const groupActive = activeGroup === g.key;

          // Colapsado (solo íconos): sin espacio para acordeón → el ícono navega
          // a la página intermedia /grupo (comportamiento de siempre).
          if (collapsed) {
            return (
              <button
                key={g.key}
                onClick={() => router.push(g.href)}
                title={g.label}
                className={`w-full flex items-center justify-center px-0 py-2.5 text-sm transition-all border-l-2 ${
                  groupActive
                    ? "bg-gray-50 text-black font-medium border-l-blue-500"
                    : "text-gray-600 hover:bg-gray-50 border-l-transparent"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
              </button>
            );
          }

          // Expandido: el grupo es un toggle de acordeón; los hijos navegan.
          const isOpen = expanded.has(g.key);
          const children = getModulesInGroup(g.key, userRole, fgModules);
          // Hijo activo: match por href MÁS específico (evita doble-resaltado
          // entre /admin y /admin/usuarios, etc.).
          let activeChildKey: string | null = null;
          let bestLen = -1;
          for (const m of children) {
            if ((pathname === m.href || pathname.startsWith(m.href + "/")) && m.href.length > bestLen) {
              activeChildKey = m.key;
              bestLen = m.href.length;
            }
          }

          return (
            <div key={g.key}>
              <button
                onClick={() => toggleGroup(g.key)}
                aria-expanded={isOpen}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 border-l-transparent ${
                  groupActive ? "text-black font-medium" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span className="flex-1 truncate text-left">{g.label}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && children.map((m) => {
                const MIcon = m.icon;
                const mActive = m.key === activeChildKey;
                return (
                  <button
                    key={m.key}
                    onClick={() => router.push(m.href)}
                    title={m.label}
                    className={`w-full flex items-center gap-2.5 pl-12 pr-5 py-2 text-[13px] transition-all border-l-2 ${
                      mActive
                        ? "bg-gray-50 text-black font-medium border-l-blue-500"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-l-transparent"
                    }`}
                  >
                    <MIcon size={15} strokeWidth={1.5} className="flex-shrink-0" />
                    <span className="truncate text-left">{m.label}</span>
                  </button>
                );
              })}
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
                <div className="text-[10px] text-gray-400">{ROLE_LABELS[userRole] || userRole}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="text-gray-300 hover:text-red-500 transition p-1 flex-shrink-0"
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
  const collapsed = useCollapsedSync();
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
