"use client";

// Los gestos del iPhone que no viven en un renglón (27-nov-2026,
// `GESTOS_IPHONE_2026_11`). Ver `lib/ui/gestos-iphone-2026-11.ts`.
//   · `VolverDesdeElBorde`: deslizar desde el borde izquierdo = volver
//     (`router.back()`), con la pantalla siguiendo al dedo como en iOS.
//   · `SubirAlInicio`: tocar el encabezado o el título sube al principio.
//   · `useMantenerPresionado`: mantener presionado ~500 ms.
// Montados una vez en el layout. Solo con el dedo: el mouse no dispara nada.

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BORDE_VOLVER_PX,
  GESTOS_IPHONE_2026_11,
  MANTENER_MS,
  MANTENER_TOLERANCIA_PX,
} from "@/lib/ui/gestos-iphone-2026-11";

/** ¿Es una pantalla de DETALLE, de donde se vuelve? `/clientes/D-25`,
 *  `/despachos/123`, `/cxc/cliente/…`, o la lista que abre un detalle en la URL. */
export function esPantallaDeDetalle(pathname: string, search: string): boolean {
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length >= 2) return true;
  const q = new URLSearchParams(search);
  return q.get("view") === "detail" || q.has("id");
}

/** Una tabla o lista que se desliza de lado y no está al principio se queda con el gesto. */
function dentroDeAlgoQueSeDesliza(el: HTMLElement | null): boolean {
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollLeft > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function VolverDesdeElBorde() {
  const router = useRouter();
  useEffect(() => {
    if (!GESTOS_IPHONE_2026_11) return;
    const s = { activo: false, decidido: false, x0: 0, y0: 0, dx: 0, t0: 0, main: null as HTMLElement | null };
    const mover = (dx: number, conTransicion: boolean) => {
      const m = s.main;
      if (!m) return;
      m.style.transition = conTransicion ? "transform 250ms cubic-bezier(0.25, 1, 0.5, 1)" : "none";
      m.style.transform = dx > 0 ? `translateX(${dx}px)` : "";
      m.style.boxShadow = dx > 0 ? "-8px 0 24px rgba(0,0,0,0.12)" : "";
    };
    const alEmpezar = (e: TouchEvent) => {
      s.activo = false;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > BORDE_VOLVER_PX) return;
      if (!esPantallaDeDetalle(location.pathname, location.search) || window.history.length <= 1) return;
      if (document.querySelector('[aria-modal="true"]:not([aria-hidden="true"])')) return;
      if (dentroDeAlgoQueSeDesliza(e.target as HTMLElement)) return;
      s.main = document.querySelector("main");
      if (!s.main) return;
      Object.assign(s, { activo: true, decidido: false, x0: t.clientX, y0: t.clientY, dx: 0, t0: Date.now() });
    };
    const alMover = (e: TouchEvent) => {
      if (!s.activo) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x0;
      const dy = t.clientY - s.y0;
      if (!s.decidido && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        s.decidido = true;
        if (Math.abs(dy) > Math.abs(dx) || dx < 0) { s.activo = false; return; }
      }
      if (!s.decidido) return;
      s.dx = Math.max(0, dx);
      mover(s.dx, false);
    };
    const alSoltar = () => {
      if (!s.activo) return;
      s.activo = false;
      const ancho = window.innerWidth || 390;
      const rapido = s.dx > 40 && s.dx / Math.max(1, Date.now() - s.t0) > 0.5;
      if (s.dx > ancho * 0.35 || rapido) {
        mover(ancho, true);
        setTimeout(() => {
          router.back();
          // La pantalla anterior entra en su lugar: se limpia el corrimiento.
          setTimeout(() => mover(0, false), 60);
        }, 200);
      } else {
        mover(0, true);
      }
    };
    window.addEventListener("touchstart", alEmpezar, { passive: true });
    window.addEventListener("touchmove", alMover, { passive: true });
    window.addEventListener("touchend", alSoltar, { passive: true });
    window.addEventListener("touchcancel", alSoltar, { passive: true });
    return () => {
      window.removeEventListener("touchstart", alEmpezar);
      window.removeEventListener("touchmove", alMover);
      window.removeEventListener("touchend", alSoltar);
      window.removeEventListener("touchcancel", alSoltar);
    };
  }, [router]);
  return null;
}

const INTERACTIVO = 'a, button, input, select, textarea, label, [role="button"], [role="tab"], [role="link"]';

/** Lo que se desplaza bajo `el`: su contenedor con scroll propio, o la página. */
function quienSeDesplaza(el: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = el.parentElement;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
}

/** Tocar la barra de arriba (el encabezado, el título de la pantalla o la
 *  barra de una pantalla encima) sube suave al principio. En la PWA el toque
 *  en la hora del iPhone ya lo hace cuando se desplaza la página; esto cubre
 *  también las pantallas con scroll propio. */
