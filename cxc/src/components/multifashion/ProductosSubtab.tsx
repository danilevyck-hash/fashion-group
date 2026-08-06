"use client";

// Sub-tab "Productos" de Multifashion: lo más vendido del mes.
//
// UN solo cuerpo con DOS agrupadores (por artículo / por marca). Las columnas
// son las mismas en los dos —unidades, monto, % del total— porque es la misma
// pregunta a dos alturas distintas: no hay razón para que se lean diferente.
//
// El período es el MISMO selector de mes del módulo (el shell lo baja por prop),
// no uno propio: dos controles de período en la misma pantalla es la forma más
// fácil de mirar dos meses distintos creyendo que se mira uno.
//
// ── DECISIONES DE ANCHO (regla de los 3 anchos: 390 / 834 / 1440) ───────────
// Tabla en `lg` para arriba y TARJETAS abajo, igual que Vendedoras. El corte es
// `lg` y no `md` porque lo que manda es el ancho ÚTIL: la barra lateral se lleva
// 224 px, así que un iPad de 834 deja 610. Una tabla de 5 columnas con montos no
// entra ahí sin recortar, y en este módulo ya hubo una pantalla que RECORTABA
// datos sin scroller (Clientes, 288 px inalcanzables — CLAUDE.md). La tabla vive
// dentro de un `overflow-x-auto` propio: si algún día no entra, se arrastra —
// nunca se pierde.

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Package, Tag, Info } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

type Agrupador = "articulo" | "marca";

interface RenglonArticulo {
  articuloId: number;
  codigo: string;
  descripcion: string;
  unidades: number;
  venta: number;
  pct: number | null;
}

interface RenglonMarca {
  marcaId: number | null;
  marca: string;
  unidades: number;
  venta: number;
  pct: number | null;
  articulos: number;
}

interface ProductosResp {
  year: number;
  mes: number;
  desde: string;
  hasta: string;
  filasLeidas: number;
  marcaDisponible: boolean;
  totales: { unidades: number; venta: number; articulos: number };
  articulos: RenglonArticulo[];
  marcas: RenglonMarca[];
  sinMarca: { articulos: number; venta: number };
}

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Unidades: la columna es `numeric(14,4)` pero en la práctica son piezas
 *  enteras. Se muestran sin decimales salvo que realmente los tengan. */
