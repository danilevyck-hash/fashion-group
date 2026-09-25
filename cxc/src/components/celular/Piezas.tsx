"use client";

// ============================================================================
// LAS PIEZAS DEL CELULAR, COMPARTIDAS (25-sep-2026).
//
// Ventas y Comisiones se dibujan con las mismas piezas de iOS: el título
// grande, la tira de cuatro números, el control segmentado, el «···», la hoja
// que sube desde abajo y la pantalla que se pone encima. Viven acá para que los
// dos módulos se lean como la misma app y para que un cambio de aire se haga en
// un solo lugar.
//
// 🔴 NINGUNA DE ESTAS PIEZAS CALCULA NADA: reciben texto ya escrito por los
// módulos puros (`lib/ventas/celular.ts`, `lib/comisiones/celular.ts`) y lo
// dibujan.
// ============================================================================

import { useEffect, useRef, type ReactNode } from "react";
import { COLCHON_LATERAL_FLOTANTE } from "@/lib/navegacion/barra-celular";

/** El lienzo: fondo de iOS y sitio para el botón flotante. */
export function PantallaCel({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#F2F2F7] pb-8">{children}</div>;
}

/** El título grande y su línea gris, con el «···» a la derecha. */
export function TituloCel({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-2">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-gray-900 break-words">
          {titulo}
        </h1>
        {detalle != null && detalle !== "" && (
          <p className="mt-0.5 text-[14px] text-gray-500 tabular-nums">{detalle}</p>
        )}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}

/** El rótulo gris de un grupo. */
export function RotuloCel({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 pb-1.5 pt-5 text-[13px] uppercase tracking-wide text-gray-500">
      {children}
    </div>
  );
}

/** La tarjeta blanca que agrupa filas. */
export function GrupoCel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-4 mt-3 overflow-hidden rounded-2xl bg-white ${className}`}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b · La tira de cuatro números, en UNA línea
// ─────────────────────────────────────────────────────────────────────────────

export interface NumeroDeLaTiraVista {
  rotulo: string;
  valor: string;
  cambio: string | null;
  signo: number | null;
}

/**
 * 🔴 LOS CUATRO EN UNA LÍNEA, Y EL EXACTO UNA SOLA VEZ (la «1b»).
 *
 * Medido el 25-sep-2026: las cuatro tarjetas de antes medían 175 × 81 px cada
 * una y se llevaban 170 px —214 con el control «Ventas / Utilidad»— antes de la
 * primera empresa, y **$7.069.116,31 se decía DOS veces**: en la tarjeta VENTAS
 * y otra vez en la fila «TOTAL GRUPO». Eran los únicos dos montos repetidos de
 * los 21 que se veían. Acá la cifra va CORTA y el exacto vive al pie, donde
 * siempre estuvo.
 */
export function TiraDeCuatro({ numeros }: { numeros: NumeroDeLaTiraVista[] }) {
  return (
    <div data-tira-ventas className="mx-4 mt-3 flex rounded-2xl bg-white px-1.5 py-3">
      {numeros.map((n) => (
        <div key={n.rotulo} className="min-w-0 flex-1 px-1 text-center">
          <div className="truncate text-[16px] font-bold leading-tight tracking-tight tabular-nums text-gray-900">
            {n.valor}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-gray-500">{n.rotulo}</div>
          {n.cambio && (
            <div className={`mt-0.5 truncate text-[10.5px] ${colorDelSigno(n.signo)}`}>{n.cambio}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function colorDelSigno(signo: number | null | undefined): string {
  if (signo == null) return "text-gray-500";
  if (signo > 0.05) return "text-emerald-700";
  if (signo < -0.05) return "text-red-700";
  return "text-gray-500";
}

export function colorDelTono(tono: "up" | "dn" | "fl" | "nv"): string {
  if (tono === "up") return "text-emerald-700";
  if (tono === "dn") return "text-red-700";
  if (tono === "nv") return "text-teal-700";
  return "text-gray-500";
}

// ─────────────────────────────────────────────────────────────────────────────
// El control segmentado de iOS (una fila, sin rótulo delante)
// ─────────────────────────────────────────────────────────────────────────────

export function Segmentado<T extends string>({
  opciones,
  activo,
  onChange,
  ariaLabel,
}: {
  opciones: readonly { value: T; label: string }[];
  activo: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-segmentado-ventas
      className="mx-4 mt-3 flex gap-1 rounded-xl bg-gray-200/70 p-1"
    >
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={activo === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] flex-1 truncate rounded-lg px-2 text-[13px] font-medium transition ${
            activo === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El «···» de arriba
// ─────────────────────────────────────────────────────────────────────────────

export function BotonPuntos({ onClick, ariaLabel = "Más" }: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-puntos-ventas
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[20px] leading-none text-gray-600 active:opacity-60"
    >
      ···
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La hoja que sube desde abajo
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionDeHoja {
  clave: string;
  rotulo: string;
  detalle?: string;
  onClick: () => void;
  apagada?: boolean;
}

/**
 * La hoja de iOS: título, opciones y «Cancelar».
 *
 * 🔑 Se cierra con el fondo, con Escape y al elegir. No lleva nada que se
 * pueda perder: quien la abre decide qué hacer.
 */
export function HojaCel({
  abierta,
  titulo,
  subtitulo,
  opciones,
  onCerrar,
}: {
  abierta: boolean;
  titulo: string;
  subtitulo?: string;
  opciones: OpcionDeHoja[];
  onCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      data-hoja-ventas
      className="fixed inset-0 z-[60] flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={caja}
        className="relative mx-2 mb-2 overflow-hidden rounded-2xl bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4 py-3 text-center text-[13px] leading-snug text-gray-500">
          {titulo}
          {subtitulo && <div className="mt-0.5">{subtitulo}</div>}
        </div>
        {opciones.map((o) => (
          <button
            key={o.clave}
            type="button"
            disabled={o.apagada}
            onClick={() => {
              o.onClick();
              onCerrar();
            }}
            data-opcion-hoja={o.clave}
            className="block w-full border-t border-gray-100 px-4 py-3.5 text-center text-[17px] text-gray-900 active:bg-gray-100 disabled:text-gray-400"
          >
            {o.rotulo}
            {o.detalle && <span className="mt-0.5 block text-[13px] text-gray-500">{o.detalle}</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={onCerrar}
          className="block w-full border-t-[6px] border-gray-100 px-4 py-3.5 text-center text-[17px] font-semibold text-gray-900 active:bg-gray-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Una pantalla que sube entera (la hoja del cliente, 3g). */
export function PantallaQueSube({
  abierta,
  onCerrar,
  volverA,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  /** Lo que dice el «‹ …» de arriba a la izquierda. */
  volverA: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-pantalla-ventas
      className="fixed inset-0 z-[55] overflow-y-auto bg-[#F2F2F7]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/95 px-2 py-1 backdrop-blur">
        <button
          type="button"
          onClick={onCerrar}
          className="flex min-h-[44px] items-center gap-1 px-2 text-[16px] text-teal-700 active:opacity-60"
        >
          ‹ <span className="max-w-[240px] truncate">{volverA}</span>
        </button>
      </div>
      <div className="pb-10">{children}</div>
    </div>
  );
}

/**
 * El colchón de la derecha, para lo que vive pegado al borde y cae a la altura
 * del botón flotante. La medida sale de `barra-celular.ts`, nunca de acá.
 */
export const ESTILO_COLCHON_DERECHA = { paddingRight: COLCHON_LATERAL_FLOTANTE } as const;
