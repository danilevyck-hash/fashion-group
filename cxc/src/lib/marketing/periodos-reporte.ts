// ============================================================================
// Marketing — el REPORTE de un período, tal como se le manda al proveedor.
//
// 🔑 SE GUARDA UNA VEZ Y NO SE RECALCULA NUNCA. Al cerrar un período, el
// reporte se congela en `mk_periodos.reporte` (jsonb) y de ahí sale el Excel
// para siempre. Si mañana cambia una regla de reparto, el papel que el
// proveedor ya tiene en la mano NO puede cambiar solo.
//
// 🩸 LOS TOTALES NO SE VUELVEN A CALCULAR ACÁ. Salen de `agregarPorProveedor`,
// el mismo módulo puro que dibuja el inicio. Escribir una segunda cuenta es la
// forma exacta en que este repo ya se quemó con los signos de las notas de
// crédito: dos archivos diciendo cosas distintas sobre la misma plata, y nadie
// se entera hasta que un proveedor reclama. Lo único que se arma acá es el
// DETALLE (qué documentos entran), con el mismo reparto por porción.
// ============================================================================

import XLSX from "xlsx-js-style";
import {
  MONEY_FMT,
  XLSX_MIME,
  buildReportSheet,
  workbookFromSheets,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import { formatearFecha } from "./normalizar";
import { marcasDeEntrega, porcionEntregaParaMarca } from "./resumen-inicio";
import {
  agregarPorProveedor,
  type PeriodoRow,
  type SelloRow,
} from "./resumen-proveedores";
import { PROVEEDORES, SIN_PROVEEDOR, indiceProveedorPorMarcaId } from "./proveedores";
import { esTablaAusente } from "./periodos-io";

// ----------------------------------------------------------------------------
// Forma del reporte guardado
// ----------------------------------------------------------------------------

export interface ReporteLineaFactura {
  numero: string;
  fecha: string;
  proveedor: string;
  concepto: string;
  proyecto: string;
  cliente: string;
  clienteCodigo: string | null;
  marca: string;
  monto: number;
}

export interface ReporteLineaEntrega {
  fecha: string;
  proyecto: string;
  cliente: string;
  clienteCodigo: string | null;
  marca: string;
  notas: string | null;
  monto: number;
}

export interface ReporteFilaCliente {
  cliente: string;
  clienteCodigo: string | null;
  facturas: number;
  muebles: number;
  total: number;
}

export interface ReportePeriodo {
  /** Versión de la forma del jsonb. Si cambia, los viejos se siguen leyendo. */
  version: 1;
  proveedorKey: string;
  proveedorNombre: string;
  periodoId: string;
  periodoNombre: string;
  /** Cuándo se generó (que es cuándo se cerró el período). */
  generadoEn: string;
  totales: {
    facturas: { count: number; total: number };
    muebles: { count: number; total: number };
    total: number;
    proyectos: number;
  };
  facturas: ReporteLineaFactura[];
  entregas: ReporteLineaEntrega[];
  porCliente: ReporteFilaCliente[];
  porMarca: Array<{ marca: string; total: number }>;
}

/** Ids de los documentos que entraron en el reporte, para poder sellarlos. */
export interface DocumentosDelReporte {
  facturas: string[];
  entregas: string[];
}

function num(x: unknown): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}

// ----------------------------------------------------------------------------
// Lectura
// ----------------------------------------------------------------------------

interface FacturaFila {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  grupo_legacy: boolean | null;
  impulsadora_id: string | null;
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
}
interface EntregaFila {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  total_por_marca: Record<string, number> | null;
  total_por_empresa_interna: Record<string, number> | null;
  notas: string | null;
  created_at: string | null;
}
interface ProyectoFila {
  id: string;
  nombre: string | null;
  tienda: string | null;
  tienda_codigo: string | null;
}
interface MarcaFila {
  id: string;
  nombre: string | null;
  codigo: string | null;
  empresa_codigo: string | null;
}

