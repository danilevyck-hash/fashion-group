"use client";

// "La fila se transforma": al tocar una celda del heatmap de Ventas, la fila de
// esa empresa cambia sus números por el detalle, EN SU MISMO LUGAR.
//
// Por qué así y no de otra forma:
//   · el tooltip flotante tapaba las celdas vecinas que uno quería comparar;
//   · el panel lateral derecho (#279) tapaba AGO/SEP y parte de JUL — justo las
//     columnas que Daniel estaba mirando cuando tocaba la celda;
//   · una fila nueva insertada abajo empuja el resto de la tabla.
// La fila transformada no empuja, no tapa y la respuesta sale exactamente donde
// el dedo tocó. El costo aceptado: mientras está abierta no se ven los otros
// meses de ESA empresa.
//
// Dos reglas que hay que sostener sí o sí:
//   1. El alto NO puede saltar. La fila normal se mide al tocarla (`medirFila`)
//      y la transformada se fija a ese alto exacto. Sin esto la tabla pega un
//      brinco al abrir y otro al cerrar.
//   2. En celular la tabla scrollea horizontal. El contenido va `sticky left-0`
//      con el ancho VISIBLE del contenedor (también medido), así los 3 datos
//      entran sin scroll horizontal aunque la fila mida 700 px.

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlotDetalle } from "@/lib/ventas/celda";

export interface FilaDetalle {
  /** Fila que se transforma: id de empresa, o TOTAL_GRUPO_ID. */
  filaId: string;
  /** `data-celda` de la celda tocada — para devolverle el foco al cerrar. */
  focoCelda: string;
  /** Nombre de la empresa (o "Total Grupo"). */
  titulo: string;
  /** Período tocado, corto: "JUL 26 vs 25", "TOTAL 2026". */
  subtitulo: string;
  slots: SlotDetalle[];
  /** Alto en px de la fila normal, medido al tocarla. */
  alto: number;
  /** Ancho visible del contenedor con scroll horizontal, medido al tocarla. */
  ancho: number;
}

/** Id de la fila oscura de totales (no es una empresa). */
export const TOTAL_GRUPO_ID = "__total_grupo__";

/**
 * Mide la fila y el ancho visible de la tabla en el momento del clic. Es la
 * única forma honesta de garantizar que la fila transformada mida EXACTAMENTE
 * lo mismo que la normal: los altos dependen de la fuente, del zoom y de si la
 * empresa lleva nota al pie (Multifashion), así que no se pueden hardcodear.
 */
export function medirFila(e: ReactMouseEvent<HTMLElement>): { alto: number; ancho: number } {
  const el = e.currentTarget;
  const tr = el.closest("tr");
  const cont = el.closest<HTMLElement>(".overflow-x-auto");
  return {
    alto: tr ? tr.getBoundingClientRect().height : 0,
    ancho: cont ? cont.clientWidth : 0,
  };
}

function toneClass(tone: SlotDetalle["tone"], oscura: boolean): string {
  if (oscura) {
    return tone === "emerald" ? "text-emerald-300" : tone === "orange" ? "text-rose-300" : "text-gray-300";
  }
  return tone === "emerald" ? "text-emerald-700" : tone === "orange" ? "text-red-600" : "text-gray-500";
}

/**
 * El contenido del detalle, sin envoltorio. Existe porque hay DOS envoltorios:
 * la fila `<tr>` del escritorio y el bloque `<div>` de las tarjetas de celular.
 * Uno solo lo dibuja para que no puedan divergir.
 */
