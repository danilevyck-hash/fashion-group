// ============================================================================
// Marketing — el REPORTE de un período, tal como se le manda a la MARCA.
//
// 🔑 SE GUARDA UNA VEZ Y NO SE RECALCULA NUNCA. Al cerrar un período, el
// reporte se congela en `mk_periodos.reporte` (jsonb) y de ahí sale el Excel
// para siempre. Si mañana cambia una regla de reparto, el papel que el
// encargado de la marca ya tiene en la mano NO puede cambiar solo.
//
// 🩸 LOS TOTALES NO SE VUELVEN A CALCULAR ACÁ. Salen de `agregarPorBloques`,
// el mismo módulo puro que dibuja el inicio. Escribir una segunda cuenta es la
// forma exacta en que este repo ya se quemó con los signos de las notas de
// crédito: dos archivos diciendo cosas distintas sobre la misma plata, y nadie
// se entera hasta que una marca reclama. Lo único que se arma acá es el
// DETALLE (qué documentos entran), con el mismo reparto por porción.
//
// 🔴 `proveedorKey` / `proveedorNombre` CONSERVAN EL NOMBRE dentro del jsonb y
// ahora guardan el CÓDIGO Y EL NOMBRE DE LA MARCA. Renombrarlos rompería la
// lectura del reporte de "mid 2026" que ya está guardado —y que dice 'pvh'
// porque ese cierre fue conjunto de verdad—, o sea que el Excel congelado
// dejaría de salir. Es la misma decisión que la columna `proveedor_key`.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import { marcasDeEntrega, porcionEntregaParaMarca } from "./resumen-inicio";
import {
  agregarPorBloques,
  crearClasificadorPeriodos,
  type PeriodoRow,
  type SelloRow,
} from "./resumen-bloques";
import {
  MARCAS_BLOQUE,
  SIN_BLOQUE,
  clavesDeSello,
  indiceBloquePorMarcaId,
  nombreDeBloque,
} from "./bloques";

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
  /**
   * true = este Excel NO salió de un reporte congelado: se calculó HOY sobre
   * los documentos sellados a un período cerrado cuyo `reporte` quedó NULL
   * (el caso real: "mid 2026", que la migración #475 insertó cerrado sin
   * pasar por el cierre). El Excel lo declara en su subtítulo.
   */
  calculadoEnVivo?: boolean;
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

export interface AdjuntoFila {
  tipo: string;
  factura_id: string | null;
  proyecto_id: string | null;
}

export interface DatosPeriodos {
  facturas: FacturaFila[];
  facturaMarcas: Array<{ factura_id: string; marca_id: string; porcentaje: number | null }>;
  proyectos: ProyectoFila[];
  marcas: MarcaFila[];
  entregas: EntregaFila[];
  /** Comprobantes y fotos. Vacío = los dos avisos del bloque salen en cero. */
  adjuntos: AdjuntoFila[];
  periodos: PeriodoRow[];
  sellos: SelloRow[];
  /**
   * Siempre `true` desde el 3-sep-2026. Decía `false` cuando la migración de
   * períodos no había corrido; hoy, si las tablas no contestan, esta función
   * LANZA y nunca llega a armar el objeto. Se conserva porque `cerrar.ts` lo
   * lee (`if (!datos.hayTablas) → 409`).
   */
  hayTablas: boolean;
}

/**
 * Todo lo que hace falta para agregar por proveedor y por período.
 *
 * Historia: degradaba igual que `/api/marketing/inicio` — sin las tablas de
 * período, `periodos` y `sellos` llegaban vacíos y `hayTablas` iba en false.
 * Tolerancia retirada el 3-sep-2026: las tablas existen desde
 * 20260811160000_marketing_periodos_por_proveedor.sql. Un error en esas dos
 * lecturas se propaga como cualquier otro.
 */
