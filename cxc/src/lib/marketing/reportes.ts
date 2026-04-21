// ============================================================================
// Marketing — reportes agregados
// Lee desde Supabase y agrega por marca / tienda / proyecto.
// Todos los totales excluyen registros con anulado_en != null.
// ============================================================================
import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import { formatearFecha } from "./normalizar";
import { getMarcas } from "./queries";
import type { MkMarca, EstadoProyecto } from "./types";

// ----------------------------------------------------------------------------
// Tipos de output
// ----------------------------------------------------------------------------
export interface ReporteMarcaItem {
  marca: MkMarca;
  gastadoYtd: number;
  cobradoYtd: number;
  pendiente: number;
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
  marcas: Array<{ nombre: string; porcentaje: number }>;
  gastoTotal: number;
  cobrado: number;
  pendiente: number;
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

interface CobranzaMin {
  id: string;
  proyecto_id: string;
  marca_id: string;
  monto: number;
  estado: string;
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
      estado: String(x.estado ?? "abierto") as EstadoProyecto,
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

async function cargarCobranzas(
  proyectoIds: ReadonlyArray<string>
): Promise<CobranzaMin[]> {
  if (proyectoIds.length === 0) return [];
  const { data, error } = await supabaseServer
    .from("mk_cobranzas")
    .select("id, proyecto_id, marca_id, monto, estado")
    .in("proyecto_id", proyectoIds)
    .is("anulado_en", null);
  if (error) throw new Error(`cargarCobranzas: ${error.message}`);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      proyecto_id: String(x.proyecto_id),
      marca_id: String(x.marca_id),
      monto: Number(x.monto ?? 0),
      estado: String(x.estado ?? ""),
    };
  });
}

