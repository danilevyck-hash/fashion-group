"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › Productos MÍNIMO — las tres piezas nuevas del mockup aprobado
// (23-sep-2026), detrás de `RETAIL_AL_FRENTE`. 9 elementos → 5.
//
//   · `PulsoSinVenta`: UNIDADES · UTILIDAD · MARGEN. 🩸 La celda VENTA se fue:
//     ya está en el titular del Resumen (y con 27 ¢ de diferencia, porque son
//     dos fuentes: el documento vs los renglones de artículo). Debajo, una sola
//     línea: «Comparado con 1–22 sep 2025 · ⓘ» — la nota fija «las devoluciones
//     ya están restadas» pasó al ⓘ.
//   · `LineaMarcas`: «Tommy 71% · Calvin 24% · Karl 3% · el resto 1%» en UNA
//     línea, con el detalle (el selector de siempre, con su margen por marca) a
//     un toque. 🩸 Eran 7 renglones y 4 sumaban el 1,4 %.
//   · `TablaTop`: UNA tabla de 5 filas (# · Categoría · Piezas · Venta · Deja ·
//     Margen) en vez de dos listas que repetían los mismos nombres.
//
// 🔴 En Productos NO se marca el mayoreo (Daniel: «no importa»): esta pestaña
// lee `switch_articulo_diario`, que no trae cliente, y ya contaba todo.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Ayuda } from "@/components/shared/Ayuda";
import { fmtMoney } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { variacion, type TopFila } from "@/lib/multifashion/productos-resumen";
import type { TotalesRanking } from "@/lib/multifashion/productos-ranking";
import type { TotalesMarca } from "@/lib/multifashion/productos-marca";
import type { GrupoMarcaId } from "@/lib/multifashion/marcas-grupo";
import {
  CeldaPulso, fmtFecha, fmtMargen, fmtMontoConSigno, fmtUnidades, fmtUnidadesConSigno,
  flechaVariacion, tonoVariacion,
} from "./productos-celdas";

// ── 1. La banda: UNIDADES · UTILIDAD · MARGEN ────────────────────────────────

