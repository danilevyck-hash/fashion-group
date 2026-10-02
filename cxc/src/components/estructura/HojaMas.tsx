"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «MÁS» ES UNA HOJA SOBRE LA PANTALLA, NO OTRA PANTALLA (2-oct-2026).
//
// Daniel, en su iPhone: *«¿por qué Más me lleva a esa pantalla y no a la que
// estaba?»*. 🩸 «Más» abría el menú viejo a pantalla completa («Menú», con ×) y
// tapaba la pantalla donde estaba. Ahora, como en iOS, sube una hoja de vidrio
// de ~70 % de alto con su agarre, ENCIMA de la pantalla:
//
//   · el buscador de módulos;
//   · los módulos que NO están en la barra, por grupo (los de la barra ya se
//     tocan abajo);
//   · al final, la cuenta: el nombre visible, «Cambiar contraseña» y «Cerrar
//     sesión».
//
// Se cierra deslizándola hacia abajo, tocando afuera, con × o con Escape, y la
// pantalla de atrás queda donde estaba: el scroll se congela y se devuelve
// (`useBodyScrollLock`). Elegir un módulo navega. Candado `hoja-mas`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getModuleColorByKey } from "@/lib/moduleColors";
import { cuantosModulos, filtrarGruposPorTexto, type GrupoDelCajon } from "@/lib/navegacion/cajon-por-grupos";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { etiquetaDeRol } from "@/lib/roles-etiquetas";
import { CambiarContrasenaModal } from "@/components/CambiarContrasena";
import { CLASE_VIDRIO, RADIO_VIDRIO } from "@/lib/ui/vidrio";

/** Alto de la hoja: el 70 % de la pantalla visible. */
export const ALTO_HOJA_MAS = "70dvh";
/** Cuánto hay que bajarla con el dedo para que se cierre. */
export const CIERRA_AL_BAJAR_PX = 90;

export default function HojaMas({
  abierta,
  onCerrar,
  grupos,
  moduloAqui,
  onIr,
  nombre,
  rol,
  onCerrarSesion,
  acciones,
}: {
  abierta: boolean;
  onCerrar: () => void;
  /** Los módulos que NO están en la barra, ya agrupados. */
  grupos: readonly GrupoDelCajon[];
  moduloAqui: string | null;
  onIr: (href: string) => void;
  nombre: string;
  rol: string;
  onCerrarSesion: () => void;
  /** Acciones del módulo (Multifashion «Actualizar ahora»). */
  acciones?: ReactNode;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [contrasena, setContrasena] = useState(false);
  const [bajada, setBajada] = useState(0);
  const inicio = useRef<number | null>(null);

  useBodyScrollLock(abierta);
  useEffect(() => {
    if (!abierta) return;
    setBusqueda("");
    setBajada(0);
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierta, onCerrar]);

  // Deslizar hacia abajo desde el agarre o el encabezado.
  const alBajar = {
    onPointerDown: (e: PointerEvent) => { inicio.current = e.clientY; },
    onPointerMove: (e: PointerEvent) => {
      if (inicio.current !== null) setBajada(Math.max(0, e.clientY - inicio.current));
    },
    onPointerUp: () => {
      if (inicio.current === null) return;
      inicio.current = null;
      if (bajada > CIERRA_AL_BAJAR_PX) onCerrar();
      else setBajada(0);
    },
    onPointerCancel: () => { inicio.current = null; setBajada(0); },
  };

  const filtrados = filtrarGruposPorTexto(grupos, busqueda);
  if (typeof document === "undefined") return null;
  return (
    <>
      {abierta && createPortal(
        <div data-hoja-mas-modulos role="dialog" aria-modal="true" aria-label="Más" className="fixed inset-0 z-[60] flex flex-col justify-end sm:hidden">
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/25" />
          <div
            className={`relative mx-2 mb-2 flex flex-col overflow-hidden ${CLASE_VIDRIO} ${RADIO_VIDRIO}`}
            style={{
              height: ALTO_HOJA_MAS,
              transform: `translateY(${bajada}px)`,
              transition: inicio.current === null ? "transform 200ms ease-out" : "none",
            }}
          >
            <div {...alBajar} className="shrink-0 touch-none px-4 pt-2">
              <div data-agarre aria-hidden="true" className="mx-auto h-[5px] w-9 rounded-full bg-black/25" />
              <div className="flex items-center justify-between pt-1">
                <h2 className="text-[20px] font-semibold tracking-tight text-gray-950">Más</h2>
                <button
                  type="button"
                  onClick={onCerrar}
                  aria-label="Cerrar"
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-600 active:bg-black/5"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar un módulo"
                aria-label="Buscar un módulo"
                autoCapitalize="none"
                autoCorrect="off"
                className="mt-1 h-11 w-full rounded-xl bg-black/[0.06] px-3.5 text-base text-gray-900 placeholder:text-gray-500 focus:outline-none"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {acciones && <div className="pt-3">{acciones}</div>}

              {filtrados.map((g) => (
                <section key={g.key}>
                  <h3 className="px-3.5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{g.label}</h3>
                  <div className="overflow-hidden rounded-xl bg-white/80">
                    {g.modulos.map((m) => {
                      const Icon = m.icon;
                      const aqui = m.key === moduloAqui;
                      const tono = getModuleColorByKey(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => onIr(m.href)}
                          aria-current={aqui ? "page" : undefined}
                          className={`flex min-h-[44px] w-full items-center gap-3 border-t border-gray-100 px-3.5 py-2.5 text-left text-[15px] transition first:border-t-0 active:bg-gray-100 ${aqui ? "font-semibold text-gray-950" : "text-gray-800"}`}
                        >
                          <Icon size={18} strokeWidth={1.75} className={`flex-shrink-0 ${tono ? tono.text : "text-gray-400"}`} />
                          <span className="min-w-0 flex-1 truncate">{m.label}</span>
                          <span className="flex-shrink-0 text-sm text-gray-300">›</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {cuantosModulos(filtrados) === 0 && (
                <p className="px-3.5 py-6 text-center text-sm text-gray-500">Sin resultados</p>
              )}

              {nombre && (
                <section data-cuenta>
                  <h3 className="px-3.5 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Cuenta</h3>
                  <div className="overflow-hidden rounded-xl bg-white/80">
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[15px] font-semibold text-gray-700">
                        {nombre.trim()[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold text-gray-900">{nombre}</div>
                        <div className="text-[13px] text-gray-500">{etiquetaDeRol(rol)}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => { onCerrar(); setContrasena(true); }} className="flex min-h-[44px] w-full items-center border-t border-gray-100 px-3.5 text-left text-[15px] text-gray-900 active:bg-gray-100">
                      Cambiar contraseña
                    </button>
                    <button type="button" onClick={() => { onCerrar(); onCerrarSesion(); }} className="flex min-h-[44px] w-full items-center border-t border-gray-100 px-3.5 text-left text-[15px] text-red-600 active:bg-gray-100">
                      Cerrar sesión
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
      <CambiarContrasenaModal open={contrasena} onClose={() => setContrasena(false)} />
    </>
  );
}
