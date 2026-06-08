// ============================================================================
// Marketing — reportes agregados
// Lee desde Supabase y agrega por marca / tienda / proyecto.
// Todos los totales excluyen registros con anulado_en != null.
// ============================================================================
import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import {
  formatearFecha,
  normalizarEstadoProyecto,
  etiquetaEstadoProyecto,
} from "./normalizar";
import { getMarcas } from "./queries";
import { getEntregaTotalByProyectoBatch } from "./inventario";
import type { MkMarca, EstadoProyecto } from "./types";

// ----------------------------------------------------------------------------
// Tipos de output
// ----------------------------------------------------------------------------
export interface ReporteMarcaItem {
  marca: MkMarca;
  // Gasto COMPLETO atribuido a la marca (sin co-op). Ya no se calcula
  // cuánto reembolsa la marca; se muestra el monto total del gasto.
  gasto: number;
}

export interface ReporteTiendaItem {
  tienda: string;
  porMarca: Record<string, number>;
  total: number;
}

export interface ReporteProyectoItem {
  proyecto: {
    id: string;
    nombre: string | null;
    tienda: string;
    fecha_inicio: string;
    estado: EstadoProyecto;
  };
  marcas: Array<{ nombre: string }>;
  gastoTotal: number;
}

export interface FiltrosReporteProyecto {
  anio?: number;
  marcaId?: string;
  tienda?: string;
  estado?: EstadoProyecto;
}

// ----------------------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------------------
function anioRange(anio?: number): { ini: string; fin: string } | null {
  if (!anio) return null;
  return { ini: `${anio}-01-01`, fin: `${anio}-12-31` };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface ProyectoMin {
  id: string;
  nombre: string | null;
  tienda: string;
  fecha_inicio: string;
  estado: EstadoProyecto;
}

interface ProyMarcaMin {
  proyecto_id: string;
  marca_id: string;
  porcentaje: number;
}

interface FacturaMin {
  proyecto_id: string;
  total: number;
}


async function cargarProyectosVigentes(
  anio?: number
): Promise<ProyectoMin[]> {
  let q = supabaseServer
    .from("mk_proyectos")
    .select("id, nombre, tienda, fecha_inicio, estado")
    .is("anulado_en", null);
  const rango = anioRange(anio);
  if (rango) q = q.gte("fecha_inicio", rango.ini).lte("fecha_inicio", rango.fin);
  const { data, error } = await q;
  if (error) throw new Error(`cargarProyectosVigentes: ${error.message}`);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      nombre: (x.nombre as string | null) ?? null,
      tienda: String(x.tienda ?? ""),
      fecha_inicio: String(x.fecha_inicio ?? ""),
      estado: normalizarEstadoProyecto(x.estado),
    };
  });
}

async function cargarProyMarcas(
  proyectoIds: ReadonlyArray<string>
): Promise<ProyMarcaMin[]> {
  if (proyectoIds.length === 0) return [];
  const { data, error } = await supabaseServer
    .from("mk_proyecto_marcas")
    .select("proyecto_id, marca_id, porcentaje")
    .in("proyecto_id", proyectoIds);
  if (error) throw new Error(`cargarProyMarcas: ${error.message}`);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      proyecto_id: String(x.proyecto_id),
      marca_id: String(x.marca_id),
      porcentaje: Number(x.porcentaje ?? 0),
    };
  });
}

async function cargarFacturas(
  proyectoIds: ReadonlyArray<string>
): Promise<FacturaMin[]> {
  if (proyectoIds.length === 0) return [];
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("proyecto_id, total")
    .in("proyecto_id", proyectoIds)
    .is("anulado_en", null);
  if (error) throw new Error(`cargarFacturas: ${error.message}`);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      proyecto_id: String(x.proyecto_id),
      total: Number(x.total ?? 0),
    };
  });
}