export interface DatosPeriodos {
  facturas: FacturaFila[];
  facturaMarcas: Array<{ factura_id: string; marca_id: string; porcentaje: number | null }>;
  proyectos: ProyectoFila[];
  marcas: MarcaFila[];
  entregas: EntregaFila[];
  periodos: PeriodoRow[];
  sellos: SelloRow[];
  /** false = la migración de períodos todavía no corrió. */
  hayTablas: boolean;
}

/**
 * Todo lo que hace falta para agregar por proveedor y por período.
 *
 * Degrada igual que `/api/marketing/inicio`: sin las tablas de período,
 * `periodos` y `sellos` llegan vacíos y `hayTablas` va en false.
 */
export async function cargarDatosPeriodos(): Promise<DatosPeriodos> {
  const [factRes, fmRes, proyRes, marcasRes, entRes, perRes, selloRes] =
    await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select(
          "id, proyecto_id, total, grupo_legacy, impulsadora_id, numero_factura, fecha_factura, proveedor, concepto",
        )
        .is("anulado_en", null),
      supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id, porcentaje"),
      supabaseServer
        .from("mk_proyectos")
        .select("id, nombre, tienda, tienda_codigo")
        .is("anulado_en", null),
      supabaseServer.from("mk_marcas").select("id, nombre, codigo, empresa_codigo"),
      supabaseServer
        .from("mk_entregas_muebles")
        .select(
          "id, proyecto_id, total, total_por_marca, total_por_empresa_interna, notas, created_at",
        ),
      supabaseServer
        .from("mk_periodos")
        .select("id, proveedor_key, nombre, estado, cerrado_en"),
      supabaseServer
        .from("mk_periodo_documentos")
        .select("periodo_id, proveedor_key, tipo, documento_id"),
    ]);

  if (factRes.error) throw new Error(`facturas: ${factRes.error.message}`);
  if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
  if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
  if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
  if (entRes.error) throw new Error(`entregas: ${entRes.error.message}`);
  if (perRes.error && !esTablaAusente(perRes.error)) {
    throw new Error(`periodos: ${perRes.error.message}`);
  }
  if (selloRes.error && !esTablaAusente(selloRes.error)) {
    throw new Error(`periodo_documentos: ${selloRes.error.message}`);
  }

  return {
    facturas: (factRes.data ?? []) as FacturaFila[],
    facturaMarcas: (fmRes.data ?? []) as DatosPeriodos["facturaMarcas"],
    proyectos: (proyRes.data ?? []) as ProyectoFila[],
    marcas: (marcasRes.data ?? []) as MarcaFila[],
    entregas: (entRes.data ?? []) as EntregaFila[],
    periodos: (perRes.error ? [] : (perRes.data ?? [])) as PeriodoRow[],
    sellos: (selloRes.error ? [] : (selloRes.data ?? [])) as SelloRow[],
    hayTablas: !perRes.error && !selloRes.error,
  };
}

/** Corre el agregador puro sobre los datos leídos. Una sola cuenta. */
export function agregar(datos: DatosPeriodos) {
  const proyectosMultifashion = new Set(
    datos.proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );
  return agregarPorProveedor({
    facturas: datos.facturas as never,
    facturaMarcas: datos.facturaMarcas as never,
    entregas: datos.entregas as never,
    marcas: datos.marcas as never,
    proyectos: datos.proyectos as never,
    proyectosMultifashion,
    periodos: datos.periodos,
    sellos: datos.sellos,
  });
}

// ----------------------------------------------------------------------------
// Armado del reporte
// ----------------------------------------------------------------------------

function nombreProveedor(key: string): string {
  return PROVEEDORES.find((p) => p.key === key)?.nombre ?? key;
}

/**
 * Arma el reporte del período ABIERTO de un proveedor: SOLO su parte.
 *
 * 🔑 Qué entra: los documentos cuyo sello apunta a este período, más los que
 * todavía no tienen sello — porque "sin sello" significa "del período actual",
 * que es el default correcto y el mismo que usa la pantalla.
 *
 * 🔴 Los totales de cabecera salen de `agregarPorProveedor`, no de sumar las
 * líneas. Las líneas son el detalle; el número que se le reporta al proveedor
 * es el mismo que el dueño vio en pantalla antes de apretar "cerrar".
 */
