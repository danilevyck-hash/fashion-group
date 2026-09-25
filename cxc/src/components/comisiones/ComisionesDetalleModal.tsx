"use client";

// Reporte detallado de comisión de un vendedor (período) — módulo Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre. Se descarga
// a Excel (xlsx-js-style) y se imprime.
//
// ─── 6-sep-2026: cinco cambios de forma, cero de cálculo ─────────────────────
//
// 🔴 **SE ABRE ABAJO, NO ENCIMA** (`inline`). La matriz son 3 filas y ocupa un
// tercio de la pantalla; el resto estaba en blanco y el modal tapaba justo lo
// que estabas mirando. Desde la matriz el reporte se dibuja DEBAJO de la tabla,
// con la celda tocada resaltada. **El modal se queda** —la vista de una empresa
// lo sigue usando— y las dos formas son el MISMO componente: dibujar una segunda
// pantalla de detalle es cómo se llega a que las dos digan cosas distintas.
//
// 🔴 **EL TOTAL VA ARRIBA.** Abría con 30+ filas y había que bajar hasta el
// final para ver el número. Ahora está pegado al título, con «Ventas $345,27 ·
// Cobros $307,15» debajo en gris (los dos componentes que lo forman). El cierre
// de abajo NO se toca: es donde se ve la cuenta completa.
//
// 🔴 **LA FACTURA, CORTA EN PANTALLA.** `11-000003022` no cabía y partía cada
// fila en dos líneas: se muestran los últimos 4 dígitos (`3022`), con la MISMA
// regla que Guías (`lib/comisiones/factura-en-pantalla`). ⚠️ En el Excel y en el
// papel se queda LARGA — Daniel: «no».
//
// 🔴 **SE FUE LA COLUMNA «TIPO» (FA / NC)** de la pantalla: la nota de crédito
// ya va en rojo y con el monto en negativo. En el Excel y en el papel se queda,
// que es donde se concilia contra Switch.
//
// 🔴 UN SOLO BOTÓN, Y ES «PDF» (9-sep-2026). Daniel: *«¿no podemos hacer un
// botón de PDF, ya que de PDF en la compu paso a imprimir?»*. Desde un PDF ya se
// imprime, así que «Imprimir» sobraba.
//
// 🩸 Y ANTES NO SALÍA NINGÚN ARCHIVO: el reporte se dibujaba en HTML y se
// llamaba a `window.print()`, o sea que lo que aparecía era el DIÁLOGO del
// navegador y «Guardar como PDF» quedaba escondido adentro. Ahora el botón baja
// un PDF de verdad, armado con jsPDF en `lib/comisiones/pdf-comision.ts`, con el
// nombre de siempre (`Comisión-Edwin-Vistana-2026-08`) puesto por NOSOTROS y no
// por el `document.title` del navegador.
//
// 🩸 Con eso se cierra solo el defecto de que el PDF de una empresa se llevara el
// reporte de otra pegado atrás: el documento se arma con las hojas que se le
// pasan, no con lo que haya montado en `<body>`.

import { useEffect, useState } from "react";
import { X, Download, FileText, Send } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, comisionLinea, type ComisionDetalle, type ComisionDescuento } from "@/lib/ventas/comisionExcel";
import { ModalOverlay } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { facturaParaMostrar } from "@/lib/comisiones/factura-en-pantalla";
import { nombreArchivoComision } from "@/lib/comisiones/nombre-archivo";
// 🔴 EL PDF SE ARMA EN UN SOLO LUGAR: la flechita de la celda baja el MISMO
// reporte sin abrir esta pantalla, y dos generadores es cómo se llega a que el
// archivo de un camino y el del otro no se parezcan.
import { descargarPdfComision } from "@/lib/comisiones/pdf-comision";
// 🔴 «Mandar» = la hoja de compartir del teléfono con el PDF, igual que
// «Compartir» de Guías. El papel es el MISMO que baja «Descargar».
import { PAPEL_DESCARGADO, compartirComision } from "@/lib/comisiones/mandar";
import { anotarDescargaComision, anotarMandarComision } from "@/lib/comisiones/rastro";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import {
  AVISO_DESLIZA,
  COLUMNAS_DETALLE_COBRO,
  COLUMNAS_DETALLE_VENTA,
  ROTULO_MANDAR,
} from "@/lib/comisiones/celular";
import { useEsCelularComisiones } from "./celular/useEsCelularComisiones";