// ----------------------------------------------------------------------------
// Reporte por marca
// ----------------------------------------------------------------------------
// Gasto COMPLETO por (proyecto → marca), SIN co-op. Fuente de verdad:
//   - Facturas: factura.total distribuido por PORCIÓN real de cada marca
//     (porcentaje normalizado entre las marcas de esa factura). 1 marca = total
//     completo; 2 marcas 50/50 = mitad real a cada una. Σ por marca = total.
//   - Entregas de muebles: porción real de cada marca = total_por_marca +
//     total_por_empresa_interna[empresa_codigo de la marca] (el "otro 50%" que
//     antes absorbía FG ahora se atribuye al gasto de esa marca).
// Garantiza la DoD: Σ gasto por marca == Σ facturas.total + Σ entregas.total.
async function cargarGastoCompletoPorMarca(
  proyectoIds: ReadonlyArray<string>,
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (proyectoIds.length === 0) return out;

  const addParte = (pid: string, marcaId: string, monto: number) => {
    const inner = out.get(pid) ?? new Map<string, number>();
    inner.set(marcaId, round2((inner.get(marcaId) ?? 0) + monto));
    out.set(pid, inner);
  };

  const [factRes, fmRes, entRes, marcas] = await Promise.all([
    supabaseServer
      .from("mk_facturas")
      .select("id, proyecto_id, total")
      .in("proyecto_id", proyectoIds)
      .is("anulado_en", null),
    supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id, porcentaje"),
    supabaseServer
      .from("mk_entregas_muebles")
      .select("proyecto_id, total_por_marca, total_por_empresa_interna")
      .in("proyecto_id", proyectoIds)
      .not("proyecto_id", "is", null),
    getMarcas(),
  ]);
  if (factRes.error) throw new Error(`cargarGastoCompletoPorMarca[fact]: ${factRes.error.message}`);
  if (fmRes.error) throw new Error(`cargarGastoCompletoPorMarca[fm]: ${fmRes.error.message}`);
  if (entRes.error) throw new Error(`cargarGastoCompletoPorMarca[ent]: ${entRes.error.message}`);

  const factById = new Map<string, { proyectoId: string; total: number }>();
  for (const f of (factRes.data ?? []) as Array<{ id: string; proyecto_id: string; total: number }>) {
    factById.set(String(f.id), { proyectoId: String(f.proyecto_id), total: Number(f.total ?? 0) });
  }
  const empresaByMarca = new Map(marcas.map((m) => [m.id, m.empresa_codigo]));

  // Facturas: distribuir el total por porción (porcentaje normalizado).
  const rowsByFactura = new Map<string, Array<{ marcaId: string; pct: number }>>();
  for (const r of (fmRes.data ?? []) as Array<{ factura_id: string; marca_id: string; porcentaje: number }>) {
    const fid = String(r.factura_id);
    if (!factById.has(fid)) continue;
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push({ marcaId: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
    rowsByFactura.set(fid, arr);
  }
  for (const [fid, rows] of rowsByFactura) {
    const info = factById.get(fid)!;
    const sumPct = rows.reduce((s, r) => s + r.pct, 0) || 1;
    for (const r of rows) addParte(info.proyectoId, r.marcaId, info.total * (r.pct / sumPct));
  }

  // Entregas: porción real = total_por_marca + el interno pareja de esa marca.
  for (const e of (entRes.data ?? []) as Array<{
    proyecto_id: string;
    total_por_marca: Record<string, number> | null;
    total_por_empresa_interna: Record<string, number> | null;
  }>) {
    const pid = String(e.proyecto_id);
    const tpm = e.total_por_marca ?? {};
    const tpe = e.total_por_empresa_interna ?? {};
    for (const [mid, v] of Object.entries(tpm)) {
      const emp = empresaByMarca.get(mid);
      const interna = emp && tpe[emp] ? Number(tpe[emp]) : 0;
      addParte(pid, mid, Number(v) + interna);
    }
  }

  return out;
}

export async function reportePorMarca(
  anio?: number
): Promise<ReporteMarcaItem[]> {
  const [marcas, proyectos] = await Promise.all([
    getMarcas(),
    cargarProyectosVigentes(anio),
  ]);
  if (marcas.length === 0) return [];

  const proyectoIds = proyectos.map((p) => p.id);
  const gastoPorProyMarca = await cargarGastoCompletoPorMarca(proyectoIds);

  // Gasto completo por marca = suma sobre todos los proyectos.
  const gastoByMarca = new Map<string, number>();
  for (const [, inner] of gastoPorProyMarca) {
    for (const [marcaId, monto] of inner) {
      gastoByMarca.set(marcaId, (gastoByMarca.get(marcaId) ?? 0) + monto);
    }
  }

  return marcas.map((m) => ({
    marca: m,
    gasto: Number((gastoByMarca.get(m.id) ?? 0).toFixed(2)),
  }));
}

// ----------------------------------------------------------------------------
// Reporte por tienda
// ----------------------------------------------------------------------------
export async function reportePorTienda(
  anio?: number
): Promise<ReporteTiendaItem[]> {
  const [marcas, proyectos] = await Promise.all([
    getMarcas(),
    cargarProyectosVigentes(anio),
  ]);
  if (proyectos.length === 0) return [];

  const proyectoIds = proyectos.map((p) => p.id);
  const gastoPorProyMarca = await cargarGastoCompletoPorMarca(proyectoIds);

  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const marcaById = new Map(marcas.map((m) => [m.id, m]));

  // tienda → { marcaNombre → gasto completo, total }
  const bucket = new Map<string, { porMarca: Record<string, number>; total: number }>();
  for (const [proyectoId, inner] of gastoPorProyMarca) {
    const proyecto = proyectoById.get(proyectoId);
    if (!proyecto) continue;
    const tienda = proyecto.tienda;
    const entry = bucket.get(tienda) ?? { porMarca: {}, total: 0 };
    for (const [marcaId, monto] of inner) {
      const marca = marcaById.get(marcaId);
      if (!marca) continue;
      entry.porMarca[marca.nombre] = Number(
        ((entry.porMarca[marca.nombre] ?? 0) + monto).toFixed(2)
      );
      entry.total = Number((entry.total + monto).toFixed(2));
    }
    bucket.set(tienda, entry);
  }

  return Array.from(bucket.entries())
    .map(([tienda, v]) => ({ tienda, porMarca: v.porMarca, total: v.total }))
    .sort((a, b) => a.tienda.localeCompare(b.tienda, "es"));
}

// ----------------------------------------------------------------------------
// Reporte por proyecto
// ----------------------------------------------------------------------------
export async function reportePorProyecto(
  filtros: FiltrosReporteProyecto = {}
): Promise<ReporteProyectoItem[]> {
  const [marcas, proyectosRaw] = await Promise.all([
    getMarcas(),
    cargarProyectosVigentes(filtros.anio),
  ]);

  let proyectos = proyectosRaw;
  if (filtros.estado) {
    proyectos = proyectos.filter((p) => p.estado === filtros.estado);
  }
  if (filtros.tienda) {
    const t = filtros.tienda.toLocaleLowerCase("es");
    proyectos = proyectos.filter((p) => p.tienda.toLocaleLowerCase("es") === t);
  }
  if (proyectos.length === 0) return [];

  const proyectoIds = proyectos.map((p) => p.id);
  const [proyMarcas, facturas, entregaTotalByProy] = await Promise.all([
    cargarProyMarcas(proyectoIds),
    cargarFacturas(proyectoIds),
    getEntregaTotalByProyectoBatch(proyectoIds),
  ]);

  // Si se filtra por marcaId, solo incluir proyectos que tengan esa marca
  let proyectosFiltrados = proyectos;
  if (filtros.marcaId) {
    const idsConMarca = new Set(
      proyMarcas.filter((pm) => pm.marca_id === filtros.marcaId).map((pm) => pm.proyecto_id)
    );
    proyectosFiltrados = proyectos.filter((p) => idsConMarca.has(p.id));
  }

  const marcaById = new Map(marcas.map((m) => [m.id, m]));

  const totalByProy = new Map<string, number>();
  for (const f of facturas) {
    totalByProy.set(f.proyecto_id, (totalByProy.get(f.proyecto_id) ?? 0) + f.total);
  }

  const marcasByProy = new Map<string, Array<{ nombre: string }>>();
  for (const pm of proyMarcas) {
    const marca = marcaById.get(pm.marca_id);
    if (!marca) continue;
    const arr = marcasByProy.get(pm.proyecto_id) ?? [];
    arr.push({ nombre: marca.nombre });
    marcasByProy.set(pm.proyecto_id, arr);
  }

  return proyectosFiltrados
    .map((p) => {
      const gastoFact = totalByProy.get(p.id) ?? 0;
      const gastoEntregas = entregaTotalByProy.get(p.id) ?? 0;
      const gasto = Number((gastoFact + gastoEntregas).toFixed(2));
      return {
        proyecto: p,
        marcas: marcasByProy.get(p.id) ?? [],
        gastoTotal: gasto,
      };
    })
    .sort((a, b) => b.proyecto.fecha_inicio.localeCompare(a.proyecto.fecha_inicio));
}

// ----------------------------------------------------------------------------
// Exportar reporte a Excel
// ----------------------------------------------------------------------------
type TipoReporte = "marca" | "tienda" | "proyecto";

function esArrayDe<T>(v: unknown, guard: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(guard);
}

function esReporteMarcaItem(x: unknown): x is ReporteMarcaItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "marca" in x &&
    "gasto" in x
  );
}