export function armarReportePeriodo(
  datos: DatosPeriodos,
  periodo: { id: string; proveedor_key: string; nombre: string },
): { reporte: ReportePeriodo; documentos: DocumentosDelReporte } {
  const prov = String(periodo.proveedor_key);
  const resumen = agregar(datos);
  const bloque = resumen.bloques.find((b) => b.key === prov);

  const bloquePorMarca = indiceProveedorPorMarcaId(datos.marcas);
  const nombrePorMarca = new Map(
    datos.marcas.map((m) => [String(m.id), String(m.nombre ?? "")]),
  );
  const empresaPorMarca = new Map(
    datos.marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]),
  );
  const proyById = new Map(datos.proyectos.map((p) => [String(p.id), p]));
  const esMf = new Set(
    datos.proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );

  // periodo_id → estado, para saber si un sello apunta a algo ya cerrado.
  const estadoPeriodo = new Map(
    datos.periodos.map((p) => [String(p.id), String(p.estado)]),
  );
  const selloDe = new Map<string, string>();
  for (const s of datos.sellos) {
    selloDe.set(
      `${s.tipo}::${String(s.documento_id)}::${String(s.proveedor_key)}`,
      String(s.periodo_id),
    );
  }
  /** ¿Este documento entra en el período que se está cerrando? */
  const entraEnEstePeriodo = (tipo: "factura" | "entrega", docId: string): boolean => {
    const pid = selloDe.get(`${tipo}::${docId}::${prov}`);
    if (!pid) return true; // sin sello = período actual
    if (pid === periodo.id) return true;
    return estadoPeriodo.get(pid) !== "cerrado";
  };

  const datosDeProyecto = (pid: string | null) => {
    const p = pid ? proyById.get(String(pid)) : null;
    return {
      proyecto: p ? String(p.nombre ?? p.tienda ?? "") : "Sin proyecto",
      cliente: p ? String(p.tienda ?? "") : "Impulsadoras y gastos sueltos",
      clienteCodigo: p ? (p.tienda_codigo ?? null) : null,
    };
  };

  // ------------------------------------------------------------- FACTURAS
  const rowsByFactura = new Map<string, Array<{ marca_id: string; porcentaje: number }>>();
  const facturaById = new Map(datos.facturas.map((f) => [String(f.id), f]));
  for (const r of datos.facturaMarcas) {
    const fid = String(r.factura_id);
    if (!facturaById.has(fid)) continue;
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push({ marca_id: String(r.marca_id), porcentaje: num(r.porcentaje) });
    rowsByFactura.set(fid, arr);
  }

  const lineasFactura: ReporteLineaFactura[] = [];
  const idsFactura = new Set<string>();
  for (const f of datos.facturas) {
    const fid = String(f.id);
    const pid = f.proyecto_id ? String(f.proyecto_id) : null;
    if (pid && esMf.has(pid)) continue; // Multifashion no se le reporta a nadie
    const rows = rowsByFactura.get(fid) ?? [];
    if (rows.length === 0) continue;
    if (!entraEnEstePeriodo("factura", fid)) continue;
    const sumPct = rows.reduce((s, r) => s + r.porcentaje, 0) || 1;
    for (const r of rows) {
      const k = bloquePorMarca.get(r.marca_id) ?? SIN_PROVEEDOR;
      if (k !== prov) continue;
      const ctx = datosDeProyecto(pid);
      lineasFactura.push({
        numero: String(f.numero_factura ?? ""),
        fecha: String(f.fecha_factura ?? ""),
        proveedor: String(f.proveedor ?? ""),
        concepto: String(f.concepto ?? ""),
        proyecto: ctx.proyecto,
        cliente: ctx.cliente,
        clienteCodigo: ctx.clienteCodigo,
        marca: nombrePorMarca.get(r.marca_id) ?? "",
        monto: round2(num(f.total) * (r.porcentaje / sumPct)),
      });
      idsFactura.add(fid);
    }
  }

  // ------------------------------------------------------------- ENTREGAS
  const lineasEntrega: ReporteLineaEntrega[] = [];
  const idsEntrega = new Set<string>();
  for (const e of datos.entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    // Igual que el inicio: una entrega sin proyecto vivo no se atribuye.
    if (!pid || !proyById.has(pid) || esMf.has(pid)) continue;
    const eid = String(e.id);
    if (!entraEnEstePeriodo("entrega", eid)) continue;
    for (const mid of marcasDeEntrega(e as never)) {
      const k = bloquePorMarca.get(mid) ?? SIN_PROVEEDOR;
      if (k !== prov) continue;
      const monto = porcionEntregaParaMarca(e as never, mid, empresaPorMarca.get(mid));
      if (monto <= 0) continue;
      const ctx = datosDeProyecto(pid);
      lineasEntrega.push({
        fecha: String(e.created_at ?? "").slice(0, 10),
        proyecto: ctx.proyecto,
        cliente: ctx.cliente,
        clienteCodigo: ctx.clienteCodigo,
        marca: nombrePorMarca.get(mid) ?? "",
        notas: e.notas ?? null,
        monto: round2(monto),
      });
      idsEntrega.add(eid);
    }
  }

  // ------------------------------------------------------------- AGRUPADOS
  const clientes = new Map<string, ReporteFilaCliente>();
  const anotarCliente = (
    l: { cliente: string; clienteCodigo: string | null; monto: number },
    campo: "facturas" | "muebles",
  ) => {
    const key = (l.clienteCodigo ?? "").trim() || l.cliente.trim().toLowerCase();
    const fila =
      clientes.get(key) ??
      ({
        cliente: l.cliente,
        clienteCodigo: l.clienteCodigo,
        facturas: 0,
        muebles: 0,
        total: 0,
      } as ReporteFilaCliente);
    fila[campo] = round2(fila[campo] + l.monto);
    fila.total = round2(fila.total + l.monto);
    clientes.set(key, fila);
  };
  for (const l of lineasFactura) anotarCliente(l, "facturas");
  for (const l of lineasEntrega) anotarCliente(l, "muebles");

  const porMarcaAcc = new Map<string, number>();
  for (const l of [...lineasFactura, ...lineasEntrega]) {
    porMarcaAcc.set(l.marca, round2((porMarcaAcc.get(l.marca) ?? 0) + l.monto));
  }

  const reporte: ReportePeriodo = {
    version: 1,
    proveedorKey: prov,
    proveedorNombre: nombreProveedor(prov),
    periodoId: String(periodo.id),
    periodoNombre: String(periodo.nombre),
    generadoEn: new Date().toISOString(),
    totales: {
      facturas: {
        count: bloque?.facturas.count ?? lineasFactura.length,
        total: bloque?.facturas.total ?? round2(lineasFactura.reduce((s, l) => s + l.monto, 0)),
      },
      muebles: {
        count: bloque?.muebles.count ?? lineasEntrega.length,
        total: bloque?.muebles.total ?? round2(lineasEntrega.reduce((s, l) => s + l.monto, 0)),
      },
      total:
        bloque?.total ??
        round2(
          [...lineasFactura, ...lineasEntrega].reduce((s, l) => s + l.monto, 0),
        ),
      proyectos: bloque?.proyectos ?? 0,
    },
    facturas: lineasFactura.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    entregas: lineasEntrega.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porCliente: Array.from(clientes.values()).sort((a, b) => b.total - a.total),
    porMarca: Array.from(porMarcaAcc, ([marca, total]) => ({ marca, total })).sort(
      (a, b) => b.total - a.total,
    ),
  };

  return {
    reporte,
    documentos: {
      facturas: Array.from(idsFactura),
      entregas: Array.from(idsEntrega),
    },
  };
}