const round2 = (n: number) => Math.round(n * 100) / 100;

// La columna "Comisión" de cada tabla es informativa: muestra cuánto aporta ese
// renglón. El total que se paga NO es la suma de esos renglones — el RPC redondea
// la BASE del mes (ROUND(base × tasa)), no documento por documento, así que la
// suma de líneas redondeadas puede diferir 1-2 centavos. Los pies de tabla
// muestran SIEMPRE el número del RPC (el mismo del cierre), y esta nota explica
// por qué "de a poquito" puede no dar exacto.
const NOTA_COMISION_LINEA =
  "La comisión de cada línea es referencial. El total se calcula sobre el total del mes, " +
  "por eso puede diferir unos centavos de la suma de las líneas.";

/** Quién puede APAGAR/PRENDER un descuento del mes. Espejo exacto del
 *  `requireRole` de `POST /api/ventas/comisiones/descuentos`. Si esa lista se
 *  mueve, esta se mueve con ella — un botón que el server rechaza es peor que
 *  ningún botón. */
/**
 * 🔴 EL ORDEN DE LAS COLUMNAS DEL DETALLE. En el celular la plata va primero
 * (la «3h»); en la computadora, el orden de siempre. Los NOMBRES y el
 * contenido de cada columna salen de `lib/comisiones/celular.ts`, en un solo
 * lugar, para que el candado compare contra la regla y no contra el JSX.
 */
function COLUMNAS_VENTA_EN_ORDEN(enCelular: boolean) {
  return enCelular
    ? COLUMNAS_DETALLE_VENTA
    : ([
        { clave: "fecha", rotulo: "Fecha", alineado: "izq" },
        { clave: "cliente", rotulo: "Cliente", alineado: "izq" },
        { clave: "factura", rotulo: "Factura", alineado: "izq" },
        { clave: "subtotal", rotulo: "Subtotal", alineado: "der" },
        { clave: "utilidad", rotulo: "% Util.", alineado: "der" },
        { clave: "comision", rotulo: "Comisión", alineado: "der" },
      ] as const);
}

function COLUMNAS_COBRO_EN_ORDEN(enCelular: boolean) {
  return enCelular
    ? COLUMNAS_DETALLE_COBRO
    : ([
        { clave: "fecha", rotulo: "Fecha", alineado: "izq" },
        { clave: "cliente", rotulo: "Cliente", alineado: "izq" },
        { clave: "monto", rotulo: "Monto", alineado: "der" },
        { clave: "comision", rotulo: "Comisión", alineado: "der" },
      ] as const);
}

export const ROLES_EDITAR_DESCUENTOS = ["admin", "secretaria"];

interface Props {
  empresa: string;
  /** Nombre CORTO de la empresa (diccionario § 0). */
  empresaNombre: string;
  year: number;
  mes: number;
  vendedor: string;
  onClose: () => void;
  /**
   * Se dibuja DEBAJO de la tabla en vez de encima. La hoja de impresión va al
   * portal igual, así que imprimir sale idéntico en las dos formas.
   */
  inline?: boolean;
}