function esReporteTiendaItem(x: unknown): x is ReporteTiendaItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "tienda" in x &&
    "porMarca" in x
  );
}

function esReporteProyectoItem(x: unknown): x is ReporteProyectoItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "proyecto" in x &&
    "gastoTotal" in x
  );
}

export function exportarExcelReporte(tipo: TipoReporte, data: unknown): Blob {
  const wb = XLSX.utils.book_new();
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    fill: { fgColor: { rgb: "111827" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const moneyFmt = '"$"#,##0.00';

  let ws: XLSX.WorkSheet;
  let hoja: string;

  if (tipo === "marca") {
    if (!esArrayDe(data, esReporteMarcaItem)) {
      throw new Error("data inválida para reporte por marca");
    }
    hoja = "Por marca";
    const aoa: unknown[][] = [["Marca", "Código", "Gasto"]];
    for (const item of data) {
      aoa.push([item.marca.nombre, item.marca.codigo, item.gasto]);
    }
    ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }];
    for (let c = 0; c < 3; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= data.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 2 });
      if (ws[addr]) {
        ws[addr].t = "n";
        ws[addr].z = moneyFmt;
      }
    }
  } else if (tipo === "tienda") {
    if (!esArrayDe(data, esReporteTiendaItem)) {
      throw new Error("data inválida para reporte por tienda");
    }
    hoja = "Por tienda";
    const marcasUnicas = Array.from(
      new Set(data.flatMap((d) => Object.keys(d.porMarca)))
    ).sort((a, b) => a.localeCompare(b, "es"));
    const aoa: unknown[][] = [["Tienda", ...marcasUnicas, "Gasto"]];
    for (const item of data) {
      aoa.push([
        item.tienda,
        ...marcasUnicas.map((m) => item.porMarca[m] ?? 0),
        item.total,
      ]);
    }
    ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 24 }, ...marcasUnicas.map(() => ({ wch: 14 })), { wch: 14 }];
    for (let c = 0; c < aoa[0].length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= data.length; r++) {
      for (let c = 1; c < aoa[0].length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) {
          ws[addr].t = "n";
          ws[addr].z = moneyFmt;
        }
      }
    }
  } else {
    if (!esArrayDe(data, esReporteProyectoItem)) {
      throw new Error("data inválida para reporte por proyecto");
    }
    hoja = "Por proyecto";
    const aoa: unknown[][] = [
      [
        "Proyecto",
        "Tienda",
        "Fecha inicio",
        "Estado",
        "Marcas",
        "Gasto real",
      ],
    ];
    for (const item of data) {
      const marcasTxt = item.marcas.map((m) => m.nombre).join(", ");
      aoa.push([
        item.proyecto.nombre ?? item.proyecto.tienda,
        item.proyecto.tienda,
        formatearFecha(item.proyecto.fecha_inicio),
        etiquetaEstadoProyecto(item.proyecto.estado),
        marcasTxt,
        item.gastoTotal,
      ]);
    }
    ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 30 },
      { wch: 14 },
    ];
    for (let c = 0; c < 6; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= data.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 5 });
      if (ws[addr]) {
        ws[addr].t = "n";
        ws[addr].z = moneyFmt;
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, hoja);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