// ----------------------------------------------------------------------------
// Reporte por marca
// ----------------------------------------------------------------------------
export async function reportePorMarca(
  anio?: number
): Promise<ReporteMarcaItem[]> {
  const [marcas, proyectos] = await Promise.all([
    getMarcas(),
    cargarProyectosVigentes(anio),
  ]);
  if (marcas.length === 0) return [];

  const proyectoIds = proyectos.map((p) => p.id);
  const [proyMarcas, facturas, cobranzas] = await Promise.all([
    cargarProyMarcas(proyectoIds),
    cargarFacturas(proyectoIds),
    cargarCobranzas(proyectoIds),
  ]);

  // Total facturado por proyecto
  const totalByProy = new Map<string, number>();
  for (const f of facturas) {
    totalByProy.set(f.proyecto_id, (totalByProy.get(f.proyecto_id) ?? 0) + f.total);
  }

  // Gastado por marca = suma por proyecto de (total * porcentaje / 100)
  const gastadoByMarca = new Map<string, number>();
  for (const pm of proyMarcas) {
    const proyTotal = totalByProy.get(pm.proyecto_id) ?? 0;
    const parte = (proyTotal * pm.porcentaje) / 100;
    gastadoByMarca.set(pm.marca_id, (gastadoByMarca.get(pm.marca_id) ?? 0) + parte);
  }

  // Cobrado por marca = suma de montos de cobranzas en estado 'cobrada'
  const cobradoByMarca = new Map<string, number>();
  for (const cb of cobranzas) {
    if (cb.estado !== "cobrada") continue;
    cobradoByMarca.set(cb.marca_id, (cobradoByMarca.get(cb.marca_id) ?? 0) + cb.monto);
  }

  return marcas.map((m) => {
    const gast = Number((gastadoByMarca.get(m.id) ?? 0).toFixed(2));
    const cob = Number((cobradoByMarca.get(m.id) ?? 0).toFixed(2));
    return {
      marca: m,
      gastadoYtd: gast,
      cobradoYtd: cob,
      pendiente: Number((gast - cob).toFixed(2)),
    };
  });
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
  const [proyMarcas, facturas] = await Promise.all([
    cargarProyMarcas(proyectoIds),
    cargarFacturas(proyectoIds),
  ]);

  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const marcaById = new Map(marcas.map((m) => [m.id, m]));

  const totalByProy = new Map<string, number>();
  for (const f of facturas) {
    totalByProy.set(f.proyecto_id, (totalByProy.get(f.proyecto_id) ?? 0) + f.total);
  }

  // tienda → { marcaNombre → monto, total }
  const bucket = new Map<string, { porMarca: Record<string, number>; total: number }>();
  for (const pm of proyMarcas) {
    const proyecto = proyectoById.get(pm.proyecto_id);
    const marca = marcaById.get(pm.marca_id);
    if (!proyecto || !marca) continue;
    const tienda = proyecto.tienda;
    const proyTotal = totalByProy.get(pm.proyecto_id) ?? 0;
    const parte = (proyTotal * pm.porcentaje) / 100;

    const entry = bucket.get(tienda) ?? { porMarca: {}, total: 0 };
    entry.porMarca[marca.nombre] = Number(
      ((entry.porMarca[marca.nombre] ?? 0) + parte).toFixed(2)
    );
    entry.total = Number((entry.total + parte).toFixed(2));
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
  const [proyMarcas, facturas, cobranzas] = await Promise.all([
    cargarProyMarcas(proyectoIds),
    cargarFacturas(proyectoIds),
    cargarCobranzas(proyectoIds),
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

  const marcasByProy = new Map<string, Array<{ nombre: string; porcentaje: number }>>();
  for (const pm of proyMarcas) {
    const marca = marcaById.get(pm.marca_id);
    if (!marca) continue;
    const arr = marcasByProy.get(pm.proyecto_id) ?? [];
    arr.push({ nombre: marca.nombre, porcentaje: pm.porcentaje });
    marcasByProy.set(pm.proyecto_id, arr);
  }

  // Cobrado = suma de montos de cobranzas en estado 'cobrada' de este proyecto
  const cobradoByProy = new Map<string, number>();
  for (const cb of cobranzas) {
    if (cb.estado !== "cobrada") continue;
    cobradoByProy.set(
      cb.proyecto_id,
      (cobradoByProy.get(cb.proyecto_id) ?? 0) + cb.monto,
    );
  }

  return proyectosFiltrados
    .map((p) => {
      const gasto = Number((totalByProy.get(p.id) ?? 0).toFixed(2));
      const cobrado = Number((cobradoByProy.get(p.id) ?? 0).toFixed(2));
      return {
        proyecto: p,
        marcas: marcasByProy.get(p.id) ?? [],
        gastoTotal: gasto,
        cobrado,
        pendiente: Number((gasto - cobrado).toFixed(2)),
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
    "gastadoYtd" in x
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
    const aoa: unknown[][] = [
      ["Marca", "Código", "Gastado YTD", "Cobrado YTD", "Pendiente"],
    ];
    for (const item of data) {
      aoa.push([
        item.marca.nombre,
        item.marca.codigo,
        item.gastadoYtd,
        item.cobradoYtd,
        item.pendiente,
      ]);
    }
    ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    for (let c = 0; c < 5; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= data.length; r++) {
      for (const c of [2, 3, 4]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) {
          ws[addr].t = "n";
          ws[addr].z = moneyFmt;
        }
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
    const aoa: unknown[][] = [["Tienda", ...marcasUnicas, "Total"]];
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
        "Gasto total",
        "Cobrado",
        "Pendiente",
      ],
    ];
    for (const item of data) {
      const marcasTxt = item.marcas
        .map((m) => `${m.nombre} (${m.porcentaje.toFixed(2)}%)`)
        .join(", ");
      aoa.push([
        item.proyecto.nombre ?? item.proyecto.tienda,
        item.proyecto.tienda,
        formatearFecha(item.proyecto.fecha_inicio),
        item.proyecto.estado,
        marcasTxt,
        item.gastoTotal,
        item.cobrado,
        item.pendiente,
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
      { wch: 14 },
      { wch: 14 },
    ];
    for (let c = 0; c < 8; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= data.length; r++) {
      for (const c of [5, 6, 7]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) {
          ws[addr].t = "n";
          ws[addr].z = moneyFmt;
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, hoja);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