export async function cargarDatosPeriodos(): Promise<DatosPeriodos> {
  const [factRes, fmRes, proyRes, marcasRes, entRes, adjRes, perRes, selloRes] =
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
      supabaseServer.from("mk_adjuntos").select("tipo, factura_id, proyecto_id"),
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
  // Los adjuntos solo alimentan los dos AVISOS (sin comprobante / sin foto). Si
  // fallan, el módulo tiene que seguir diciendo la plata: un aviso ausente es
  // molesto, una pantalla en blanco es peor.
  if (perRes.error) throw new Error(`periodos: ${perRes.error.message}`);
  if (selloRes.error) {
    throw new Error(`periodo_documentos: ${selloRes.error.message}`);
  }

  return {
    facturas: (factRes.data ?? []) as FacturaFila[],
    facturaMarcas: (fmRes.data ?? []) as DatosPeriodos["facturaMarcas"],
    proyectos: (proyRes.data ?? []) as ProyectoFila[],
    marcas: (marcasRes.data ?? []) as MarcaFila[],
    entregas: (entRes.data ?? []) as EntregaFila[],
    adjuntos: (adjRes.error ? [] : (adjRes.data ?? [])) as AdjuntoFila[],
    periodos: (perRes.data ?? []) as PeriodoRow[],
    sellos: (selloRes.data ?? []) as SelloRow[],
    hayTablas: true,
  };
}

/** Corre el agregador puro sobre los datos leídos. Una sola cuenta. */
export function agregar(datos: DatosPeriodos) {
  const proyectosMultifashion = new Set(
    datos.proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );
  return agregarPorBloques({
    facturas: datos.facturas as never,
    facturaMarcas: datos.facturaMarcas as never,
    entregas: datos.entregas as never,
    marcas: datos.marcas as never,
    proyectos: datos.proyectos as never,
    proyectosMultifashion,
    periodos: datos.periodos,
    sellos: datos.sellos,
    adjuntos: datos.adjuntos,
  });
}

/**
 * Qué MARCAS entran en el reporte de un período, por su clave.
 *
 * Normalmente una: la clave ES el código de marca. La excepción es un período
 * VIEJO por proveedor —los que existen hasta que Daniel corra la migración—,
 * donde 'pvh' junta Tommy, Calvin y Karl. Sin esto, cerrar un período heredado
 * generaría un reporte VACÍO: ninguna marca coincidiría con la clave 'pvh' y
 * el papel saldría en cero.
 */
export function marcasDelPeriodo(key: string): string[] {
  const k = String(key ?? "").trim();
  if (!k) return [];
  return MARCAS_BLOQUE.filter((m) => clavesDeSello(m.key).includes(k)).map(
    (m) => m.key as string,
  );
}

// ----------------------------------------------------------------------------
// Armado del reporte
// ----------------------------------------------------------------------------



/**
 * Arma el reporte del período ABIERTO de una MARCA: SOLO su parte.
 *
 * 🔑 Qué entra: los documentos cuyo sello apunta a este período, más los que
 * todavía no tienen sello — porque "sin sello" significa "del período actual",
 * que es el default correcto y el mismo que usa la pantalla.
 *
 * 🔴 Los totales de cabecera salen de `agregarPorBloques`, no de sumar las
 * líneas. Las líneas son el detalle; el número que se le reporta a la marca es
 * el mismo que el dueño vio en pantalla antes de apretar "cerrar".
 */