export function ComisionesDetalleModal({ empresa, empresaNombre, year, mes, vendedor, onClose, inline = false }: Props) {
  const [data, setData] = useState<ComisionDetalle | null>(null);
  const [descuentos, setDescuentos] = useState<ComisionDescuento[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // 🔴 ESPEJO DE `POST /api/ventas/comisiones/descuentos`, que es
  // `["admin","secretaria"]` (25-ago-2026). Contabilidad entró al módulo para
  // VER: MEDIDO, ese POST le contesta **403**, y el toggle es optimista —
  // pintaba el cambio y lo revertía sin decir una palabra, así que el descuento
  // se veía apagado un segundo y volvía solo. Sin toggle ve el MISMO número
  // (el neto ya viene restado del servidor), sin un control que le miente.
  const [puedeEditarDescuentos, setPuedeEditarDescuentos] = useState(false);
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setPuedeEditarDescuentos(ROLES_EDITAR_DESCUENTOS.includes(r));
  }, []);
  const [loading, setLoading] = useState(true);
  /** 🔴 «Mandar» (la «9r»): mientras el aparato tiene la hoja abierta. */
  const [mandando, setMandando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enCelular = useEsCelularComisiones();
  const [error, setError] = useState<string | null>(null);
  // 🔄 9-SEP-2026 — se fue el `mounted`: existía porque la hoja impresa iba en un
  // portal y `document` no existe en SSR. Sin portal, el detalle se dibuja en el
  // primer render y no se pierde un cuadro esperando el montaje.

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = `empresa=${empresa}&year=${year}&mes=${mes}&vendedor=${encodeURIComponent(vendedor)}`;
        const [resDet, resDesc] = await Promise.all([
          fetch(`/api/ventas/comisiones/detalle?${qs}`, { cache: "no-store" }),
          fetch(`/api/ventas/comisiones/descuentos?${qs}`, { cache: "no-store" }),
        ]);
        if (!resDet.ok) {
          const b = await resDet.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${resDet.status}`);
        }
        if (alive) setData((await resDet.json()) as ComisionDetalle);
        // Los descuentos son opcionales (solo algunos vendedores los tienen).
        if (resDesc.ok) {
          const dj = (await resDesc.json()) as { descuentos?: ComisionDescuento[] };
          if (alive) setDescuentos(Array.isArray(dj.descuentos) ? dj.descuentos : []);
        } else if (alive) {
          setDescuentos([]);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [empresa, year, mes, vendedor]);

  async function toggleDescuento(id: string, activo: boolean) {
    if (togglingId) return;
    setTogglingId(id);
    // Optimista: refleja el cambio y revierte si falla.
    setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo } : d)));
    try {
      const res = await fetch(`/api/ventas/comisiones/descuentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descuento_id: id, year, mes, activo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo: !activo } : d)));
    } finally {
      setTogglingId(null);
    }
  }

  const descActivos = descuentos.filter((d) => d.activo);
  const totalAPagar = data
    ? round2(data.comision_total - descActivos.reduce((s, d) => s + d.monto, 0))
    : 0;

  const pctTasaV = data ? (data.tasa_venta * 100).toFixed(2) : "";
  const pctTasaC = data ? (data.tasa_cobro * 100).toFixed(2) : "";

  const nombreArchivo = nombreArchivoComision(vendedor, empresa, year, mes);
  // 🔴 Queda rastro de cada descarga (22-sep-2026); nunca la frena.
  const anotar = (formato: "pdf" | "excel") =>
    anotarDescargaComision(formato, { alcance: "vendedor", vendedor, empresa, year, mes });

  /**
   * 🔴 «MANDAR» — el PDF a la hoja de compartir del teléfono (25-sep-2026).
   *
   * 🩸 EL PAPEL SE ARMA DENTRO DEL TOQUE, sin un solo `await` antes: Safari en
   * iOS solo abre la hoja de compartir como parte del gesto, y un `await` de red
   * en el medio la bloquea (la misma regla de la nota de entrega de Mobiliario).
   * Por eso el detalle ya está cargado —el botón se apaga sin él— y
   * `compartirComision` construye el archivo de forma SÍNCRONA.
   *
   * 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR»: `construirPdfComision`, adentro
   * de `lib/comisiones/mandar.ts`. No hay un segundo generador.
   */
  async function mandar() {
    if (!data || mandando) return;
    setMandando(true);
    try {
      const como = await compartirComision(
        [{ data, descuentos, empresaNombre, vendedor, year, mes }],
        nombreArchivo,
        nombreVendedorEnPantalla(vendedor),
        etiquetaPeriodo(year, mes),
      );
      // 🔴 Se anota DESPUÉS de que el papel salió, nunca antes.
      anotarMandarComision(como, { alcance: "vendedor", vendedor, empresa, year, mes });
      // Cancelar no es un error y no se dice nada; la descarga sí se avisa,
      // porque en la computadora el archivo se fue a la carpeta de siempre.
      if (como === "descargado") setAviso(PAPEL_DESCARGADO);
    } finally {
      setMandando(false);
    }
  }

  // ── Encabezado (título + total arriba + botones) ────────────────────────────
  const encabezado = (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">Comisión — {nombreVendedorEnPantalla(vendedor)}</h2>
        <p className="text-xs text-gray-500">{empresaNombre} · {etiquetaPeriodo(year, mes)}</p>
        {/* DEFAULT y Daniel: el detalle se calcula igual (para cuadrar qué
            se vendió y qué se cobró), pero esta plata no se paga. Daniel:
            «si yo cobro no le pago a nadie porque no me autopago». */}
        {!sePagaComision(vendedor) && (
          <p className="mt-1 text-xs text-amber-700">
            Se calcula para cuadrar, pero esta comisión no se paga.
          </p>
        )}
      </div>

      {/* 🔴 EL TOTAL, ARRIBA. Abría con 30+ filas y el número estaba al final. */}
      {data && (
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            {descActivos.length > 0 ? "Total a pagar" : "Comisión total"}
          </p>
          <p className={`text-2xl font-semibold tabular-nums ${totalAPagar < 0 ? "text-rose-600" : "text-gray-900"}`}>
            {fmtMoney(totalAPagar)}
          </p>
          <p className="text-xs text-gray-500">
            Ventas {fmtMoney(data.comision_venta)} · Cobros {fmtMoney(data.comision_cobro)}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* 🔴 «MANDAR» VIVE EN EL DETALLE DEL VENDEDOR (25-sep-2026, la «9r»):
            es donde se está mirando lo que se va a mandar.

            🔴 ABRE LA HOJA DE COMPARTIR DEL TELÉFONO CON EL PDF, igual que
            «Compartir» de Guías — WhatsApp y el correo salen ahí, en la lista
            del propio aparato. En la computadora, el papel se descarga.
            🩸 El PDF se arma DENTRO del toque, sin un `await` en el medio: iOS
            no abre la hoja si el gesto se pierde. */}
        <button
          onClick={() => void mandar()}
          disabled={!data || mandando}
          data-boton-mandar
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-gray-900 px-3 text-sm text-white transition active:scale-[0.97] disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> {mandando ? "Preparando…" : ROTULO_MANDAR}
        </button>
        <button
          onClick={() => {
            if (!data) return;
            void exportComisionDetalle(data, empresaNombre, descActivos);
            anotar("excel");
          }}
          disabled={!data}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Descargar el detalle
        </button>
        {/* 🔴 UN SOLO botón, y dice «PDF»: de un PDF ya se imprime. */}
        <button
          onClick={() => {
            if (!data) return;
            descargarPdfComision(
              [{ data, descuentos, empresaNombre, vendedor, year, mes }],
              nombreArchivo,
            );
            anotar("pdf");
          }}
          disabled={!data}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm text-gray-700 transition hover:border-black active:scale-[0.97] disabled:opacity-40"
        >
          <FileText className="h-3.5 w-3.5" /> PDF
        </button>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // ── Cuerpo de PANTALLA ─────────────────────────────────────────────────────
  const cuerpo = (
    <div className="p-4">
      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-rose-600">{error}</div>
      ) : data ? (
        <div className="space-y-6">
          {/* ══════════ VENTAS ══════════ */}
          <section>
            {/* La fórmula de la línea y por qué el total no es la suma exacta
                son metodología: se aprenden una vez. 🩸 El texto no desaparece
                — sin él, "de a poquito" no da y parece un error de cálculo. */}
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Ventas
              <Ayuda titulo="Cómo se calcula">
                <p>Comisión de cada línea = subtotal × {pctTasaV}%.</p>
                <p className="mt-2">{NOTA_COMISION_LINEA}</p>
              </Ayuda>
            </h3>

            {enCelular && (
              <p data-aviso-desliza className="mb-1 text-[11px] text-gray-500">{AVISO_DESLIZA}</p>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    {/* 🔴 EN EL CELULAR LA PLATA VA PRIMERO (25-sep-2026, la
                        «3h»). Daniel eligió las seis columnas deslizando, y en
                        la misma frase pidió que Subtotal y Comisión se vean.
                        🩸 Medido a 390 px: la tabla mide 557 px en un cajón de
                        324, así que «% UTIL.» y «COMISIÓN» se veían **0 px** de
                        69 y de 93, y «SUBTOTAL» 31 de 104: el detalle se abría
                        en dos toques y no enseñaba ni un monto. Las dos formas
                        de resolverlo eran fijar columnas o poner la plata
                        primero; ésta no depende de que el navegador soporte
                        `position: sticky` en una celda. **No se quita ninguna
                        columna y no se recalcula ni un número**: es el MISMO
                        renglón, en otro orden, y solo hasta `sm`. */}
                    {COLUMNAS_VENTA_EN_ORDEN(enCelular).map((c) => (
                      <th key={c.clave} className={`px-3 py-2 font-medium ${c.alineado === "der" ? "text-right" : ""}`}>
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.ventas.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                  ) : data.ventas.map((v, i) => (
                    // Facturas con utilidad ≤20% no comisionan: se listan con
                    // $0.00 (atribuidas al vendedor de la factura) pero en gris.
                    // La NOTA DE CRÉDITO se reconoce por el rojo y el negativo:
                    // la columna «Tipo» (FA/NC) era decir dos veces lo mismo.
                    <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : v.subtotal === 0 && v.tipo === "Factura" ? "text-gray-400" : "text-gray-800"}`}>
                      {COLUMNAS_VENTA_EN_ORDEN(enCelular).map((c) => {
                        // Los últimos 4 dígitos de la factura: el largo de
                        // Switch partía la fila en dos líneas. En el Excel va
                        // completo.
                        const contenido =
                          c.clave === "fecha" ? fmtDate(v.fecha)
                          : c.clave === "cliente" ? v.cliente
                          : c.clave === "factura" ? facturaParaMostrar(v.secuencial)
                          : c.clave === "subtotal" ? fmtMoney(v.subtotal)
                          : c.clave === "utilidad"
                            ? (v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`)
                            : fmtMoney(comisionLinea(v.subtotal, data.tasa_venta));
                        const gris = c.clave === "factura" || c.clave === "utilidad";
                        return (
                          <td
                            key={c.clave}
                            data-col-detalle={c.clave}
                            className={`px-3 py-1.5 ${c.alineado === "der" ? "text-right tabular-nums" : c.clave === "fecha" ? "whitespace-nowrap" : ""} ${gris ? "tabular-nums text-gray-500" : ""}`}
                          >
                            {contenido}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* El pie de "Comisión" muestra el número del RPC (el mismo
                      del cierre), NO la suma de las líneas: un solo total. */}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    {COLUMNAS_VENTA_EN_ORDEN(enCelular).map((c, idx) => (
                      <td
                        key={c.clave}
                        className={`px-3 py-2 ${c.alineado === "der" ? "text-right tabular-nums" : ""}`}
                      >
                        {c.clave === "comision" ? fmtMoney(data.comision_venta)
                          : c.clave === "subtotal" ? fmtMoney(data.ventas_base)
                          : idx === (enCelular ? 2 : 0) ? "TOTAL VENTAS"
                          : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ══════════ COBROS + CIERRE ══════════ */}
          <section>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Cobros
              <Ayuda titulo="Cómo se calcula">
                <p>Comisión de cada línea = monto × {pctTasaC}%.</p>
                <p className="mt-2">{NOTA_COMISION_LINEA}</p>
              </Ayuda>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    {/* 🔴 La MISMA regla de la «3h»: en el celular la plata va
                        primero. Medido: la columna COMISIÓN se veía 32 px de 93. */}
                    {COLUMNAS_COBRO_EN_ORDEN(enCelular).map((c) => (
                      <th key={c.clave} className={`px-3 py-2 font-medium ${c.alineado === "der" ? "text-right" : ""}`}>
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cobros.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Sin cobros comisionables.</td></tr>
                  ) : data.cobros.map((c, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-800">
                      {COLUMNAS_COBRO_EN_ORDEN(enCelular).map((col) => (
                        <td
                          key={col.clave}
                          data-col-detalle={col.clave}
                          className={`px-3 py-1.5 ${col.alineado === "der" ? "text-right tabular-nums" : col.clave === "fecha" ? "whitespace-nowrap" : ""}`}
                        >
                          {col.clave === "fecha" ? fmtDate(c.fecha)
                            : col.clave === "cliente" ? c.cliente
                            : col.clave === "monto" ? fmtMoney(c.monto)
                            : fmtMoney(comisionLinea(c.monto, data.tasa_cobro))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Igual que en VENTAS: el pie es el número del RPC. */}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    {COLUMNAS_COBRO_EN_ORDEN(enCelular).map((col, idx) => (
                      <td
                        key={col.clave}
                        className={`px-3 py-2 ${col.alineado === "der" ? "text-right tabular-nums" : ""}`}
                      >
                        {col.clave === "comision" ? fmtMoney(data.comision_cobro)
                          : col.clave === "monto" ? fmtMoney(data.cobros_base)
                          : idx === (enCelular ? 2 : 0) ? "TOTAL COBROS"
                          : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* SE QUEDA: explica por qué la columna del número de recibo
                viene vacía. Sin eso parece un dato perdido. */}
            <p className="mt-1 text-xs text-gray-400">El API de Switch no expone el número de recibo.</p>

            {/* Suma de las BASES sobre las que se comisiona (no de las comisiones). */}
            <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
              <span>TOTAL VENTAS + COBROS</span>
              <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
            </div>

            {/* CIERRE */}
            <section className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cierre</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Ventas {fmtMoney(data.ventas_base)} × {pctTasaV}%</dt>
                  <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_venta)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Cobros {fmtMoney(data.cobros_base)} × {pctTasaC}%</dt>
                  <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_cobro)}</dd>
                </div>
                {descuentos.length === 0 ? (
                  <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                    <dt>Comisión total</dt>
                    <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between border-t border-gray-300 pt-1.5 font-semibold text-gray-900">
                      <dt>Subtotal comisión</dt>
                      <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                    </div>
                    {descuentos.map((d) => (
                      <div key={d.id} className="flex items-center justify-between">
                        <dt className="flex items-center gap-2 text-gray-600">
                          {/* Toggle: solo quien puede escribirlo (admin/secretaria).
                              Contabilidad ve el descuento y el neto, sin el control:
                              el POST le contesta 403 y el toggle optimista revertía
                              sin decir una palabra. */}
                          {puedeEditarDescuentos && (
                            <label className="inline-flex cursor-pointer items-center" title={d.activo ? "Activo este mes — clic para desactivar" : "Desactivado este mes — clic para activar"}>
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={d.activo}
                                disabled={togglingId === d.id}
                                onChange={(e) => toggleDescuento(d.id, e.target.checked)}
                              />
                              <span className="relative h-4 w-7 rounded-full bg-gray-300 transition peer-checked:bg-gray-900 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
                            </label>
                          )}
                          <span className={d.activo ? "" : "text-gray-400 line-through"}>{d.concepto}</span>
                        </dt>
                        <dd className={`tabular-nums ${d.activo ? "text-rose-600" : "text-gray-300"}`}>−{fmtMoney(d.monto)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                      <dt>Total a pagar</dt>
                      <dd className="tabular-nums">{fmtMoney(totalAPagar)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );

  // 🔄 9-SEP-2026 — SE FUE LA HOJA IMPRESA EN HTML. Vivía en un portal a
  // `<body>` porque `window.print()` no puede aislar un pedazo de la pantalla de
  // otra forma. Con el PDF armado en código, el modal y el detalle de abajo bajan
  // el MISMO archivo sin montar nada.

  /** El acuse de «Mandar», cuando hay algo que decir. */
  const laHojaDeMandar = aviso ? (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[80] mx-auto w-fit rounded-full bg-gray-900 px-4 py-2 text-sm text-white"
    >
      {aviso}
    </div>
  ) : null;

  if (inline) {
    return (
      <>
        <section
          data-comision-detalle="inline"
          aria-label={`Detalle de comisión de ${nombreVendedorEnPantalla(vendedor)} en ${empresaNombre}`}
          className="rounded-lg border border-gray-200 bg-white print:hidden"
        >
          {encabezado}
          {cuerpo}
        </section>
        {laHojaDeMandar}
      </>
    );
  }

  return (
    <>
      <ModalOverlay align="start" backdropClassName="bg-black/40" className="overflow-y-auto p-4 print:hidden">
        <div
          data-comision-detalle="modal"
          className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {encabezado}
          {cuerpo}
        </div>
      </ModalOverlay>
      {laHojaDeMandar}
    </>
  );
}