// ----------------------------------------------------------------------------
// Excel del reporte GUARDADO — nunca recalcula nada
// ----------------------------------------------------------------------------

/** `true` si el jsonb guardado tiene la forma de un reporte. */
export function esReportePeriodo(x: unknown): x is ReportePeriodo {
  return (
    typeof x === "object" &&
    x !== null &&
    "proveedorKey" in x &&
    "totales" in x &&
    Array.isArray((x as ReportePeriodo).facturas)
  );
}

export function excelDeReporte(reporte: ReportePeriodo): Buffer {
  const titulo = `FASHION GROUP — ${reporte.proveedorNombre}`;
  const subtitulo = `${reporte.periodoNombre} · cerrado el ${formatearFecha(
    reporte.generadoEn.slice(0, 10),
  )}`;

  // Hoja 1 — Resumen por cliente.
  const colsResumen: ReportColumn[] = [
    { header: "Cliente", wch: 30 },
    { header: "Código", wch: 10 },
    { header: "Facturas", wch: 14, align: "right", fmt: MONEY_FMT },
    { header: "Muebles", wch: 14, align: "right", fmt: MONEY_FMT },
    { header: "Total", wch: 14, align: "right", fmt: MONEY_FMT },
  ];
  const rowsResumen: ReportCell[][] = reporte.porCliente.map((c) => [
    c.cliente,
    c.clienteCodigo ?? "",
    c.facturas,
    c.muebles,
    c.total,
  ]);
  const totalsResumen: ReportCell[] = [
    "TOTAL",
    "",
    reporte.totales.facturas.total,
    reporte.totales.muebles.total,
    reporte.totales.total,
  ];

  // Hoja 2 — Facturas.
  const colsFacturas: ReportColumn[] = [
    { header: "Fecha", wch: 12 },
    { header: "N° factura", wch: 16 },
    { header: "Proveedor", wch: 24 },
    { header: "Concepto", wch: 40 },
    { header: "Cliente", wch: 24 },
    { header: "Proyecto", wch: 24 },
    { header: "Marca", wch: 18 },
    { header: "Monto", wch: 14, align: "right", fmt: MONEY_FMT },
  ];
  const rowsFacturas: ReportCell[][] = reporte.facturas.map((f) => [
    formatearFecha(f.fecha),
    f.numero,
    f.proveedor,
    f.concepto,
    f.cliente,
    f.proyecto,
    f.marca,
    f.monto,
  ]);

  // Hoja 3 — Muebles entregados.
  const colsEntregas: ReportColumn[] = [
    { header: "Fecha", wch: 12 },
    { header: "Cliente", wch: 24 },
    { header: "Proyecto", wch: 24 },
    { header: "Marca", wch: 18 },
    { header: "Notas", wch: 30 },
    { header: "Monto", wch: 14, align: "right", fmt: MONEY_FMT },
  ];
  const rowsEntregas: ReportCell[][] = reporte.entregas.map((e) => [
    formatearFecha(e.fecha),
    e.cliente,
    e.proyecto,
    e.marca,
    e.notas ?? "",
    e.monto,
  ]);

  const wb = workbookFromSheets([
    {
      name: "Resumen",
      ws: buildReportSheet({
        title: titulo,
        subtitle: subtitulo,
        columns: colsResumen,
        rows: rowsResumen,
        totals: totalsResumen,
      }),
    },
    {
      name: "Facturas",
      ws: buildReportSheet({
        title: titulo,
        subtitle: `${reporte.periodoNombre} · facturas`,
        columns: colsFacturas,
        rows: rowsFacturas,
        totals: [
          "TOTAL",
          "",
          "",
          "",
          "",
          "",
          "",
          reporte.totales.facturas.total,
        ],
      }),
    },
    {
      name: "Muebles",
      ws: buildReportSheet({
        title: titulo,
        subtitle: `${reporte.periodoNombre} · muebles entregados`,
        columns: colsEntregas,
        rows: rowsEntregas,
        totals: ["TOTAL", "", "", "", "", reporte.totales.muebles.total],
      }),
    },
  ]);

  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export { XLSX_MIME };
