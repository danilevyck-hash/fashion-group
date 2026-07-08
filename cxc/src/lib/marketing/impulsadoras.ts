// ============================================================================
// Marketing — Impulsadoras (lectura + escritura contra Supabase)
// ============================================================================
// Catálogo de impulsadoras con sueldo mensual fijo repartido a marca(s). El
// pago mensual cae en mk_facturas como gastos SUELTOS (proyecto_id NULL,
// impulsadora_id set), UNA fila por marca según el split, con comprobante
// obligatorio en mk_adjuntos. Sin comprobante NO se guarda.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import { tituloCase, normalizarTexto } from "./normalizar";
import { getMarcas } from "./queries";
import { etiquetaMes, mesActualISO, mesAnteriorISO } from "./meses";
import type {
  MkImpulsadora,
  CreateImpulsadoraInput,
  RegistrarPagoImpulsadoraInput,
  ImpulsadoraConEstado,
  ImpulsadoraMarcaResuelta,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Normaliza cualquier fecha "YYYY-MM-.." al día 1 de ese mes.
function normalizarMes(mes: string): string {
  const s = normalizarTexto(mes).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) {
    throw new Error("mes inválido (esperado YYYY-MM)");
  }
  return `${s}-01`;
}

// ----------------------------------------------------------------------------
// Lectura
// ----------------------------------------------------------------------------

interface SplitRow {
  impulsadora_id: string;
  marca_id: string;
  porcentaje: number;
}