export function armarReportePeriodo(
  datos: DatosPeriodos,
  periodo: { id: string; proveedor_key: string; nombre: string },
  /**
   * Modo "cerrado en vivo" (12-ago-2026): para un período YA CERRADO cuyo
   * `reporte` quedó NULL (el caso real: "mid 2026", insertado cerrado por la
   * migración #475 sin pasar por el cierre). Cambian TRES cosas y nada más:
   *  - `soloSelladosAEste`: entran ÚNICAMENTE los documentos cuyo sello apunta
   *    a ESTE período (el clasificador único decide). "Sin sello" acá NO entra:
   *    eso es el período abierto de hoy, no el archivo.
   *  - `marca`: acota el reporte a UNA marca del período conjunto legacy
   *    ('pvh' junta TH+CK+KL) — el chip de Calvin baja SOLO lo de Calvin.
   *  - Los totales salen de `agregarPorBloques().cerrados` (la MISMA cifra que
   *    el chip muestra), no del bloque abierto.
   */
  opciones?: { soloSelladosAEste?: boolean; marca?: string },
): { reporte: ReportePeriodo; documentos: DocumentosDelReporte } {
  const prov = String(periodo.proveedor_key);
  const soloSellados = opciones?.soloSelladosAEste === true;
  const marcaPedida = opciones?.marca;
  // Normalmente UNA marca. Un período viejo por proveedor ('pvh') junta tres:
  // sin esto, cerrar un período heredado generaría un reporte VACÍO.
  const marcasDelReporte = new Set(
    marcaPedida ? [marcaPedida] : marcasDelPeriodo(prov),
  );
  const resumen = agregar(datos);
  // Totales de cabecera — SIEMPRE de `agregarPorBloques`, nunca sumando acá.
  // En modo cerrado-en-vivo salen de `cerrados` (la cifra del chip); en el
  // cierre normal, del bloque abierto de la(s) marca(s).
  const cerradosDelPeriodo = soloSellados
    ? resumen.cerrados.filter(
        (c) =>
          String(c.id ?? "") === String(periodo.id) &&
          marcasDelReporte.has(c.bloqueKey),
      )
    : [];
  const bloquesDelReporte = soloSellados
    ? []
    : resumen.bloques.filter((b) => marcasDelReporte.has(b.key));
  const bloque = soloSellados
    ? cerradosDelPeriodo.length > 0
      ? {
          facturas: {
            count: cerradosDelPeriodo.reduce((s, c) => s + c.facturas.count, 0),
            total: round2(
              cerradosDelPeriodo.reduce((s, c) => s + c.facturas.total, 0),
            ),
          },
          muebles: {
            count: cerradosDelPeriodo.reduce((s, c) => s + c.muebles.count, 0),
            total: round2(
              cerradosDelPeriodo.reduce((s, c) => s + c.muebles.total, 0),
            ),
          },
          total: round2(cerradosDelPeriodo.reduce((s, c) => s + c.total, 0)),
          proyectos: 0, // se completa abajo con los proyectos de las líneas
        }
      : undefined
    : bloquesDelReporte.length === 1
      ? bloquesDelReporte[0]
      : bloquesDelReporte.length > 1
        ? {
            facturas: {
              count: bloquesDelReporte.reduce((s, b) => s + b.facturas.count, 0),
              total: round2(bloquesDelReporte.reduce((s, b) => s + b.facturas.total, 0)),
            },
            muebles: {
              count: bloquesDelReporte.reduce((s, b) => s + b.muebles.count, 0),
              total: round2(bloquesDelReporte.reduce((s, b) => s + b.muebles.total, 0)),
            },
            total: round2(bloquesDelReporte.reduce((s, b) => s + b.total, 0)),
            proyectos: 0, // se completa abajo con los proyectos de las líneas
          }
        : undefined;

  const bloquePorMarca = indiceBloquePorMarcaId(datos.marcas);
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
  /**
   * ¿Este documento entra en el período que se está cerrando, para esta marca?
   *
   * 🔴 Pregunta por las DOS claves (código de marca y clave vieja), igual que
   * el inicio: sin la migración corrida, los sellos del archivo dicen 'pvh' y
   * preguntar solo por 'TH' metería las 59 facturas ya reportadas en el
   * reporte nuevo — o sea, se le volvería a cobrar a la marca lo mismo.
   */
  // El clasificador ÚNICO — el mismo de las tarjetas del inicio y de la
  // lista de proyectos. En modo cerrado-en-vivo ÉL decide la membresía.
  const clasificador = crearClasificadorPeriodos(datos.periodos, datos.sellos);

  const entraEnEstePeriodo = (
    tipo: "factura" | "entrega",
    docId: string,
    marcaKey: string,
  ): boolean => {
    if (soloSellados) {
      // Período CERRADO: entra solo lo que el clasificador atribuye a ESTE
      // período. Un sello a un período ABIERTO (incluido el fantasma
      // `pvh · abierto`) y un documento sin sello son "gasto de ahora" — NO
      // entran en el archivo. Un documento con sello duplicado se clasifica
      // UNA vez (la primera clave manda), así que no se duplica el monto.
      const cer = clasificador.cerradoPara(tipo, docId, marcaKey, false);
      return !!cer && cer.id !== null && String(cer.id) === String(periodo.id);
    }
    for (const clave of clavesDeSello(marcaKey).length > 0
      ? clavesDeSello(marcaKey)
      : [prov]) {
      const pid = selloDe.get(`${tipo}::${docId}::${clave}`);
      if (!pid) continue;
      if (pid === periodo.id) return true;
      return estadoPeriodo.get(pid) !== "cerrado";
    }
    return true; // sin sello = período actual
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
  const proyectosDelReporte = new Set<string>();
  for (const f of datos.facturas) {
    const fid = String(f.id);
    const pid = f.proyecto_id ? String(f.proyecto_id) : null;
    if (pid && esMf.has(pid)) continue; // Multifashion no se le reporta a nadie
    const rows = rowsByFactura.get(fid) ?? [];
    if (rows.length === 0) continue;
    const sumPct = rows.reduce((s, r) => s + r.porcentaje, 0) || 1;
    for (const r of rows) {
      const k = bloquePorMarca.get(r.marca_id) ?? SIN_BLOQUE;
      if (!marcasDelReporte.has(k)) continue;
      if (!entraEnEstePeriodo("factura", fid, k)) continue;
      if (pid) proyectosDelReporte.add(pid);
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
    for (const mid of marcasDeEntrega(e as never)) {
      const k = bloquePorMarca.get(mid) ?? SIN_BLOQUE;
      if (!marcasDelReporte.has(k)) continue;
      if (!entraEnEstePeriodo("entrega", eid, k)) continue;
      const monto = porcionEntregaParaMarca(e as never, mid, empresaPorMarca.get(mid));
      if (monto <= 0) continue;
      proyectosDelReporte.add(pid);
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
    // Con `marca` el papel es de ESA marca (el chip de Calvin dice Calvin,
    // aunque el período conjunto legacy se llame 'pvh' por dentro).
    proveedorNombre: nombreDeBloque(marcaPedida ?? prov, datos.marcas),
    periodoId: String(periodo.id),
    periodoNombre: String(periodo.nombre),
    generadoEn: new Date().toISOString(),
    ...(soloSellados ? { calculadoEnVivo: true } : {}),
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
      // Con UNA marca es el número del bloque (incluye los proyectos cuyo
      // gasto ya se reportó). Con un período viejo de tres marcas, sumar los
      // tres bloques contaría dos veces un proyecto compartido: ahí se cuentan
      // los proyectos que de verdad entraron en el reporte.
      proyectos:
        bloquesDelReporte.length === 1
          ? (bloque?.proyectos ?? 0)
          : proyectosDelReporte.size,
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
// La forma del reporte guardado
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

// ⛔ ACÁ NO HAY EXCEL. El generador de 3 hojas genéricas (Resumen / Facturas /
// Muebles, sin hojas por cliente y sin links) se retiró el 12-ago-2026 —
// Daniel, textual: *"MIRA CÓMO se descarga el excel, antes no era así"* y
// *"quiero el modo anterior, solo quitando las columnas de las marcas"*. El
// Excel de un período sale de `zip-marca.ts` → `buildExcelDeMarca`: el MISMO
// `resumen_gastos.xlsx` que va dentro del ZIP (hoja Resumen + una hoja por
// cliente con hyperlinks + hoja General para los gastos sin cliente). No
// escribir acá un segundo generador.
