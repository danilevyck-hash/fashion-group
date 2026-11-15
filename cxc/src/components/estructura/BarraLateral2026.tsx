"use client";

// La barra lateral de la estructura estilo Apple (1-oct-2026,
// `ESTRUCTURA_APPLE_2026_10`). Los MÓDULOS del rol a la vista, separados por
// grupo, y un clic a cualquiera:
//   · plegada (64 px): un ícono por módulo, con su color; una raya entre grupos.
//   · abierta (224 px): el grupo como título y sus módulos debajo.
// Sin acordeón, sin ventanita y sin el pie con el usuario (vive arriba a la
// derecha). Los módulos salen del ROL (`gruposDelCajon`, la MISMA lista del
// menú del celular), nunca de una lista escrita aquí.

import { useEffect, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { RAIL_CABE_ENTERO } from "@/lib/ui/revision-110-ajustes";
import { RAIL_ALTO_CON_ESCALA } from "@/lib/ui/revision-110-vivo";
import FGLogo from "@/components/FGLogo";
import { plegadoPorPantalla, useSidebarCollapsed, writeSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { sinBarraLateral } from "@/lib/catalogo/rutas-publicas";
import { recordModuleClick } from "@/lib/module-frequents";
import { getModuleColorByKey } from "@/lib/moduleColors";
import { gruposDelCajon, moduloDeLaRuta } from "@/lib/navegacion/cajon-por-grupos";

export default function BarraLateral2026() {
  const pathname = usePathname() || "";
  const collapsed = useSidebarCollapsed();
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);

  useEffect(() => {
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, [pathname]);

  if (sinBarraLateral(pathname)) return null;
  if (!userRole) return null;

  const grupos = gruposDelCajon(userRole, fgModules);
  const aqui = moduloDeLaRuta(pathname);
  // Revisión 110 · ajustes (15): plegada, todos los íconos CABEN en el alto de
  // la ventana (filas de 44 px que bajan hasta 32 px); si ni así caben, la
  // lista se desliza. Ningún ícono queda medio cortado al pie.
  const ajustar = RAIL_CABE_ENTERO && collapsed;
  // vivo-13: desde 1280 px la raíz lleva `zoom` (`--escala-pantalla`, globals.css)
  // y `100dvh` se dibuja MÁS ALTO que la ventana (900 → 964 px): Usuarios quedaba
  // abajo, fuera de la pantalla. El alto se divide por esa escala.
  const altoVentana = RAIL_ALTO_CON_ESCALA ? "(100dvh / var(--escala-pantalla, 1))" : "100dvh";
  const filasRail = 1 + grupos.reduce((n, g) => n + g.modulos.length, 0);
  const estiloRail = ajustar
    ? ({ "--fila-rail": `clamp(32px, calc((${altoVentana} - 57px - 16px - ${grupos.length * 13}px) / ${filasRail}), 44px)` } as CSSProperties)
    : undefined;
  const fila = (activo: boolean) =>
    `flex ${ajustar ? "min-h-[var(--fila-rail)]" : "min-h-[44px]"} w-full items-center border-l-2 text-sm transition-colors ${
      collapsed ? "justify-center px-0" : "gap-3 px-5"
    } ${activo ? "border-l-blue-500 bg-gray-50 font-medium text-gray-950" : "border-l-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`;

  return (
    <aside
      data-barra-lateral-2026
      style={RAIL_ALTO_CON_ESCALA ? { height: "calc(100dvh / var(--escala-pantalla, 1))" } : undefined}
      className={`hidden md:flex fixed left-0 top-0 h-screen ${collapsed ? "w-16" : "w-56"} bg-white border-r border-gray-200 flex-col z-20 transition-[width] duration-200 ease-out`}
    >
      <div className={`h-[57px] border-b border-gray-200 flex items-center justify-between ${collapsed ? "px-1.5" : "px-5"}`}>
        <Link href="/home" className="flex min-h-[44px] min-w-0 items-center gap-2 transition hover:opacity-70" title={collapsed ? "Fashion Group" : undefined}>
          <FGLogo variant="icon" theme="light" size={22} />
          {!collapsed && <span className="truncate text-sm font-medium text-gray-800">Fashion Group</span>}
        </Link>
        {/* En Inicio va plegada siempre (n.º 38): el botón no haría nada. */}
        {!plegadoPorPantalla(pathname) && <button
          onClick={() => writeSidebarCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          title={collapsed ? "Expandir" : "Colapsar"}
          className={`inline-flex min-h-[44px] flex-shrink-0 items-center justify-center rounded text-gray-400 transition hover:text-gray-700 ${collapsed ? "w-8" : "w-11"}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={collapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
          </svg>
        </button>}
      </div>

      <nav className="flex-1 overflow-y-auto py-2" style={estiloRail}>
        <Link href="/home" title={collapsed ? "Inicio" : undefined} className={fila(pathname === "/home")}>
          <Home size={16} strokeWidth={1.5} className="flex-shrink-0" />
          {!collapsed && <span className="truncate">Inicio</span>}
        </Link>
        {grupos.map((g) => (
          <section key={g.key} aria-label={g.label}>
            {collapsed ? (
              <div className="mx-4 my-1.5 h-px bg-gray-100" />
            ) : (
              <h3 className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{g.label}</h3>
            )}
            {g.modulos.map((m) => {
              const Icon = m.icon;
              const tono = getModuleColorByKey(m.key);
              return (
                <Link
                  key={m.key}
                  href={m.href}
                  onClick={() => recordModuleClick(m.key, userName)}
                  title={collapsed ? m.label : undefined}
                  aria-current={m.key === aqui ? "page" : undefined}
                  className={fila(m.key === aqui)}
                >
                  <Icon size={16} strokeWidth={1.75} className={`flex-shrink-0 ${tono ? tono.text : "text-gray-400"}`} />
                  {!collapsed && <span className="truncate">{m.label}</span>}
                </Link>
              );
            })}
          </section>
        ))}
      </nav>
    </aside>
  );
}
