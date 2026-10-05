"use client";

// Ventas › Productos con la pantalla común (PRODUCTOS_FILTROS_2026_10).
// Empresa ▾ (Todas o una de las 6, la última recordada) · Departamento ▾ ·
// Género ▾ · Descripción ▾ · 🔍 código. Stock y los dos
// chips de atención («Sin venta en 90 días» · «Agotados»).

import { useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { Ayuda } from "@/components/shared/Ayuda";
import { ChipLista, PantallaProductos } from "@/components/productos/FiltrosProductos";
import { FrescuraVentasCel } from "./celular/MenuVentasCelular";
import {
  DEFAULT_PRODUCTOS_EMPRESA,
  MEMORIA_EMPRESA_PRODUCTOS,
  PRODUCTOS_EMPRESAS,
  exportProductosToExcel,
} from "@/lib/ventas/productos";
import { anotarDescarga } from "@/lib/ventas/descarga";
import { textoCuadreProductos, type CuadreProductos } from "@/lib/ventas/una-sola-venta";
import { type ArticuloVendido, type ChipFiltro, type TotalesFiltro } from "@/lib/productos/filtros";

const CHIPS_VENTAS: ChipFiltro[] = [
  { campo: "departamento", etiqueta: "Departamento" },
  { campo: "genero", etiqueta: "Género", cobertura: 0.8 },
  { campo: "descripcion", etiqueta: "Descripción", conBuscador: true },
];

const EMPRESAS = [{ valor: "todas", etiqueta: "Todas" }, ...PRODUCTOS_EMPRESAS.map(e => ({ valor: e.key, etiqueta: e.nombre }))];

interface Respuesta { desde: string; hasta: string; hoy: string; articulos: ArticuloVendido[]; cuadre: CuadreProductos | null }

export function ProductosFiltros({ desde, hasta, periodo, enBarra }: {
  desde: string;
  hasta: string;
  /** El selector de período, al empezar la línea (computadora). */
  periodo?: ReactNode;
  enBarra: boolean;
}) {
  const [memoria, setMemoria] = useLastUsed(MEMORIA_EMPRESA_PRODUCTOS, DEFAULT_PRODUCTOS_EMPRESA);
  const empresa = EMPRESAS.some(e => e.valor === memoria) ? memoria : DEFAULT_PRODUCTOS_EMPRESA;
  const url = `/api/ventas/productos/articulos?empresa=${empresa}&desde=${desde}&hasta=${hasta}`;
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(url, async (u: string) => {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, { revalidateOnFocus: false, keepPreviousData: true });

  // 🔴 UNA SOLA VENTA: sin filtro, el total es el del Resumen, como antes.
  const totalesSinFiltro = useMemo<TotalesFiltro | null>(() => {
    if (!data?.cuadre) return null;
    const vendidos = data.articulos.filter(a => a.unidades !== 0 || a.venta !== 0);
    const venta = data.cuadre.ventaResumen;
    const costo = vendidos.reduce((s, a) => s + a.costo, 0) + data.cuadre.notasDebito.costo;
    const utilidad = Math.round((venta - costo) * 100) / 100;
    return {
      unidades: vendidos.reduce((s, a) => s + a.unidades, 0),
      venta, costo, utilidad,
      margen: venta > 0 ? utilidad / venta : null,
    };
  }, [data]);
  const nota = textoCuadreProductos(data?.cuadre);

  const chipEmpresa = (
    <ChipLista etiqueta="Empresa" valor={empresa} opciones={EMPRESAS} onCambiar={v => v && setMemoria(v)} sinQuitar />
  );

  return (
    <PantallaProductos
      key={empresa}
      articulos={data?.articulos ?? null}
      cargando={isLoading}
      error={error ? (error instanceof Error ? error.message : "error") : null}
      onReintentar={() => void mutate()}
      chips={CHIPS_VENTAS}
      antes={<>{periodo}{chipEmpresa}</>}
      antesCelular={chipEmpresa}
      despues={<FrescuraVentasCel forma="computadora" onActualizado={() => void mutate()} />}
      conInventario
      totalesSinFiltro={totalesSinFiltro}
      notaTotales={nota ? <> <Ayuda titulo="Información">{nota}</Ayuda></> : null}
      enBarra={enBarra}
      desglosePor={empresa === "todas" ? "empresa" : undefined}
      onDescargar={(renglones, totales) => {
        // Baja lo que está en pantalla: los renglones y el total con los filtros.
        void exportProductosToExcel({
          empresa, year: Number(desde.slice(0, 4)), mes: null, periodo: "ytd", desde, hasta,
          totales: { venta: totales.venta, costo: totales.costo, margen: totales.margen },
          productos: renglones.map(r => ({
            descripcion: r.descripcion, num_codigos: r.articulos.length,
            cantidad: r.unidades, venta: r.venta, costo: r.costo, margen: r.margen,
          })),
        });
        anotarDescarga("productos", { empresa, desde, hasta });
      }}
    />
  );
}
