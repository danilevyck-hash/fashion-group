// ============================================================================
// Marketing — reportes agregados
// Lee desde Supabase y agrega por marca / tienda.
// Todos los totales excluyen registros con anulado_en != null.
//
// 🩸 «POR PROYECTO» Y «EXPORTAR EXCEL» SE RETIRARON el 22-sep-2026 (pieza C del
// rediseño). Daniel: *«"Por proyecto" se va; "Exportar Excel" se va»* — el
// proyecto dejó de existir como contenedor (*«a) Basta la tienda»*) y el Excel
// de una marca vive en el ZIP del período (pieza D). `reportePorProyecto`,
// `exportarExcelReporte` y la ruta `/api/marketing/reportes/proyecto` (410)
// no vuelven; hay candado (`marketing-portada-y-cierre`). Ninguna tabla se
// dropea (patrón `mayor_lineas`).
//
// 🔴 DOS CAMINOS, UN INTERRUPTOR (`MARKETING_PORTADA_REDISENO`):
//   · prendido → `reportePorMarcaRediseno` / `reportePorTiendaRediseno`: la
//     marca y la tienda son las del GASTO, solo lo que `se_reporta`, UNA
//     marca = 100 % (`reportes-rediseno.ts`, puro). El año es el del documento.
//   · apagado → `reportePorMarca` / `reportePorTienda`, los de antes,
//     intactos (por proyecto y su reparto `pct / sumPct`).
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import { getMarcas } from "./queries";
import type { MkMarca } from "./types";
import { conRespaldoSinColumnas, completarGasto } from "./columnas-opcionales";
import { marcasDeEntrega, porcionEntregaParaMarca } from "./resumen-inicio";
import {
  MARKETING_TIENDAS_Y_MARCAS,
  gastoEsDeMultifashion,
  sinMultifashion,
} from "./tiendas-y-marcas";
import {
  partesPorMarca,
  reportePorMarcaDe,
  reportePorTiendaDe,
  type GastoParaReporte,
  type NombresDeMarca,
  type ReporteMarcaFila,
  type ReporteTiendaFila,
} from "./reportes-rediseno";

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
  tienda_codigo: string | null;
  fecha_inicio: string;
}

async function cargarProyectosVigentes(
  anio?: number
): Promise<ProyectoMin[]> {
  let q = supabaseServer
    .from("mk_proyectos")
    .select("id, nombre, tienda, tienda_codigo, fecha_inicio")
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
      tienda_codigo: (x.tienda_codigo as string | null) ?? null,
      fecha_inicio: String(x.fecha_inicio ?? ""),
    };
  });
}

// 🩸 `cargarProyMarcas` (leía `mk_proyecto_marcas`) SE RETIRÓ el 22-sep-2026:
// la marca es del GASTO. Las marcas de un proyecto salen de sus DOCUMENTOS
// (`cargarGastoCompletoPorMarca`: facturas ∪ entregas), la misma regla de la
// ficha del proyecto y de las tarjetas del inicio.

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

