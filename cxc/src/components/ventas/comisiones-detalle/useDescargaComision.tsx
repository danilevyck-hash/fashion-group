"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BAJAR EL REPORTE SIN ABRIR EL DETALLE — el motor de la flechita.
//
// 🔴 SON LOS MISMOS ARCHIVOS DE SIEMPRE. El Excel sale de
// `exportComisionDetalle` y el papel de `ImpresionComision`, exactamente los que
// ya bajaban desde adentro del detalle: acá no se arma ningún reporte nuevo. Lo
// único que cambia es que el reporte no necesita que la pantalla lo dibuje
// primero.
//
// 🔴 Y ES LA MISMA LECTURA. Se piden las dos rutas que el detalle ya pide
// (`/detalle` y `/descuentos`) con los mismos parámetros: si el archivo bajado
// por la flecha y el bajado desde adentro pudieran diferir, sería porque uno de
// los dos consulta otra cosa.
//
// 🔑 CÓMO SE IMPRIME SIN ABRIR NADA. El papel se monta en un portal a <body>
// (invisible en pantalla, `hidden print:block`), se espera a que React lo pinte
// —el efecto corre DESPUÉS del commit— y recién ahí se llama a imprimir. Al
// terminar (o al cancelar el diálogo) el papel se desmonta: dejarlo puesto haría
// que el siguiente `window.print()` de otra pantalla se llevara dos documentos.
//
// ⚠️ VARIAS EMPRESAS = VARIOS REPORTES, UNO POR HOJA. Cada `ImpresionComision`
// cierra su última página sin salto, así que el salto entre reportes lo pone
// este archivo; sin él, la segunda empresa arrancaría a media hoja de la primera.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  exportComisionDetalle,
  exportComisionDetalleVarias,
  type ComisionDetalle,
  type ComisionDescuento,
} from "@/lib/ventas/comisionExcel";
import { imprimirComo } from "@/lib/comisiones/imprimir";
import {
  nombreArchivoComision,
  nombreArchivoComisionTodas,
} from "@/lib/comisiones/nombre-archivo";
import { ImpresionComision } from "./ImpresionComision";

/** Una empresa del alcance: su key y su nombre CORTO (diccionario § 0). */
export interface EmpresaDelAlcance {
  key: string;
  nombre: string;
}

interface Cargado {
  empresa: EmpresaDelAlcance;
  data: ComisionDetalle;
  descuentos: ComisionDescuento[];
}

const MENSAJE_ERROR =
  "No se pudo preparar el reporte. Revisa tu conexión e intenta de nuevo.";

async function cargarUna(
  empresa: EmpresaDelAlcance,
  year: number,
  mes: number,
  vendedor: string,
): Promise<Cargado> {
  const qs = `empresa=${empresa.key}&year=${year}&mes=${mes}&vendedor=${encodeURIComponent(vendedor)}`;
  const [resDet, resDesc] = await Promise.all([
    fetch(`/api/ventas/comisiones/detalle?${qs}`, { cache: "no-store" }),
    fetch(`/api/ventas/comisiones/descuentos?${qs}`, { cache: "no-store" }),
  ]);
  if (!resDet.ok) throw new Error(MENSAJE_ERROR);
  const data = (await resDet.json()) as ComisionDetalle;
  // Los descuentos son opcionales: sin ellos el reporte sale igual que el que
  // se ve cuando esa lectura falla dentro del detalle (falla ABIERTO).
  let descuentos: ComisionDescuento[] = [];
  if (resDesc.ok) {
    const dj = (await resDesc.json()) as { descuentos?: ComisionDescuento[] };
    if (Array.isArray(dj.descuentos)) descuentos = dj.descuentos;
  }
  return { empresa, data, descuentos };
}

export function useDescargaComision(year: number, mes: number) {
  const [hojas, setHojas] = useState<Cargado[] | null>(null);
  const [nombrePdf, setNombrePdf] = useState("");
  const [vendedorPdf, setVendedorPdf] = useState("");
  // El efecto imprime SOLO cuando el papel se montó por una descarga pedida.
  const porImprimir = useRef(false);

  useEffect(() => {
    if (!hojas || !porImprimir.current) return;
    porImprimir.current = false;
    const limpiar = () => {
      setHojas(null);
      window.removeEventListener("afterprint", limpiar);
    };
    window.addEventListener("afterprint", limpiar);
    // Red por si el navegador no dispara `afterprint`: el papel no se queda
    // puesto para siempre.
    window.setTimeout(limpiar, 60_000);
    imprimirComo(nombrePdf);
  }, [hojas, nombrePdf]);

  const cargar = useCallback(
    (empresas: EmpresaDelAlcance[], vendedor: string) =>
      Promise.all(empresas.map((e) => cargarUna(e, year, mes, vendedor))),
    [year, mes],
  );

  /** El nombre del archivo: una empresa lleva la suya; varias, «Todas». */
  const nombreDe = useCallback(
    (empresas: EmpresaDelAlcance[], vendedor: string) =>
      empresas.length === 1
        ? nombreArchivoComision(vendedor, empresas[0].key, year, mes)
        : nombreArchivoComisionTodas(vendedor, year, mes),
    [year, mes],
  );

  const descargarExcel = useCallback(
    async (empresas: EmpresaDelAlcance[], vendedor: string) => {
      const cargados = await cargar(empresas, vendedor);
      if (cargados.length === 1) {
        // El MISMO archivo que baja «Descargar el detalle» desde adentro.
        await exportComisionDetalle(
          cargados[0].data,
          cargados[0].empresa.nombre,
          cargados[0].descuentos.filter((d) => d.activo),
        );
        return;
      }
      await exportComisionDetalleVarias(
        cargados.map((c) => ({
          data: c.data,
          empresaNombre: c.empresa.nombre,
          descuentos: c.descuentos.filter((d) => d.activo),
        })),
        vendedor,
        year,
        mes,
      );
    },
    [cargar, year, mes],
  );

  const descargarPdf = useCallback(
    async (empresas: EmpresaDelAlcance[], vendedor: string) => {
      const cargados = await cargar(empresas, vendedor);
      setNombrePdf(nombreDe(empresas, vendedor));
      setVendedorPdf(vendedor);
      porImprimir.current = true;
      setHojas(cargados);
    },
    [cargar, nombreDe],
  );

  /** El papel. La vista lo renderiza; en pantalla no se ve nada. */
  const papel =
    hojas && typeof document !== "undefined"
      ? createPortal(
          <div data-cds-print="" data-cds-lote={hojas.length}>
            {/* El salto entre reportes: cada `ImpresionComision` cierra su
                última hoja sin `break-after`, así que sin esto la segunda
                empresa arrancaría a media hoja de la primera. */}
            <style>{`@media print {
              [data-cds-lote] > [data-cds-print] + [data-cds-print] {
                break-before: page; page-break-before: always;
              }
              /* 🩸 SOLO ESTE PAPEL. Si el detalle está abierto, su hoja también
                 está montada en <body> y saldría pegada a este archivo: el PDF
                 de una empresa traería el reporte de otra atrás. */
              body > [data-cds-print]:not([data-cds-lote]) { display: none !important; }
            }`}</style>
            {hojas.map((h) => (
              <ImpresionComision
                key={h.empresa.key}
                data={h.data}
                descuentos={h.descuentos}
                empresaNombre={h.empresa.nombre}
                vendedor={vendedorPdf}
                year={year}
                mes={mes}
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  return { descargarExcel, descargarPdf, papel, MENSAJE_ERROR };
}