async function cargarSplits(
  impulsadoraIds: ReadonlyArray<string>,
): Promise<Map<string, SplitRow[]>> {
  const out = new Map<string, SplitRow[]>();
  if (impulsadoraIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_impulsadora_marcas")
    .select("impulsadora_id, marca_id, porcentaje")
    .in("impulsadora_id", impulsadoraIds);
  if (error) throw new Error(`cargarSplits: ${error.message}`);
  for (const r of (data ?? []) as SplitRow[]) {
    const key = String(r.impulsadora_id);
    const arr = out.get(key) ?? [];
    arr.push({
      impulsadora_id: key,
      marca_id: String(r.marca_id),
      porcentaje: Number(r.porcentaje ?? 0),
    });
    out.set(key, arr);
  }
  return out;
}

// Meses pagados por impulsadora (set de "YYYY-MM-01"), leyendo mk_facturas
// vigentes con impulsadora_id + impulsadora_mes.
async function cargarMesesPagados(
  impulsadoraIds: ReadonlyArray<string>,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (impulsadoraIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("impulsadora_id, impulsadora_mes")
    .in("impulsadora_id", impulsadoraIds)
    .is("anulado_en", null)
    .not("impulsadora_mes", "is", null);
  if (error) throw new Error(`cargarMesesPagados: ${error.message}`);
  for (const r of (data ?? []) as Array<{ impulsadora_id: string; impulsadora_mes: string }>) {
    const key = String(r.impulsadora_id);
    const set = out.get(key) ?? new Set<string>();
    set.add(String(r.impulsadora_mes).slice(0, 10));
    out.set(key, set);
  }
  return out;
}

/** Catálogo completo con split resuelto + estado de pago del mes anterior y actual. */
export async function listImpulsadoras(): Promise<ImpulsadoraConEstado[]> {
  const { data, error } = await supabaseServer
    .from("mk_impulsadoras")
    .select("*")
    .order("activa", { ascending: false })
    .order("nombre", { ascending: true });
  if (error) throw new Error(`listImpulsadoras: ${error.message}`);

  const impulsadoras = (data ?? []) as MkImpulsadora[];
  const ids = impulsadoras.map((i) => String(i.id));

  const [splits, pagados, marcas] = await Promise.all([
    cargarSplits(ids),
    cargarMesesPagados(ids),
    getMarcas(),
  ]);
  const marcaById = new Map(marcas.map((m) => [m.id, m]));

  const mesAnt = mesAnteriorISO();
  const mesAct = mesActualISO();

  return impulsadoras.map((imp) => {
    const marcasResueltas: ImpulsadoraMarcaResuelta[] = (splits.get(String(imp.id)) ?? [])
      .map((s) => {
        const marca = marcaById.get(s.marca_id);
        return marca ? { marca, porcentaje: Number(s.porcentaje) } : null;
      })
      .filter((x): x is ImpulsadoraMarcaResuelta => x !== null)
      .sort((a, b) => b.porcentaje - a.porcentaje);

    const set = pagados.get(String(imp.id)) ?? new Set<string>();
    return {
      ...imp,
      monto_mensual: Number(imp.monto_mensual),
      marcas: marcasResueltas,
      mesAnterior: { mes: mesAnt, pagado: set.has(mesAnt) },
      mesActual: { mes: mesAct, pagado: set.has(mesAct) },
    };
  });
}

// ----------------------------------------------------------------------------
// Escritura
// ----------------------------------------------------------------------------

// Valida un split de marcas: ≥1 marca, ids únicos, cada % > 0, suma ≈ 100.
function validarSplit(
  marcas: ReadonlyArray<{ marcaId: string; porcentaje: number }>,
): void {
  if (!Array.isArray(marcas) || marcas.length === 0) {
    throw new Error("Debe asignar al menos una marca");
  }
  const ids = new Set<string>();
  let suma = 0;
  for (const m of marcas) {
    if (!m.marcaId) throw new Error("marcaId vacío en el split");
    if (ids.has(m.marcaId)) throw new Error("Marca repetida en el split");
    ids.add(m.marcaId);
    const pct = Number(m.porcentaje);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error("Porcentaje inválido (debe ser entre 1 y 100)");
    }
    suma += pct;
  }
  if (Math.abs(suma - 100) > 0.01) {
    throw new Error(`Los porcentajes deben sumar 100% (actual: ${round2(suma)}%)`);
  }
}

/** Crea una impulsadora con su split de marcas. */
export async function createImpulsadora(
  input: CreateImpulsadoraInput,
): Promise<MkImpulsadora> {
  const nombre = tituloCase(input.nombre ?? "");
  if (!nombre) throw new Error("El nombre es obligatorio");
  const monto = round2(Number(input.montoMensual ?? 0));
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error("Monto mensual inválido");
  }
  validarSplit(input.marcas ?? []);

  const { data, error } = await supabaseServer
    .from("mk_impulsadoras")
    .insert({ nombre, monto_mensual: monto, activa: true })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createImpulsadora: ${error?.message ?? "sin datos"}`);
  }
  const impulsadora = data as MkImpulsadora;

  const filas = input.marcas.map((m) => ({
    impulsadora_id: impulsadora.id,
    marca_id: m.marcaId,
    porcentaje: round2(Number(m.porcentaje)),
  }));
  const { error: errMarcas } = await supabaseServer
    .from("mk_impulsadora_marcas")
    .insert(filas);
  if (errMarcas) {
    // Rollback: la impulsadora sin split es basura → borrarla (cascade).
    await supabaseServer.from("mk_impulsadoras").delete().eq("id", impulsadora.id);
    throw new Error(`createImpulsadora[marcas]: ${errMarcas.message}`);
  }
  return { ...impulsadora, monto_mensual: Number(impulsadora.monto_mensual) };
}

// Distribuye `monto` entre las marcas por %, cuadrando centavos en la última
// para que Σ porciones == monto exacto.
function repartirMonto(
  monto: number,
  marcas: ReadonlyArray<{ marca_id: string; porcentaje: number }>,
): Array<{ marca_id: string; monto: number }> {
  const total = round2(monto);
  const out: Array<{ marca_id: string; monto: number }> = [];
  let acumulado = 0;
  marcas.forEach((m, i) => {
    const esUltima = i === marcas.length - 1;
    const porcion = esUltima
      ? round2(total - acumulado)
      : round2((total * Number(m.porcentaje)) / 100);
    acumulado = round2(acumulado + porcion);
    out.push({ marca_id: m.marca_id, monto: porcion });
  });
  return out;
}

/**
 * Registra el pago mensual de una impulsadora. Crea UNA factura por marca
 * (proyecto_id NULL, impulsadora_id set, estado Pagado) con su porción del
 * monto, su marca al 100% en mk_factura_marcas, y el comprobante adjunto.
 * El comprobante es OBLIGATORIO: sin `path` lanza error (validación server-side).
 * Idempotencia por mes: si ya hay pago vigente de ese mes, rechaza.
 */
export async function registrarPagoImpulsadora(
  impulsadoraId: string,
  input: RegistrarPagoImpulsadoraInput,
): Promise<{ facturasCreadas: number }> {
  if (!impulsadoraId) throw new Error("impulsadoraId requerido");

  // Comprobante obligatorio (validación dura server-side).
  const comprobante = input.comprobante;
  const comprobantePath = normalizarTexto(comprobante?.path ?? "");
  if (!comprobantePath) {
    throw new Error("El comprobante es obligatorio");
  }
  if (comprobante.tipo !== "pdf_factura" && comprobante.tipo !== "foto_factura") {
    throw new Error("Tipo de comprobante inválido");
  }

  const mesISO = normalizarMes(input.mes);
  const monto = round2(Number(input.monto ?? 0));
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("Monto inválido");
  }

  // Impulsadora + su split actual.
  const { data: impData, error: impErr } = await supabaseServer
    .from("mk_impulsadoras")
    .select("id, nombre")
    .eq("id", impulsadoraId)
    .maybeSingle();
  if (impErr) throw new Error(`registrarPago[impulsadora]: ${impErr.message}`);
  if (!impData) throw new Error("La impulsadora no existe");
  const nombreImpulsadora = String((impData as { nombre: string }).nombre);

  const splits = await cargarSplits([impulsadoraId]);
  const split = splits.get(impulsadoraId) ?? [];
  if (split.length === 0) {
    throw new Error("La impulsadora no tiene marcas asignadas");
  }

  // Idempotencia: no permitir doble pago del mismo mes.
  const { data: yaData, error: yaErr } = await supabaseServer
    .from("mk_facturas")
    .select("id")
    .eq("impulsadora_id", impulsadoraId)
    .eq("impulsadora_mes", mesISO)
    .is("anulado_en", null)
    .limit(1);
  if (yaErr) throw new Error(`registrarPago[dup]: ${yaErr.message}`);
  if ((yaData ?? []).length > 0) {
    throw new Error(`Ya se registró el pago de ${etiquetaMes(mesISO)}`);
  }

  const concepto = `Impulsadora ${nombreImpulsadora} — ${etiquetaMes(mesISO)}`;
  const numeroFactura = `IMP-${mesISO.slice(0, 7)}`;
  const fechaFactura = new Date().toISOString().slice(0, 10);
  const porciones = repartirMonto(monto, split);

  const creadas: string[] = [];
  try {
    for (const p of porciones) {
      const { data: facData, error: facErr } = await supabaseServer
        .from("mk_facturas")
        .insert({
          proyecto_id: null,
          impulsadora_id: impulsadoraId,
          impulsadora_mes: mesISO,
          numero_factura: numeroFactura,
          fecha_factura: fechaFactura,
          proveedor: tituloCase(nombreImpulsadora),
          concepto,
          subtotal: p.monto,
          itbms: 0,
          total: p.monto,
          tiene_importacion: false,
          estado_pago: "pagado",
          grupo_legacy: false,
        })
        .select("id")
        .single();
      if (facErr || !facData) {
        throw new Error(facErr?.message ?? "no se creó la factura");
      }
      const facturaId = String((facData as { id: string }).id);
      creadas.push(facturaId);

      const { error: fmErr } = await supabaseServer
        .from("mk_factura_marcas")
        .insert({
          factura_id: facturaId,
          marca_id: p.marca_id,
          porcentaje: 100, // la factura ya es la porción de esta marca
          empresa_pagadora_codigo: null,
        });
      if (fmErr) throw new Error(fmErr.message);

      const { error: adjErr } = await supabaseServer
        .from("mk_adjuntos")
        .insert({
          proyecto_id: null,
          factura_id: facturaId,
          tipo: comprobante.tipo,
          url: comprobantePath,
          nombre_original: comprobante.nombreOriginal
            ? normalizarTexto(comprobante.nombreOriginal)
            : null,
          size_bytes: comprobante.sizeBytes ?? null,
        });
      if (adjErr) throw new Error(adjErr.message);
    }
  } catch (err) {
    // Rollback best-effort: borrar las facturas creadas (cascade a marcas/adjuntos).
    if (creadas.length > 0) {
      await supabaseServer.from("mk_facturas").delete().in("id", creadas);
    }
    const msg = err instanceof Error ? err.message : "error al guardar el pago";
    throw new Error(`registrarPago: ${msg}`);
  }

  return { facturasCreadas: creadas.length };
}
