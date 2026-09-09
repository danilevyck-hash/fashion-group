"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BAJAR EL REPORTE SIN ABRIR EL DETALLE — el motor de la flechita.
//
// 🔴 SON LOS MISMOS ARCHIVOS DE SIEMPRE. El Excel sale de
// `exportComisionDetalle` y el PDF de `pdf-comision`, exactamente los que bajan
// desde adentro del detalle: acá no se arma ningún reporte nuevo. Lo único que
// cambia es que el reporte no necesita que la pantalla lo dibuje primero.
//
// 🔴 Y ES LA MISMA LECTURA. Se piden las dos rutas que el detalle ya pide
// (`/detalle` y `/descuentos`) con los mismos parámetros: si el archivo bajado
// por la flecha y el bajado desde adentro pudieran diferir, sería porque uno de
// los dos consulta otra cosa.
//
// 🔄 9-SEP-2026 — SE FUE EL PAPEL EN HTML. Hasta hoy el reporte se montaba en un
// portal a `<body>` (invisible, `hidden print:block`), se esperaba a que React
// lo pintara y recién ahí se llamaba a `window.print()`. Daniel: *«¿no podemos
// hacer un botón de PDF, ya que de PDF en la compu paso a imprimir?»*. Ahora el
// PDF se arma en código y se baja; no hay nada que montar, nada que esperar y
// nada que desmontar después.
//
// 🩸 Y CON ESO SE CIERRA SOLO EL DEFECTO QUE OBLIGABA A TAPAR CON CSS: con el
// detalle abierto, su hoja también vivía en `<body>` y entraba al mismo trabajo
// de impresión — el PDF de una empresa se llevaba el reporte de otra pegado
// atrás. El documento ahora se arma SOLO con las hojas que se le pasan.
//
// ⚠️ VARIAS EMPRESAS = VARIOS REPORTES, UNO POR HOJA. El salto entre reportes lo
// pone el generador (`construirPdfComision` abre hoja nueva por empresa).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import {
  exportComisionDetalle,
  exportComisionDetalleVarias,
  type ComisionDetalle,
  type ComisionDescuento,
} from "@/lib/ventas/comisionExcel";
import { descargarPdfComision } from "@/lib/comisiones/pdf-comision";
import {
  nombreArchivoComision,
  nombreArchivoComisionTodas,
} from "@/lib/comisiones/nombre-archivo";

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
      descargarPdfComision(
        cargados.map((c) => ({
          data: c.data,
          descuentos: c.descuentos,
          empresaNombre: c.empresa.nombre,
          vendedor,
          year,
          mes,
        })),
        nombreDe(empresas, vendedor),
      );
    },
    [cargar, nombreDe, year, mes],
  );

  return { descargarExcel, descargarPdf, MENSAJE_ERROR };
}