function FilaDetalleContenido({
  detalle,
  onClose,
  oscura,
  compacto,
  /** Ancho fijo (celular con scroll horizontal). Sin valor: se estira solo. */
  anchoFijo,
  cerrarRef,
}: {
  detalle: FilaDetalle;
  onClose: () => void;
  oscura: boolean;
  compacto: boolean;
  anchoFijo?: number;
  cerrarRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <div
      // sticky left-0 + ancho visible: en la tabla del escritorio (y en la de
      // celular, antes de las tarjetas) el contenedor scrollea, y sin esto el
      // tercer dato quedaría fuera de pantalla. En una tarjeta no hay scroll
      // lateral que compensar, así que `anchoFijo` va vacío y el bloque se
      // estira al ancho de la tarjeta.
      className={cn(
        "sticky left-0 flex items-center",
        // En 390 px el reparto es al milímetro: nombre + 3 datos + × entran
        // en ~339 de los 357 visibles. Cualquier aire de más se lo come el
        // nombre, que es lo único que puede truncar.
        compacto ? "gap-1 px-1.5" : "gap-6 px-3.5",
      )}
      style={{ width: anchoFijo || undefined }}
    >
      {/* En celular el nombre es lo único elástico: se queda con TODO el
          sobrante y trunca cuando no hay. Así nunca fuerza scroll horizontal
          (que es justo lo que la fila transformada tiene prohibido). */}
      <div className={cn("min-w-0", compacto ? "flex-1" : "shrink")}>
        <p
          className={cn(
            "truncate font-medium leading-tight",
            compacto ? "text-[11px]" : "text-sm",
            oscura ? "text-white" : "text-gray-950",
          )}
        >
          {detalle.titulo}
        </p>
        <p
          className={cn(
            "truncate leading-tight",
            compacto ? "text-[9px]" : "text-xs",
            oscura ? "text-gray-300" : "text-gray-500",
          )}
        >
          {detalle.subtitulo}
        </p>
      </div>

      {detalle.slots.map((s) => (
        <div key={s.key} className="min-w-0 shrink-0">
          <p
            className={cn(
              "truncate font-medium uppercase leading-tight",
              compacto ? "text-[9px] tracking-normal" : "text-xs tracking-wide",
              oscura ? "text-gray-300" : "text-gray-500",
              s.destacado && (oscura ? "text-white" : "text-gray-700"),
            )}
          >
            {s.label}{" "}
            <span className={cn("font-semibold", compacto && "normal-case", toneClass(s.tone, oscura))}>
              {s.delta}
            </span>
          </p>
          <p
            className={cn(
              "truncate font-mono leading-tight tabular-nums",
              compacto ? "text-[11px]" : "text-sm",
              oscura ? "text-white" : "text-gray-950",
            )}
          >
            {s.valor}
            {s.prev && (
              <span className={cn("ml-1.5 text-xs", oscura ? "text-gray-400" : "text-gray-400")}>
                vs {s.prev}
              </span>
            )}
          </p>
        </div>
      ))}

      <button
        ref={cerrarRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar detalle"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition active:scale-[0.97]",
          compacto ? "h-8 w-8" : "ml-auto h-7 w-7",
          oscura
            ? "text-gray-300 hover:bg-white/10 hover:text-white"
            : "text-gray-400 hover:bg-white hover:text-gray-700",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * El foco se le devuelve a la × porque la celda que lo tenía DESAPARECE del DOM
 * al transformarse la fila. Sin esto el foco se cae al <body> y el teclado queda
 * huérfano. Vale igual para la fila y para el bloque.
 */
function useFocoEnCerrar(detalle: FilaDetalle) {
  const cerrarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrarRef.current?.focus({ preventScroll: true });
  }, [detalle.filaId, detalle.focoCelda]);
  return cerrarRef;
}

export function FilaDetalleTr({
  detalle,
  colSpan,
  onClose,
  oscura = false,
  compacto = false,
}: {
  detalle: FilaDetalle;
  colSpan: number;
  onClose: () => void;
  /** Fila TOTAL GRUPO: fondo oscuro, tonos invertidos. */
  oscura?: boolean;
  /** Celular: tipografía y aire recortados, sin montos del año previo. */
  compacto?: boolean;
}) {
  const cerrarRef = useFocoEnCerrar(detalle);

  return (
    <tr
      data-testid="fila-detalle"
      className={cn(
        oscura ? "bg-indigo-500/25 text-white" : "bg-indigo-50",
        !oscura && "border-b border-gray-200",
      )}
    >
      <td
        colSpan={colSpan}
        // El alto medido va acá: con border-collapse el alto de la fila es el
        // del td más alto, así que fijarlo en el único td la deja clavada.
        style={{ height: detalle.alto || undefined }}
        className={cn(
          "p-0 align-middle",
          oscura ? "ring-2 ring-inset ring-indigo-300" : "ring-2 ring-inset ring-indigo-500",
        )}
      >
        <FilaDetalleContenido
          detalle={detalle}
          onClose={onClose}
          oscura={oscura}
          compacto={compacto}
          anchoFijo={detalle.ancho}
          cerrarRef={cerrarRef}
        />
      </td>
    </tr>
  );
}

/**
 * La MISMA respuesta, en las tarjetas de celular: el renglón del período que se
 * tocó se transforma en el detalle, en su lugar y con su mismo alto.
 *
 * No lleva `anchoFijo`: en una tarjeta no hay scroll lateral, así que el bloque
 * puede ocupar el ancho de la tarjeta y no hace falta medir nada para que los 3
 * datos entren. El alto SÍ se fija — es la regla que evita que la lista pegue un
 * brinco al abrir y otro al cerrar.
 */
export function FilaDetalleBloque({
  detalle,
  onClose,
  oscura = false,
}: {
  detalle: FilaDetalle;
  onClose: () => void;
  oscura?: boolean;
}) {
  const cerrarRef = useFocoEnCerrar(detalle);

  return (
    <div
      data-testid="fila-detalle"
      style={{ minHeight: detalle.alto || undefined }}
      className={cn(
        "flex items-center",
        oscura
          ? "bg-indigo-500/25 text-white ring-2 ring-inset ring-indigo-300"
          : "bg-indigo-50 ring-2 ring-inset ring-indigo-500",
      )}
    >
      <div className="min-w-0 flex-1">
        <FilaDetalleContenido
          detalle={detalle}
          onClose={onClose}
          oscura={oscura}
          compacto
          cerrarRef={cerrarRef}
        />
      </div>
    </div>
  );
}

/**
 * `medirFila` para las tarjetas: el "alto de la fila" es el del renglón del
 * período, no el de un `<tr>` (no hay tabla), y no hay ancho que medir porque no
 * hay contenedor con scroll lateral — eso es justamente lo que se vino a
 * eliminar.
 */
export function medirRenglon(e: ReactMouseEvent<HTMLElement>): { alto: number; ancho: number } {
  const el = e.currentTarget;
  return { alto: el.getBoundingClientRect().height, ancho: 0 };
}