export function SubirAlInicio() {
  useEffect(() => {
    if (!GESTOS_IPHONE_2026_11) return;
    const alTocar = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest(INTERACTIVO)) return;
      const barra = t.closest<HTMLElement>("[data-encabezado], [data-sube-al-inicio], h1");
      if (!barra) return;
      const caja = quienSeDesplaza(barra);
      if (caja) {
        if (caja.scrollTop > 0) caja.scrollTo({ top: 0, behavior: "smooth" });
      } else if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    document.addEventListener("click", alTocar);
    return () => document.removeEventListener("click", alTocar);
  }, []);
  return null;
}

/** Mantener presionado: llama `alMantener` a los ~500 ms si el dedo no se
 *  movió; el toque que sigue (el `click`) ya no cuenta como toque. */
export function useMantenerPresionado(alMantener: (() => void) | null) {
  const s = useRef({ timer: 0 as ReturnType<typeof setTimeout> | 0, x: 0, y: 0, disparo: false });
  const ultimo = useRef(alMantener);
  ultimo.current = alMantener;
  const cancelar = useCallback(() => {
    if (s.current.timer) clearTimeout(s.current.timer);
    s.current.timer = 0;
  }, []);
  useEffect(() => cancelar, [cancelar]);
  if (!GESTOS_IPHONE_2026_11 || !alMantener) return {};
  return {
    onTouchStart: (e: React.TouchEvent) => {
      cancelar();
      s.current.disparo = false;
      s.current.x = e.touches[0].clientX;
      s.current.y = e.touches[0].clientY;
      s.current.timer = setTimeout(() => {
        s.current.timer = 0;
        s.current.disparo = true;
        ultimo.current?.();
      }, MANTENER_MS);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - s.current.x) > MANTENER_TOLERANCIA_PX || Math.abs(t.clientY - s.current.y) > MANTENER_TOLERANCIA_PX) cancelar();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      cancelar();
      // Tras mantener, soltar no es un toque: sin el `click` que sigue.
      if (s.current.disparo) e.preventDefault();
    },
    onTouchCancel: cancelar,
    onClickCapture: (e: React.MouseEvent) => {
      if (s.current.disparo) {
        e.preventDefault();
        e.stopPropagation();
        s.current.disparo = false;
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties,
  };
}

export interface FilaDeResumen {
  rotulo: string;
  valor: React.ReactNode;
  /** Una aclaración chica bajo el rótulo («hasta el 26»). */
  nota?: string;
}

/** La tarjeta flotante de «mantener presionado»: SOLO lo que ya está en
 *  pantalla (quien la llama no lee nada nuevo; lo que no hay, no se pone).
 *  Tocarla abre lo mismo que el toque del renglón; tocar fuera la cierra. */
export function TarjetaResumen({
  titulo,
  subtitulo,
  filas,
  pie,
  cuerpo,
  onAbrir,
  onCerrar,
}: {
  titulo: string;
  subtitulo?: string;
  filas?: FilaDeResumen[];
  pie?: FilaDeResumen;
  /** Contenido propio en vez de `filas`/`pie` (la tarjeta mes a mes). Con él la
   *  tarjeta es un bloque y no un botón: lo de adentro puede tener sus toques. */
  cuerpo?: React.ReactNode;
  onAbrir?: () => void;
  onCerrar: () => void;
}) {
  // El dedo que la abrió todavía puede soltar encima del fondo: no la cierra.
  const abiertaEn = useRef(Date.now());
  const cerrar = () => { if (Date.now() - abiertaEn.current > 350) onCerrar(); };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-tarjeta-resumen className="fixed inset-0 z-[70] flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={cerrar} className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
      {cuerpo ? (
        <div
          onClick={() => { if (onAbrir && Date.now() - abiertaEn.current > 350) onAbrir(); }}
          className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 text-left shadow-2xl animate-slideDown"
        >
          <span className="block text-[17px] font-semibold leading-tight text-gray-900">{titulo}</span>
          {subtitulo && <span className="mt-0.5 block text-[13px] text-gray-500">{subtitulo}</span>}
          {cuerpo}
        </div>
      ) : (
      <button
        type="button"
        onClick={() => { if (Date.now() - abiertaEn.current > 350) (onAbrir ?? onCerrar)(); }}
        className="relative w-full max-w-sm rounded-2xl bg-white p-4 text-left shadow-2xl animate-slideDown"
      >
        <span className="block text-[17px] font-semibold leading-tight text-gray-900">{titulo}</span>
        {subtitulo && <span className="mt-0.5 block text-[13px] text-gray-500">{subtitulo}</span>}
        <span className="mt-3 block divide-y divide-gray-100">
          {(filas ?? []).map((f) => (
            <span key={f.rotulo} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              <span className="text-gray-700">
                {f.rotulo}
                {f.nota && <span className="block text-[12px] text-gray-500">{f.nota}</span>}
              </span>
              <span className="text-right tabular-nums text-gray-900">{f.valor}</span>
            </span>
          ))}
        </span>
        {pie && (
          <span className="mt-1 flex items-center justify-between border-t border-gray-200 pt-2 text-[15px] font-semibold">
            <span>{pie.rotulo}</span>
            <span className="tabular-nums">{pie.valor}</span>
          </span>
        )}
      </button>
      )}
    </div>,
    document.body,
  );
}
