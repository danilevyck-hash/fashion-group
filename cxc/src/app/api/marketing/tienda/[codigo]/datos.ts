// ============================================================================
// Marketing — LEER TODO LO DE UNA TIENDA. El lado servidor de la vista nueva.
//
// 🔴 LA TIENDA SE RESUELVE POR CÓDIGO (`clientes_master.codigo`), NUNCA por
// nombre — la misma regla del CXC y del Directorio. El nombre solo se dibuja.
//
// 🔴 TODA LECTURA DE LAS COLUMNAS DEL REDISEÑO PASA POR `columnas-opcionales`:
// si `tienda_codigo` no existiera (la migración sin correr), la pantalla lo
// DICE y se queda vacía en vez de reventar. Hoy están aplicadas.
//
// 🔴 QUÉ SUMA lo decide `periodo-estado.ts` y el agrupado por marca
// `vista-tienda.ts`. Acá no se vuelve a definir ninguna de las dos cosas.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { completarGasto, esColumnaAusente } from "@/lib/marketing/columnas-opcionales";
import { seReportaDe, tipoDeFila, TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  agruparPorMarca,
  esCodigoGeneral,
  rotuloDeLaTienda,
  totalDeLaTienda,
  type FilaDeTienda,
  type GrupoPorMarca,
} from "@/lib/marketing/vista-tienda";
import type { TotalesDelPeriodo } from "@/lib/marketing/periodo-estado";

export interface DatosDeLaTienda {
  /** El código pedido, ya normalizado. `null` = el cajón «General». */
  codigo: string | null;
  /** Lo que se dibuja arriba. */
  nombre: string;
  /** ¿El código existe en el directorio? `null` en «General». */
  enElDirectorio: boolean | null;
  grupos: GrupoPorMarca[];
  totales: TotalesDelPeriodo;
  fotos: number;
  /** `true` cuando la base todavía no tiene las columnas del rediseño. */
  sinMigracion: boolean;
}

