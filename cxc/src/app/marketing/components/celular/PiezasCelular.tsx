"use client";

// ============================================================================
// LAS PIEZAS DE MARKETING EN EL CELULAR (24-sep-2026).
//
// El mockup que Daniel aprobó dibuja las trece pantallas con las MISMAS cuatro
// piezas de iOS: el título grande, el número grande, el rótulo de grupo y la
// fila de dos renglones con su monto a la derecha. Viven acá para que las
// trece se lean como la misma app y para que un cambio de aire se haga en un
// solo lugar.
//
// 🔴 Ninguna de estas piezas calcula nada: reciben texto ya escrito por
// `lib/marketing/celular.ts` (puro) y lo dibujan.
// ============================================================================

import type { ReactNode } from "react";
import Link from "next/link";

/** El lienzo: fondo de iOS, sitio para la barra de abajo. */
export function PantallaCelular({ children }: { children: ReactNode }) {
  return <div className="sm:hidden min-h-screen bg-[#F2F2F7] pb-12">{children}</div>;
}

/** El título grande y su línea gris. */
export function TituloCelular({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: ReactNode;
  /** Un botón a la derecha del título (＋, Editar…). */
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

/**
 * El número grande.
 *
 * 🔴 Daniel, sobre el mockup: *«el número grande más chico, que no consuma
 * tanto»*. Por eso 34 px y no los 44 del dibujo — y por eso es una constante
 * con nombre y no un número suelto repetido en cinco pantallas.
 */
export function NumeroGrande({
  valor,
  detalle,
  onClick,
}: {
  valor: string;
  detalle?: ReactNode;
  onClick?: () => void;
}) {
  const adentro = (
    <>
      <span className="block text-[34px] font-light leading-none tracking-tight tabular-nums text-gray-900">
        {valor}
      </span>
      {detalle != null && detalle !== "" && (
        <span className="mt-2 block text-[14px] text-gray-500">{detalle}</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full px-4 pt-4 text-center active:opacity-60">
        {adentro}
      </button>
    );
  }
  return <div className="px-4 pt-4 text-center">{adentro}</div>;
}

/** El rótulo gris de un grupo («TAMBIÉN», «CERRADOS», «FOTOS»). */
export function RotuloDeGrupo({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 pb-1.5 pt-5 text-[13px] uppercase tracking-wide text-gray-500">
      {children}
    </div>
  );
}

/**
 * La tarjeta blanca que agrupa filas.
 *
 * `sinMargen` la deja pegada a los bordes de su contenedor: se usa cuando ya
 * vive dentro de un modal con su propio aire (la puerta «＋ Gasto»).
 */
export function GrupoCelular({
  children,
  className = "",
  sinMargen = false,
}: {
  children: ReactNode;
  className?: string;
  sinMargen?: boolean;
}) {
  return (
    <ul className={`${sinMargen ? "" : "mx-4"} mt-3 overflow-hidden rounded-2xl bg-white ${className}`}>
      {children}
    </ul>
  );
}

/**
 * LA FILA: nombre arriba, línea gris abajo, UN monto a la derecha.
 *
 * 🔴 Daniel, textual: *«ya son datos que veré adentro, eso me ensucia la
 * pantalla, no solo aquí sino en todo el sistema»*. Por eso la fila tiene UN
 * solo hueco de monto: lo que no cabe en él no va en la fila.
 */
export function FilaCelular({
  titulo,
  detalle,
  monto,
  pie,
  href,
  onClick,
  accion,
  ariaLabel,
  tono = "normal",
  foto,
  "data-fila": dataFila,
}: {
  titulo: ReactNode;
  detalle?: ReactNode;
  /** El monto de la derecha, ya escrito. */
  monto?: ReactNode;
  /** Una línea chiquita bajo el monto («ver los 17», «en bodega»). */
  pie?: string;
  href?: string;
  onClick?: () => void;
  /** Un botón propio de la fila («Pagar»). No dispara el onClick de la fila. */
  accion?: ReactNode;
  ariaLabel?: string;
  tono?: "normal" | "apagado";
  /** La miniatura de la izquierda (Mobiliario: la foto del producto). */
  foto?: ReactNode;
  "data-fila"?: string;
}) {
  const tocable = !!href || !!onClick;
  const adentro = (
    <>
      {foto}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[17px] font-semibold tracking-tight ${
            tono === "apagado" ? "text-gray-400" : "text-gray-900"
          }`}
        >
          {titulo}
        </span>
        {detalle != null && detalle !== "" && (
          <span className="mt-0.5 block text-[14px] text-gray-500">{detalle}</span>
        )}
      </span>
      {monto != null && monto !== "" && (
        <span className="shrink-0 text-right">
          <span
            className={`block text-[17px] tabular-nums ${tono === "apagado" ? "text-gray-400" : "text-gray-900"}`}
          >
            {monto}
          </span>
          {pie && <span className="block text-[11px] font-medium text-gray-500">{pie}</span>}
        </span>
      )}
      {tocable && !accion && <span className="shrink-0 text-gray-400">›</span>}
    </>
  );

  const clase = "flex w-full items-center gap-3 px-4 py-3 text-left";

  return (
    <li className="border-t border-gray-100 first:border-t-0" data-fila={dataFila}>
      <div className="flex items-center">
        {href ? (
          <Link href={href} aria-label={ariaLabel} className={`${clase} active:bg-gray-50`}>
            {adentro}
          </Link>
        ) : onClick ? (
          <button type="button" onClick={onClick} aria-label={ariaLabel} className={`${clase} active:bg-gray-50`}>
            {adentro}
          </button>
        ) : (
          <div className={clase}>{adentro}</div>
        )}
        {accion && <div className="shrink-0 pr-4">{accion}</div>}
      </div>
    </li>
  );
}

/** El botón ancho, negro, al alcance del pulgar. Apagado DICE qué falta. */
export function BotonAncho({
  children,
  onClick,
  disabled,
  tono = "negro",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tono?: "negro" | "blanco";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full rounded-[14px] px-4 py-4 text-center text-[17px] font-semibold transition active:scale-[0.98]",
        disabled
          ? "bg-[#E9E9EB] text-gray-500"
          : tono === "negro"
            ? "bg-gray-900 text-white"
            : "border border-gray-200 bg-white text-gray-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Una línea de aviso en ámbar (lo que hay que mirar antes de cerrar). */
export function AvisoCelular({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
      {children}
    </div>
  );
}

/** El cajón vacío: dice qué pasa, nunca un cero grande. */
export function VacioCelular({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl bg-white px-4 py-8 text-center text-[15px] text-gray-500">
      {children}
    </div>
  );
}
