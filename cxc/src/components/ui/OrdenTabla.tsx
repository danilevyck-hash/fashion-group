"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ORDENAR UNA TABLA — el hook, el encabezado y el «Ordenar ▾» del celular
// (6-oct-2026). La regla vive en `lib/orden-tabla.ts`; acá el dibujo y la
// memoria.
//
// 🔴 EL ORDEN SE RECUERDA en el aparato de quien mira (`localStorage`,
// `fg_orden_<tabla>`). Donde Daniel fijó cómo ABRE una lista («abre por
// plata», «abre por más viejo sin pagar») se recuerda solo mientras dura la
// visita (`recordar: "visita"`, `sessionStorage`): la próxima vez abre como él
// decidió.
//
// 🔴 Sin `inicial`, la tabla abre en SU orden de siempre y ninguna flecha se
// dibuja hasta que alguien toque un encabezado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLASE_BOTON_TEXTO, CLASE_FILA_MENU, CLASE_TOQUE_44, HojaMenu } from "@/components/celular/BarraDeControles";
import {
  alTocar,
  escribirOrden,
  flecha,
  leerOrden,
  ordenarFilas,
  type Orden,
  type ValorOrden,
} from "@/lib/orden-tabla";

export type { Orden } from "@/lib/orden-tabla";

export interface OpcionesOrdenTabla<K extends string> {
  /** Las columnas que se pueden ordenar. */
  columnas: readonly K[];
  /** Las que son TEXTO (arrancan de la A a la Z); las demás son números. */
  textos?: readonly K[];
  /** El orden al abrir; `null` = el orden de siempre de la pantalla. */
  inicial?: Orden<K> | null;
  /** «aparato» (default) = se recuerda siempre; «visita» = hasta cerrar la pestaña. */
  recordar?: "aparato" | "visita";
}

export interface OrdenTablaApi<K extends string> {
  orden: Orden<K> | null;
  tocar: (col: K) => void;
  poner: (o: Orden<K> | null) => void;
  ordenar: <T>(filas: readonly T[], valor: (fila: T, col: K) => ValorOrden) => T[];
}

function almacen(recordar: "aparato" | "visita"): Storage | null {
  try {
    return recordar === "visita" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function useOrdenTabla<K extends string>(tabla: string, o: OpcionesOrdenTabla<K>): OrdenTablaApi<K> {
  const { columnas, textos, inicial = null, recordar = "aparato" } = o;
  const clave = `fg_orden_${tabla}`;
  const [orden, setOrden] = useState<Orden<K> | null>(inicial);
  const cols = columnas.join("|");

  // Se lee DESPUÉS de montar: en el servidor no hay almacén y la hidratación
  // tiene que coincidir (la lección de `useLastUsed`).
  useEffect(() => {
    const guardado = leerOrden(almacen(recordar)?.getItem(clave), cols.split("|") as K[]);
    if (guardado) setOrden(guardado);
  }, [clave, cols, recordar]);

  const poner = useCallback((nuevo: Orden<K> | null) => {
    setOrden(nuevo);
    try {
      const s = almacen(recordar);
      if (nuevo) s?.setItem(clave, escribirOrden(nuevo));
      else s?.removeItem(clave);
    } catch { /* sin almacén, el orden dura lo que dura la pantalla */ }
  }, [clave, recordar]);

  const txt = (textos ?? []).join("|");
  const tocar = useCallback(
    (col: K) => poner(alTocar(orden, col, txt.split("|").includes(col))),
    [orden, poner, txt],
  );

  const ordenar = useCallback(
    <T,>(filas: readonly T[], valor: (fila: T, col: K) => ValorOrden) => ordenarFilas(filas, orden, valor),
    [orden],
  );

  return useMemo(() => ({ orden, tocar, poner, ordenar }), [orden, tocar, poner, ordenar]);
}

/**
 * El encabezado que ordena: el rótulo es un botón y al lado va ▲/▼ chico. El
 * hueco de la flecha está siempre reservado, así el rótulo no salta al tocarlo.
 */
export function ThOrden<K extends string>({
  col,
  api,
  children,
  className,
  derecha = false,
}: {
  col: K;
  api: Pick<OrdenTablaApi<K>, "orden" | "tocar">;
  children: ReactNode;
  className?: string;
  /** Columna de números: el rótulo y la flecha se alinean a la derecha. */
  derecha?: boolean;
}) {
  const f = flecha(api.orden, col);
  return (
    <th
      data-th-orden={col}
      aria-sort={f ? (f === "▲" ? "ascending" : "descending") : undefined}
      className={cn(derecha && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => api.tocar(col)}
        className={cn(
          "inline-flex select-none items-center gap-1 [text-transform:inherit] hover:text-gray-700",
          CLASE_TOQUE_44,
          derecha && "flex-row-reverse",
          f && "text-gray-900",
        )}
      >
        <span>{children}</span>
        <span aria-hidden className="inline-block w-2 text-xs leading-none">{f}</span>
      </button>
    </th>
  );
}

/**
 * Celular: «Ordenar ▾» y una hoja con las MISMAS opciones que los encabezados
 * de la computadora. Tocar la opción ya elegida invierte el orden.
 */
export function OrdenarEnLaBarra<K extends string>({
  api,
  opciones,
}: {
  api: Pick<OrdenTablaApi<K>, "orden" | "tocar">;
  opciones: readonly { col: K; rotulo: string }[];
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = useCallback(() => setAbierta(false), []);
  return (
    <>
      <button type="button" data-ordenar-barra onClick={() => setAbierta(true)} className={CLASE_BOTON_TEXTO}>
        Ordenar
        <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      </button>
      <HojaMenu abierta={abierta} onCerrar={cerrar} titulo="Ordenar por">
        {opciones.map((op) => {
          const f = flecha(api.orden, op.col);
          return (
            <button
              key={op.col}
              type="button"
              data-ordenar-opcion={op.col}
              aria-pressed={!!f}
              onClick={() => api.tocar(op.col)}
              className={cn(CLASE_FILA_MENU, "justify-between", f && "font-semibold")}
            >
              <span>{op.rotulo}</span>
              <span aria-hidden className="text-xs">{f}</span>
            </button>
          );
        })}
      </HojaMenu>
    </>
  );
}