type Fila = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "2026-06-12T19:21:16Z" → "2026-06-12". Sin inventar zona horaria. */
function soloElDia(valor: unknown): string {
  const s = String(valor ?? "");
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export async function leerDatosDeLaTienda(codigoCrudo: string): Promise<DatosDeLaTienda> {
  const general = esCodigoGeneral(codigoCrudo);
  const codigo = general ? null : String(codigoCrudo ?? "").trim().toUpperCase();

  const vacio = (sinMigracion: boolean, nombre: string, enElDirectorio: boolean | null): DatosDeLaTienda => ({
    codigo,
    nombre,
    enElDirectorio,
    grupos: [],
    totales: { reportado: 0, noReportado: 0, cantidadReportada: 0, cantidadNoReportada: 0 },
    fotos: 0,
    sinMigracion,
  });

  // ── El nombre: del directorio, por CÓDIGO ──────────────────────────────────
  let nombreDirectorio: string | null = null;
  let enElDirectorio: boolean | null = general ? null : false;
  if (codigo) {
    const { data } = await supabaseServer
      .from("clientes_master")
      .select("codigo, nombre")
      .eq("codigo", codigo)
      .eq("deleted", false)
      .limit(1);
    const fila = (data ?? [])[0] as Fila | undefined;
    if (fila) {
      nombreDirectorio = String(fila.nombre ?? "").trim() || null;
      enElDirectorio = true;
    }
  }
  const nombre = general
    ? TIENDA_GENERAL
    : rotuloDeLaTienda({ codigo, nombre: nombreDirectorio });

  // ── Las facturas y los pagos de impulsadora ────────────────────────────────
  const facturasQ = supabaseServer
    .from("mk_facturas")
    .select(
      "id, numero_factura, fecha_factura, proveedor, concepto, total, impulsadora_id, periodo_desde, se_reporta, tienda_codigo, nota",
    )
    .is("anulado_en", null);
  const facturasRes = await (codigo
    ? facturasQ.eq("tienda_codigo", codigo)
    : facturasQ.is("tienda_codigo", null));
  if (facturasRes.error) {
    if (esColumnaAusente(facturasRes.error)) return vacio(true, nombre, enElDirectorio);
    throw new Error(facturasRes.error.message);
  }

  // ── Los muebles entregados ─────────────────────────────────────────────────
  const entregasQ = supabaseServer
    .from("mk_entregas_muebles")
    .select("id, total, total_por_marca, notas, created_at, se_reporta, tienda_codigo, nota");
  const entregasRes = await (codigo
    ? entregasQ.eq("tienda_codigo", codigo)
    : entregasQ.is("tienda_codigo", null));
  if (entregasRes.error) {
    if (esColumnaAusente(entregasRes.error)) return vacio(true, nombre, enElDirectorio);
    throw new Error(entregasRes.error.message);
  }

  const facturas = (facturasRes.data ?? []).map((f) => completarGasto(f as Fila));
  const entregas = (entregasRes.data ?? []).map((e) => completarGasto(e as Fila));

  const idsFactura = facturas.map((f) => String(f.id));
  const idsEntrega = entregas.map((e) => String(e.id));

  // ── Las marcas, el sello del período y los nombres de las impulsadoras ─────
  const idsImpulsadora = [
    ...new Set(facturas.map((f) => String(f.impulsadora_id ?? "")).filter((x) => x.length > 0)),
  ];
  const [marcasRes, facturaMarcasRes, sellosRes, impulsadorasRes, fotosRes] = await Promise.all([
    supabaseServer.from("mk_marcas").select("id, codigo, nombre"),
    idsFactura.length > 0
      ? supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id").in("factura_id", idsFactura)
      : Promise.resolve({ data: [], error: null }),
    idsFactura.length + idsEntrega.length > 0
      ? supabaseServer
          .from("mk_periodo_documentos")
          .select("tipo, documento_id, periodo_id")
          .in("documento_id", [...idsFactura, ...idsEntrega])
      : Promise.resolve({ data: [], error: null }),
    idsImpulsadora.length > 0
      ? supabaseServer.from("mk_impulsadoras").select("id, nombre").in("id", idsImpulsadora)
      : Promise.resolve({ data: [], error: null }),
    codigo
      ? supabaseServer
          .from("mk_adjuntos")
          .select("id", { count: "exact", head: true })
          .eq("tipo", "foto_proyecto")
          .eq("tienda_codigo", codigo)
      : Promise.resolve({ count: 0, error: null } as { count: number | null; error: null }),
  ]);

  const marcaPorId = new Map<string, { codigo: string; nombre: string }>();
  for (const m of (marcasRes.data ?? []) as Fila[]) {
    marcaPorId.set(String(m.id), {
      codigo: String(m.codigo ?? "").trim().toUpperCase(),
      nombre: String(m.nombre ?? "").trim(),
    });
  }
  const marcaDeFactura = new Map<string, string>();
  for (const fm of (facturaMarcasRes.data ?? []) as Fila[]) {
    const fid = String(fm.factura_id);
    if (!marcaDeFactura.has(fid)) marcaDeFactura.set(fid, String(fm.marca_id));
  }
  const periodoDeDoc = new Map<string, string>();
  for (const s of (sellosRes.data ?? []) as Fila[]) {
    periodoDeDoc.set(String(s.documento_id), String(s.periodo_id));
  }
  const nombreImpulsadora = new Map<string, string>();
  for (const i of (impulsadorasRes.data ?? []) as Fila[]) {
    nombreImpulsadora.set(String(i.id), String(i.nombre ?? "").trim());
  }

  const idsPeriodo = [...new Set([...periodoDeDoc.values()])];
  const periodoPorId = new Map<string, { estado: "abierto" | "cerrado" | null; nombre: string | null }>();
  if (idsPeriodo.length > 0) {
    const { data } = await supabaseServer
      .from("mk_periodos")
      .select("id, nombre, estado")
      .in("id", idsPeriodo);
    for (const p of (data ?? []) as Fila[]) {
      const estado = String(p.estado ?? "");
      periodoPorId.set(String(p.id), {
        estado: estado === "abierto" || estado === "cerrado" ? estado : null,
        nombre: String(p.nombre ?? "").trim() || null,
      });
    }
  }

  const delPeriodo = (docId: string) => {
    const pid = periodoDeDoc.get(docId);
    const p = pid ? periodoPorId.get(pid) : undefined;
    return { estadoPeriodo: p?.estado ?? null, periodoNombre: p?.nombre ?? null };
  };

  // ── Las filas ──────────────────────────────────────────────────────────────
  const filas: FilaDeTienda[] = [];

  for (const f of facturas) {
    const id = String(f.id);
    const marca = marcaPorId.get(marcaDeFactura.get(id) ?? "");
    const impulsadoraId = String(f.impulsadora_id ?? "");
    const tipo = tipoDeFila({ tabla: "mk_facturas", impulsadora_id: impulsadoraId || null });
    const numero = String(f.numero_factura ?? "").trim();
    const concepto = String(f.concepto ?? "").trim();
    const nota = String(f.nota ?? "").trim();
    filas.push({
      id,
      tipo,
      marcaCodigo: marca?.codigo ?? "",
      marcaNombre: marca?.nombre ?? "Sin marca",
      proveedor:
        tipo === "impulsadora"
          ? nombreImpulsadora.get(impulsadoraId) || String(f.proveedor ?? "").trim()
          : String(f.proveedor ?? "").trim(),
      detalle: [numero ? `N° ${numero}` : "", nota || concepto].filter(Boolean).join(" · "),
      monto: num(f.total),
      fecha: soloElDia(
        tipo === "impulsadora" ? (f.periodo_desde ?? f.fecha_factura) : f.fecha_factura,
      ),
      seReporta: seReportaDe(f.se_reporta),
      ...delPeriodo(id),
    });
  }

  for (const e of entregas) {
    const id = String(e.id);
    // Una entrega lleva UNA marca (`exigirUnaMarca`); su id es la clave de
    // `total_por_marca`. Si trajera más, se toma la primera y el total NO se
    // reparte: repartir es justo lo que el rediseño quitó.
    const porMarca = (e.total_por_marca ?? {}) as Record<string, unknown>;
    const marcaId = Object.keys(porMarca)[0] ?? "";
    const marca = marcaPorId.get(marcaId);
    const nota = String(e.nota ?? "").trim();
    const notas = String(e.notas ?? "").trim();
    filas.push({
      id,
      tipo: tipoDeFila({ tabla: "mk_entregas_muebles" }),
      marcaCodigo: marca?.codigo ?? "",
      marcaNombre: marca?.nombre ?? "Sin marca",
      proveedor: "",
      detalle: nota || notas || "Muebles de la bodega",
      monto: num(e.total),
      fecha: soloElDia(e.created_at),
      seReporta: seReportaDe(e.se_reporta),
      ...delPeriodo(id),
    });
  }

  const grupos = agruparPorMarca(filas);
  return {
    codigo,
    nombre,
    enElDirectorio,
    grupos,
    totales: totalDeLaTienda(grupos),
    fotos: Number((fotosRes as { count?: number | null }).count ?? 0),
    sinMigracion: false,
  };
}