export function PulsoSinVenta({
  totales,
  comparativo,
  totalesAnterior,
}: {
  totales: TotalesRanking;
  comparativo: { desde: string; hasta: string; parcial: boolean } | null;
  totalesAnterior: TotalesRanking | null;
}) {
  const c = totalesAnterior;
  const hayMargen = c != null && c.margen != null && totales.margen != null;
  const puntos = hayMargen ? (totales.margen as number) - (c.margen as number) : null;
  return (
    <Card data-elemento="banda" className="overflow-hidden p-0">
      <div className="divide-y divide-gray-100 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <CeldaPulso
          rotulo="Unidades"
          valor={fmtUnidades(totales.unidades)}
          tono="volumen"
          delta={c ? variacion(totales.unidades, c.unidades) : null}
          anterior={c ? `${fmtUnidades(c.unidades)} piezas` : null}
          fmtAbs={fmtUnidadesConSigno}
        />
        <CeldaPulso
          rotulo="Utilidad"
          valor={fmtMoney(totales.utilidad)}
          tono="plata"
          delta={c ? variacion(totales.utilidad, c.utilidad) : null}
          anterior={c ? fmtMoney(c.utilidad) : null}
          fmtAbs={fmtMontoConSigno}
        />
        {/* El margen es una proporción: se compara en PUNTOS, no en %. */}
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Margen</p>
          <p className="mt-1 font-mono text-2xl font-medium leading-tight tabular-nums text-gray-950">
            {fmtMargen(totales.margen)}
          </p>
          {puntos != null && c && (
            <p className="mt-1 text-xs text-gray-500">
              <span className={cn("font-mono font-medium tabular-nums", tonoVariacion(puntos))}>
                {flechaVariacion(puntos)} {puntos >= 0 ? "+" : "−"}{Math.abs(puntos * 100).toFixed(1)} pts
              </span>{" "}
              contra <span className="font-mono tabular-nums">{fmtMargen(c.margen)}</span> el año pasado
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        {comparativo ? (
          <span>
            Comparado con {fmtFecha(comparativo.desde)} – {fmtFecha(comparativo.hasta)}
            {!c && ". En ese período esta marca no vendió nada."}
          </span>
        ) : (
          <span>Sin comparación contra el año pasado en este momento.</span>
        )}
        {/* La nota fija y la fórmula viven en el ⓘ: se aprenden una vez. */}
        <Ayuda titulo="Cómo se cuenta">
          Ventas netas: las devoluciones (notas de crédito) ya están restadas.
          {comparativo?.parcial ? " Se compara contra los mismos días del año pasado, para que sea comparable." : ""}
          {" "}El margen es la utilidad dividida entre la venta.
        </Ayuda>
      </div>
    </Card>
  );
}

// ── 2. Las marcas, en una línea ─────────────────────────────────────────────

/** «Tommy 71% · Calvin 24% · Karl 3% · el resto 1%». Puro; lo lee el candado. */
export function textoLineaMarcas(grupos: readonly TotalesMarca[], totalPeriodo: number, maximo = 3): string {
  if (totalPeriodo <= 0 || grupos.length === 0) return "";
  const orden = [...grupos].sort((a, b) => b.totales.venta - a.totales.venta || a.nombre.localeCompare(b.nombre, "es"));
  const pct = (v: number) => `${Math.round((v / totalPeriodo) * 100)}%`;
  const primerNombre = (n: string) => n.split(" ")[0];
  const grandes = orden.slice(0, maximo);
  const resto = orden.slice(maximo).reduce((s, g) => s + g.totales.venta, 0);
  const partes = grandes.map((g) => `${primerNombre(g.nombre)} ${pct(g.totales.venta)}`);
  if (orden.length > maximo) partes.push(`el resto ${pct(resto)}`);
  return partes.join(" · ");
}

export function LineaMarcas({
  grupos,
  totalPeriodo,
  seleccion,
  detalle,
}: {
  grupos: readonly TotalesMarca[];
  totalPeriodo: number;
  seleccion: GrupoMarcaId | null;
  /** El selector de siempre (con el margen de cada marca), a un toque. */
  detalle: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const texto = textoLineaMarcas(grupos, totalPeriodo);
  const elegida = seleccion ? grupos.find((g) => g.id === seleccion)?.nombre ?? null : null;
  return (
    <div data-elemento="marcas" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
        <span className="font-mono tabular-nums">{texto}</span>
        {elegida && (
          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">viendo {elegida}</span>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex min-h-[44px] items-center gap-0.5 text-xs font-medium text-teal-700 hover:text-teal-900"
        >
          detalle <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", abierto && "rotate-90")} />
        </button>
      </div>
      {abierto && detalle}
    </div>
  );
}

// ── 3. Una sola tabla ───────────────────────────────────────────────────────

export function TablaTop({
  filas,
  sustantivo,
}: {
  filas: readonly TopFila[];
  sustantivo: string;
}) {
  if (filas.length === 0) return null;
  const titulo = sustantivo === "categorías" ? "Categoría" : "Artículo";
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 520 }}>
          <thead>
            <tr className="bg-gray-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="w-8 border-b border-gray-200 px-3 py-2 text-right">#</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left">{titulo}</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right">Piezas</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right">Venta</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right">Deja</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.clave}>
                <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-xs tabular-nums text-gray-400">{i + 1}</td>
                <td className="border-b border-gray-100 px-3 py-2 text-sm text-gray-950">
                  <span className="block truncate" title={f.etiqueta}>{f.etiqueta}</span>
                  {f.detalle && <span className="block truncate text-xs text-gray-500">{f.detalle}</span>}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-sm tabular-nums text-gray-950">{fmtUnidades(f.unidades)}</td>
                <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-sm tabular-nums text-gray-700">{fmtMoney(f.venta)}</td>
                <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-sm tabular-nums text-teal-800">{fmtMoney(f.utilidad)}</td>
                <td className="border-b border-gray-100 px-3 py-2 text-right font-mono text-sm tabular-nums text-gray-700">{fmtMargen(f.margen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
