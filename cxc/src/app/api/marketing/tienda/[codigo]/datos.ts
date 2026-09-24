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
import {
  completarGasto,
  completarPeriodo,
  conRespaldoSinColumnas,
  esColumnaAusente,
} from "@/lib/marketing/columnas-opcionales";
import type { PeriodoDelGasto } from "@/lib/marketing/periodo-manda";
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
import { MARKETING_TIENDAS_Y_MARCAS } from "@/lib/marketing/tiendas-y-marcas";
import { etiquetaMes } from "@/lib/marketing/meses";

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
  /**
   * 🔴 LA FICHA COMO UNA LISTA (23-sep-2026, Tiendas y Marcas): las mismas
   * filas de `grupos`, planas y con lo que la tabla nueva necesita (N°,
   * subtotal, ITBMS, si tiene PDF…). Solo con el interruptor; sin él, vacía.
   *
   * 🩸 `anuladas` SIEMPRE viaja vacía desde el 23-sep-2026 (el período manda):
   * un gasto anulado no sale del servidor hacia ninguna pantalla. El campo se
   * queda para no romper a quien lo lea.
   */
  filas: FilaDeTienda[];
  anuladas: FilaDeTienda[];
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
    filas: [],
    anuladas: [],
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
  // Con el interruptor de Tiendas y Marcas vienen las columnas que la lista
  // nueva dibuja. 🔴 SOLO LAS VIVAS, con o sin interruptor (23-sep-2026, el
  // período manda): lo anulado no sale del servidor hacia ninguna pantalla.
  const columnasFactura: string = MARKETING_TIENDAS_Y_MARCAS
    ? "id, numero_factura, fecha_factura, proveedor, concepto, total, subtotal, itbms, impulsadora_id, impulsadora_mes, periodo_desde, se_reporta, tienda_codigo, nota, anulado_en, anulado_motivo, proyecto_id"
    : "id, numero_factura, fecha_factura, proveedor, concepto, total, impulsadora_id, periodo_desde, se_reporta, tienda_codigo, nota";
  const facturasVivasQ = supabaseServer.from("mk_facturas").select(columnasFactura).is("anulado_en", null);
  const facturasRes = await (codigo
    ? facturasVivasQ.eq("tienda_codigo", codigo)
    : facturasVivasQ.is("tienda_codigo", null));
  if (facturasRes.error) {
    if (esColumnaAusente(facturasRes.error)) return vacio(true, nombre, enElDirectorio);
    throw new Error(facturasRes.error.message);
  }

  // ── Los muebles entregados ─────────────────────────────────────────────────
  const entregasQ = supabaseServer
    .from("mk_entregas_muebles")
    .select("id, total, total_por_marca, notas, created_at, se_reporta, tienda_codigo, nota, proyecto_id");
  const entregasRes = await (codigo
    ? entregasQ.eq("tienda_codigo", codigo)
    : entregasQ.is("tienda_codigo", null));
  if (entregasRes.error) {
    if (esColumnaAusente(entregasRes.error)) return vacio(true, nombre, enElDirectorio);
    throw new Error(entregasRes.error.message);
  }

  const facturas = ((facturasRes.data ?? []) as unknown as Fila[]).map((f) => completarGasto(f));
  const entregas = (entregasRes.data ?? []).map((e) => completarGasto(e as Fila));

  const idsFactura = facturas.map((f) => String(f.id));
  const idsEntrega = entregas.map((e) => String(e.id));

  // ── Las marcas, el sello del período y los nombres de las impulsadoras ─────
  const idsImpulsadora = [
    ...new Set(facturas.map((f) => String(f.impulsadora_id ?? "")).filter((x) => x.length > 0)),
  ];
  const [marcasRes, facturaMarcasRes, sellosRes, impulsadorasRes, fotosRes, pdfRes] = await Promise.all([
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
    // Qué facturas tienen su PDF (o foto) adjunto: el botón «PDF» de la fila.
    MARKETING_TIENDAS_Y_MARCAS && idsFactura.length > 0
      ? supabaseServer
          .from("mk_adjuntos")
          .select("factura_id")
          .in("factura_id", idsFactura)
          .in("tipo", ["pdf_factura", "foto_factura"])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const facturasConPdf = new Set(
    ((pdfRes as { data?: Fila[] | null }).data ?? []).map((a) => String(a.factura_id)),
  );

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
  // Un documento puede llevar más de un sello (medido: la factura de Impreco
  // de D-118 está sellada DOS veces a «mid 2026»). Se guardan todos.
  const sellosDeDoc = new Map<string, string[]>();
  for (const s of (sellosRes.data ?? []) as Fila[]) {
    const doc = String(s.documento_id);
    sellosDeDoc.set(doc, [...(sellosDeDoc.get(doc) ?? []), String(s.periodo_id)]);
  }
  const nombreImpulsadora = new Map<string, string>();
  for (const i of (impulsadorasRes.data ?? []) as Fila[]) {
    nombreImpulsadora.set(String(i.id), String(i.nombre ?? "").trim());
  }

  const idsPeriodo = [...new Set([...sellosDeDoc.values()].flat())];
  type PeriodoLeido = {
    estado: "abierto" | "cerrado" | null;
    nombre: string | null;
    nombreAlCerrar: string | null;
    proveedorKey: string;
    cerradoEn: string | null;
  };
  const periodoPorId = new Map<string, PeriodoLeido>();
  if (idsPeriodo.length > 0) {
    // `nombre_al_cerrar` es columna del rediseño: se lee con respaldo.
    const { resultado } = await conRespaldoSinColumnas<Fila[]>(
      () =>
        supabaseServer
          .from("mk_periodos")
          .select("id, nombre, estado, proveedor_key, cerrado_en, nombre_al_cerrar")
          .in("id", idsPeriodo),
      () => supabaseServer.from("mk_periodos").select("id, nombre, estado, proveedor_key, cerrado_en").in("id", idsPeriodo),
    );
    for (const cruda of (resultado.data ?? []) as Fila[]) {
      const p = completarPeriodo(cruda);
      const estado = String(p.estado ?? "");
      periodoPorId.set(String(p.id), {
        estado: estado === "abierto" || estado === "cerrado" ? estado : null,
        nombre: String(p.nombre ?? "").trim() || null,
        nombreAlCerrar: String(p.nombre_al_cerrar ?? "").trim() || null,
        proveedorKey: String(p.proveedor_key ?? "").trim(),
        cerradoEn: p.cerrado_en ? String(p.cerrado_en) : null,
      });
    }
  }

  /**
   * 🔴 EL PERÍODO MANDA (23-sep-2026): con el interruptor, un sello a un
   * período CERRADO gana sobre uno abierto — el gasto ya se le pasó a la marca
   * y a ese cierre pertenece. Sin sello a un cerrado, está abierto. Sin el
   * interruptor, como antes: el último sello leído.
   */
  const delPeriodo = (docId: string) => {
    const pids = sellosDeDoc.get(docId) ?? [];
    const leidos = pids.map((pid) => ({ pid, p: periodoPorId.get(pid) })).filter((x) => !!x.p);
    const elegido = MARKETING_TIENDAS_Y_MARCAS
      ? (leidos.find((x) => x.p?.estado === "cerrado") ?? leidos[0])
      : leidos[leidos.length - 1];
    const p = elegido?.p;
    const periodo: PeriodoDelGasto | null =
      MARKETING_TIENDAS_Y_MARCAS && p?.estado === "cerrado" && elegido
        ? {
            id: elegido.pid,
            nombre: p.nombreAlCerrar ?? p.nombre ?? "",
            proveedorKey: p.proveedorKey,
            cerradoEn: p.cerradoEn,
          }
        : null;
    return {
      estadoPeriodo: p?.estado ?? null,
      periodoNombre: p?.nombre ?? null,
      ...(MARKETING_TIENDAS_Y_MARCAS ? { periodo } : {}),
    };
  };

  // ── Las filas ──────────────────────────────────────────────────────────────
  const filas: FilaDeTienda[] = [];

  const filaDeFactura = (f: Fila): FilaDeTienda => {
    const id = String(f.id);
    const marca = marcaPorId.get(marcaDeFactura.get(id) ?? "");
    const impulsadoraId = String(f.impulsadora_id ?? "");
    const tipo = tipoDeFila({ tabla: "mk_facturas", impulsadora_id: impulsadoraId || null });
    const numero = String(f.numero_factura ?? "").trim();
    const concepto = String(f.concepto ?? "").trim();
    const nota = String(f.nota ?? "").trim();
    const mesImpulsadora = soloElDia(f.impulsadora_mes ?? f.periodo_desde ?? "");
    return {
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
      // Lo de más para la ficha como UNA lista (solo con el interruptor).
      ...(MARKETING_TIENDAS_Y_MARCAS
        ? {
            numero,
            subtotal: num(f.subtotal),
            itbms: num(f.itbms),
            concepto,
            nota,
            mes:
              tipo === "impulsadora" && /^\d{4}-\d{2}/.test(mesImpulsadora)
                ? etiquetaMes(mesImpulsadora)
                : undefined,
            tienePdf: facturasConPdf.has(id),
            anulada: !!f.anulado_en,
            anuladoMotivo: String(f.anulado_motivo ?? "").trim() || undefined,
            proyectoId: f.proyecto_id ? String(f.proyecto_id) : null,
          }
        : {}),
    };
  };

  for (const f of facturas) filas.push(filaDeFactura(f));

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
      ...(MARKETING_TIENDAS_Y_MARCAS
        ? { concepto: notas, nota, proyectoId: e.proyecto_id ? String(e.proyecto_id) : null }
        : {}),
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
    filas: MARKETING_TIENDAS_Y_MARCAS ? filas : [],
    anuladas: [],
  };
}