// Gasto de impulsadoras por marca. Facturas sueltas (impulsadora_id set, sin
// proyecto): cada una es una marca al 100%, así que su total va completo a esa
// marca. Se filtra por año contra impulsadora_mes cuando se pide.
async function cargarGastoImpulsadoraPorMarca(
  anio?: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let q = supabaseServer
    .from("mk_facturas")
    .select("id, total, impulsadora_mes")
    .not("impulsadora_id", "is", null)
    .is("anulado_en", null);
  const rango = anioRange(anio);
  if (rango) q = q.gte("impulsadora_mes", rango.ini).lte("impulsadora_mes", rango.fin);
  const { data: facts, error: fErr } = await q;
  if (fErr) throw new Error(`cargarGastoImpulsadoraPorMarca[fact]: ${fErr.message}`);
  const facturas = (facts ?? []) as Array<{ id: string; total: number | null }>;
  if (facturas.length === 0) return out;

  const totalById = new Map(facturas.map((f) => [String(f.id), Number(f.total ?? 0)]));
  const { data: fm, error: fmErr } = await supabaseServer
    .from("mk_factura_marcas")
    .select("factura_id, marca_id")
    .in("factura_id", Array.from(totalById.keys()));
  if (fmErr) throw new Error(`cargarGastoImpulsadoraPorMarca[fm]: ${fmErr.message}`);

  for (const r of (fm ?? []) as Array<{ factura_id: string; marca_id: string }>) {
    const monto = totalById.get(String(r.factura_id)) ?? 0;
    const mid = String(r.marca_id);
    out.set(mid, round2((out.get(mid) ?? 0) + monto));
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
  const [gastoPorProyMarca, gastoImpulsadora] = await Promise.all([
    cargarGastoCompletoPorMarca(proyectoIds),
    cargarGastoImpulsadoraPorMarca(anio),
  ]);

  // Gasto completo por marca = suma sobre todos los proyectos + impulsadoras.
  const gastoByMarca = new Map<string, number>();
  for (const [, inner] of gastoPorProyMarca) {
    for (const [marcaId, monto] of inner) {
      gastoByMarca.set(marcaId, (gastoByMarca.get(marcaId) ?? 0) + monto);
    }
  }
  for (const [marcaId, monto] of gastoImpulsadora) {
    gastoByMarca.set(marcaId, (gastoByMarca.get(marcaId) ?? 0) + monto);
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

  // Agrupa por CÓDIGO de directorio (tienda_codigo) si existe — así dos
  // proyectos de la misma tienda con texto distinto se unen — y fallback al
  // nombre libre. La key es código||nombre; el display es el nombre (`tienda`).
  const bucket = new Map<
    string,
    { tienda: string; porMarca: Record<string, number>; total: number }
  >();
  for (const [proyectoId, inner] of gastoPorProyMarca) {
    const proyecto = proyectoById.get(proyectoId);
    if (!proyecto) continue;
    const key = proyecto.tienda_codigo || proyecto.tienda;
    const entry =
      bucket.get(key) ?? { tienda: proyecto.tienda, porMarca: {}, total: 0 };
    for (const [marcaId, monto] of inner) {
      const marca = marcaById.get(marcaId);
      if (!marca) continue;
      entry.porMarca[marca.nombre] = Number(
        ((entry.porMarca[marca.nombre] ?? 0) + monto).toFixed(2)
      );
      entry.total = Number((entry.total + monto).toFixed(2));
    }
    bucket.set(key, entry);
  }

  return Array.from(bucket.values())
    .map((v) => ({ tienda: v.tienda, porMarca: v.porMarca, total: v.total }))
    .sort((a, b) => a.tienda.localeCompare(b.tienda, "es"));
}

// ----------------------------------------------------------------------------
// EL REDISEÑO (22-sep-2026): la marca y la tienda son las del GASTO
// ----------------------------------------------------------------------------

interface FacturaGasto {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  impulsadora_id: string | null;
  impulsadora_mes: string | null;
  fecha_factura: string | null;
  se_reporta?: boolean | null;
  tienda_codigo?: string | null;
}
interface EntregaGasto {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  total_por_marca: Record<string, number> | null;
  total_por_empresa_interna: Record<string, number> | null;
  created_at: string | null;
  se_reporta?: boolean | null;
  tienda_codigo?: string | null;
}

const COLS_FACTURA_GASTO = "id, proyecto_id, total, impulsadora_id, impulsadora_mes, fecha_factura";
const COLS_ENTREGA_GASTO =
  "id, proyecto_id, total, total_por_marca, total_por_empresa_interna, created_at";
const avisar = (m: string) => console.error(`[marketing/reportes] ${m}`);

/**
 * Todos los gastos vivos, cada uno con SU marca y SU tienda (las columnas del
 * rediseño; sin ellas, la tienda del proyecto de siempre). Una factura vieja
 * con dos marcas se reparte a partes iguales y se avisa (medido: ninguna).
 */
async function cargarGastosDelRediseno(): Promise<{
  gastos: GastoParaReporte[];
  nombres: NombresDeMarca;
}> {
  const [factRes, fmRes, entRes, proyRes, marcas] = await Promise.all([
    conRespaldoSinColumnas<FacturaGasto[]>(
      () =>
        supabaseServer
          .from("mk_facturas")
          .select(`${COLS_FACTURA_GASTO}, se_reporta, tienda_codigo`)
          .is("anulado_en", null),
      () => supabaseServer.from("mk_facturas").select(COLS_FACTURA_GASTO).is("anulado_en", null),
      avisar,
    ).then((r) => r.resultado),
    supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id"),
    conRespaldoSinColumnas<EntregaGasto[]>(
      () =>
        supabaseServer
          .from("mk_entregas_muebles")
          .select(`${COLS_ENTREGA_GASTO}, se_reporta, tienda_codigo`),
      () => supabaseServer.from("mk_entregas_muebles").select(COLS_ENTREGA_GASTO),
      avisar,
    ).then((r) => r.resultado),
    supabaseServer.from("mk_proyectos").select("id, tienda, tienda_codigo").is("anulado_en", null),
    getMarcas(),
  ]);
  if (factRes.error) throw new Error(`reportes[fact]: ${factRes.error.message}`);
  if (fmRes.error) throw new Error(`reportes[fm]: ${fmRes.error.message}`);
  if (entRes.error) throw new Error(`reportes[ent]: ${entRes.error.message}`);
  if (proyRes.error) throw new Error(`reportes[proy]: ${proyRes.error.message}`);

  const proyectos = new Map(
    ((proyRes.data ?? []) as Array<{ id: string; tienda: string | null; tienda_codigo: string | null }>).map(
      (p) => [String(p.id), p],
    ),
  );
  const codigoDeMarca = new Map(marcas.map((m) => [m.id, String(m.codigo ?? "").trim().toUpperCase()]));
  const empresaDeMarca = new Map(marcas.map((m) => [m.id, m.empresa_codigo ?? null]));
  const nombres: Record<string, string> = {};
  for (const m of marcas) nombres[String(m.codigo ?? "").trim().toUpperCase()] = m.nombre;

  // La tienda del gasto; sin ella (la migración sin correr), la del proyecto.
  // 🔴 Y si el gasto es de Multifashion (por su tienda o por su proyecto), se
  // dice: por marca no se le cobra a nadie (23-sep-2026).
  const tiendaDe = (fila: { tienda_codigo?: string | null; proyecto_id: string | null }) => {
    const p = fila.proyecto_id ? proyectos.get(String(fila.proyecto_id)) : undefined;
    const codigo = (fila.tienda_codigo ?? p?.tienda_codigo ?? null)?.toString().trim().toUpperCase() || null;
    return {
      codigo,
      nombre: p?.tienda ?? null,
      esMultifashion: gastoEsDeMultifashion({ tiendaCodigo: codigo, proyecto: p ?? null }),
    };
  };

  const marcasPorFactura = new Map<string, Array<{ marcaId: string }>>();
  for (const r of (fmRes.data ?? []) as Array<{ factura_id: string; marca_id: string }>) {
    const arr = marcasPorFactura.get(String(r.factura_id)) ?? [];
    arr.push({ marcaId: String(r.marca_id) });
    marcasPorFactura.set(String(r.factura_id), arr);
  }

  const gastos: GastoParaReporte[] = [];
  for (const raw of (factRes.data ?? []) as FacturaGasto[]) {
    const f = completarGasto(raw as unknown as Record<string, unknown>) as unknown as FacturaGasto;
    const tienda = tiendaDe(f);
    const { partes, repartido } = partesPorMarca(Number(f.total ?? 0), marcasPorFactura.get(f.id) ?? []);
    if (repartido) avisar(`la factura ${f.id} trae más de una marca; se repartió a partes iguales.`);
    for (const parte of partes) {
      gastos.push({
        id: partes.length === 1 ? f.id : `${f.id}:${parte.marcaId}`,
        tipo: f.impulsadora_id ? "impulsadora" : "factura",
        marcaCodigo: codigoDeMarca.get(parte.marcaId) ?? null,
        tiendaCodigo: tienda.codigo,
        tiendaNombre: tienda.nombre,
        monto: parte.monto,
        seReporta: f.se_reporta,
        fecha: (f.impulsadora_id ? f.impulsadora_mes : f.fecha_factura) ?? f.fecha_factura,
        esTiendaPropia: tienda.esMultifashion,
      });
    }
  }
  for (const raw of (entRes.data ?? []) as EntregaGasto[]) {
    const e = completarGasto(raw as unknown as Record<string, unknown>) as unknown as EntregaGasto;
    const tienda = tiendaDe(e);
    const marcas = marcasDeEntrega(e);
    if (marcas.length > 1) avisar(`la entrega ${e.id} trae más de una marca.`);
    for (const mid of marcas) {
      const monto = porcionEntregaParaMarca(e, mid, empresaDeMarca.get(mid));
      if (monto <= 0) continue;
      gastos.push({
        id: marcas.length === 1 ? e.id : `${e.id}:${mid}`,
        tipo: "mueble",
        marcaCodigo: codigoDeMarca.get(mid) ?? null,
        tiendaCodigo: tienda.codigo,
        tiendaNombre: tienda.nombre,
        monto,
        seReporta: e.se_reporta,
        fecha: e.created_at ? String(e.created_at).slice(0, 10) : null,
        esTiendaPropia: tienda.esMultifashion,
      });
    }
  }
  // 🔴 EL NOMBRE DE LA TIENDA SALE DEL DIRECTORIO, POR CÓDIGO (23-sep-2026).
  // 🩸 Salía de `mk_proyectos.tienda` (texto libre): «City Mall Pasocanoa»,
  // «Nova Lux, S.a.», «La Frontera Dutty Free» — tres grafías para la misma
  // tienda según la pantalla. Con el interruptor, el nombre es el de
  // `clientes_master`; si la lectura se cae, queda el de antes (falla ABIERTA).
  if (MARKETING_TIENDAS_Y_MARCAS) {
    const codigos = [...new Set(gastos.map((g) => g.tiendaCodigo).filter((c): c is string => !!c))];
    if (codigos.length > 0) {
      const { data } = await supabaseServer
        .from("clientes_master")
        .select("codigo, nombre")
        .in("codigo", codigos);
      const nombrePorCodigo = new Map<string, string>();
      for (const c of (data ?? []) as Array<{ codigo: string; nombre: string | null }>) {
        const nombre = String(c.nombre ?? "").trim();
        if (nombre.length > 0) nombrePorCodigo.set(String(c.codigo).toUpperCase(), nombre);
      }
      for (const g of gastos) {
        const nombre = g.tiendaCodigo ? nombrePorCodigo.get(g.tiendaCodigo) : undefined;
        if (nombre) g.tiendaNombre = nombre;
      }
    }
  }
  return { gastos, nombres };
}

/**
 * Por marca, el rediseño: UN total (lo reportado) por marca, sin pie.
 *
 * 🔴 SIN MULTIFASHION (23-sep-2026). 🩸 Por marca sumaba los gastos de la
 * tienda propia a Tommy ($1.319,25) y a Calvin ($2.477,58): si esos números
 * salían del sistema, se le reportaba a PVH gasto de la tienda propia. Es la
 * MISMA regla de la portada de marcas y del ZIP (`MULTIFASHION_KEY` aparte).
 * Por tienda no cambia: ahí Multifashion es una fila más.
 */
export async function reportePorMarcaRediseno(anio?: number): Promise<ReporteMarcaFila[]> {
  const { gastos, nombres } = await cargarGastosDelRediseno();
  const base = MARKETING_TIENDAS_Y_MARCAS ? sinMultifashion(gastos) : gastos;
  return reportePorMarcaDe(base, nombres, anio);
}

/** Por tienda, el rediseño: la tienda del GASTO, «General» al final. */
export async function reportePorTiendaRediseno(anio?: number): Promise<ReporteTiendaFila[]> {
  const { gastos, nombres } = await cargarGastosDelRediseno();
  return reportePorTiendaDe(gastos, nombres, anio);
}