function fmtUnidades(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtPct(p: number | null): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

interface ProductosSubtabProps {
  selectedYear: number;
  mes: number;
}

export function ProductosSubtab({ selectedYear, mes }: ProductosSubtabProps) {
  const [agrupador, setAgrupador] = useState<Agrupador>("articulo");

  const url = `/api/multifashion/productos?year=${selectedYear}&mes=${mes}`;
  const { data: resp, error, isLoading, mutate } = useSWR<ProductosResp>(
    url,
    async (u: string) => {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<ProductosResp>;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const loading = isLoading && !resp;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // El período que se está mirando lo dice el SERVIDOR (`resp.year`/`resp.mes`),
  // no el estado local: para `gerente_acs` el servidor acota el pedido, y el
  // rótulo tiene que decir lo que se está viendo de verdad, no lo que se pidió.
  const periodo = resp ? `${MES_FULL[resp.mes - 1]} ${resp.year}` : `${MES_FULL[mes - 1]} ${selectedYear}`;

  const renglones = resp
    ? agrupador === "articulo"
      ? resp.articulos.map(a => ({
          clave: String(a.articuloId),
          titulo: a.codigo || `#${a.articuloId}`,
          sub: a.descripcion,
          unidades: a.unidades,
          venta: a.venta,
          pct: a.pct,
        }))
      : resp.marcas.map(m => ({
          clave: `${m.marcaId ?? "s"}-${m.marca}`,
          titulo: m.marca,
          sub: `${m.articulos.toLocaleString("en-US")} artículo${m.articulos === 1 ? "" : "s"}`,
          unidades: m.unidades,
          venta: m.venta,
          pct: m.pct,
        }))
    : [];

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudieron cargar los productos: {errorMsg}
          <button
            onClick={() => mutate()}
            className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Agrupador. 44 px de alto (regla táctil): es el control que más se toca
          de la pestaña y en este módulo ya hubo píldoras de 26 px (CLAUDE.md).
          `-my-1.5` para que crecer no despegue el filtro del título. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Agrupar por">
        <PillAgrupador activo={agrupador === "articulo"} onClick={() => setAgrupador("articulo")}>
          <Package className="h-3.5 w-3.5" /> Por artículo
        </PillAgrupador>
        <PillAgrupador activo={agrupador === "marca"} onClick={() => setAgrupador("marca")}>
          <Tag className="h-3.5 w-3.5" /> Por marca
        </PillAgrupador>
      </div>

      <div className={cn(loading && "opacity-60 transition-opacity")}>
        <h3 className="font-display text-base font-semibold text-gray-950">
          Más vendido · {periodo}
        </h3>
        {resp && (
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{fmtUnidades(resp.totales.unidades)}</span> unidades ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMoney(resp.totales.venta)}</span> ·{" "}
            <span className="font-mono tabular-nums text-gray-700">
              {resp.totales.articulos.toLocaleString("en-US")}
            </span>{" "}
            artículos distintos
          </p>
        )}
        {/* Se dice de dónde sale el número Y qué se le restó. Las devoluciones
            YA están descontadas; sin la nota, alguien va a sumar el mes a mano
            contra Switch y no le va a cuadrar. */}
        <p className="mt-1 text-xs text-gray-400">
          Ventas netas: las notas de crédito (devoluciones) están restadas. El % es sobre el total del mes.
        </p>
      </div>

      {/* El agrupador por marca depende del diccionario del catálogo de Switch.
          Si todavía no está cargado se DICE — la alternativa sería deducir la
          marca del código del proveedor, o sea inventarla. */}
      {agrupador === "marca" && resp && !resp.marcaDisponible && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Todavía no está cargado el catálogo de marcas de la tienda, así que todo aparece como{" "}
            <strong>Sin marca</strong>. Se llena solo en la próxima actualización diaria.
          </span>
        </div>
      )}
      {agrupador === "marca" && resp && resp.marcaDisponible && resp.sinMarca.articulos > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-mono tabular-nums">{resp.sinMarca.articulos.toLocaleString("en-US")}</span> artículos
            del mes ({fmtMoney(resp.sinMarca.venta)}) todavía no tienen marca en el catálogo de la tienda.
          </span>
        </div>
      )}

      {resp && renglones.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-700">No hubo ventas en {periodo}.</p>
        </Card>
      ) : (
        <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
          {/* Escritorio */}
          <Card data-vista="tabla" className="hidden p-0 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="w-10 border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">#</th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      {agrupador === "articulo" ? "Artículo" : "Marca"}
                    </th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Unidades</th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Monto</th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r, i) => (
                    <tr key={r.clave}>
                      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{i + 1}</td>
                      <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
                        <span className="font-medium">{r.titulo}</span>
                        {r.sub && <span className="ml-2 text-xs text-gray-500">{r.sub}</span>}
                      </td>
                      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{fmtUnidades(r.unidades)}</td>
                      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(r.venta)}</td>
                      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{fmtPct(r.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Celular e iPad. El monto y el % van en la MISMA línea pero en
              extremos opuestos con `justify-between`: en este módulo dos cifras
              pegadas ya se superpusieron una vez a 390 px (CLAUDE.md). */}
          <div data-vista="tarjetas" className="space-y-2 lg:hidden">
            {renglones.map((r, i) => (
              <Card key={r.clave} className="p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 font-mono text-xs text-gray-400 tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-950">{r.titulo}</p>
                    {r.sub && <p className="truncate text-xs text-gray-500">{r.sub}</p>}
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <span className="font-mono text-xs text-gray-600 tabular-nums">
                        {fmtUnidades(r.unidades)} u.
                      </span>
                      <span className="font-mono text-sm font-medium text-gray-950 tabular-nums">
                        {fmtMoney(r.venta)}
                      </span>
                      <span className="font-mono text-xs text-gray-500 tabular-nums">{fmtPct(r.pct)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PillAgrupador({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "-my-1.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition",
        activo
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}
