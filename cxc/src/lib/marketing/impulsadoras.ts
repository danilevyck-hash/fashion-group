// ============================================================================
// Marketing — Impulsadoras (lectura + escritura contra Supabase)
// ============================================================================
// Catálogo de impulsadoras con sueldo mensual fijo repartido a marca(s). El
// pago cae en mk_facturas como gastos SUELTOS (proyecto_id NULL,
// impulsadora_id set), UNA fila por marca según el split, con comprobante
// obligatorio en mk_adjuntos. Sin comprobante NO se guarda.
//
// PERÍODO TRABAJADO (jul-2026): el pago dejó de ser "un mes" y pasó a ser un
// RANGO desde/hasta, para poder pagar por quincena. Consecuencias:
//   - Anti-duplicado: ya NO bloquea por mes (eso impedía la 2ª quincena).
//     Ahora rechaza el pago cuyo rango SE SOLAPA con un pago vigente de la
//     misma impulsadora — que es exactamente el error que el bloqueo por mes
//     buscaba evitar (pagar dos veces los mismos días). Quincenas contiguas
//     (1–15 y 16–31) no comparten ningún día, así que pasan.
//   - impulsadora_mes se SIGUE guardando (= mes de `desde`). Los reportes por
//     año (reportes.ts) y el orden del ZIP leen esa columna y no cambian.
//   - Los pagos viejos (solo impulsadora_mes, sin rango) se leen como el mes
//     completo. No se migran ni se tocan.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { tituloCase, normalizarTexto } from "./normalizar";
import { getMarcas } from "./queries";
import { mesActualISO, mesAnteriorISO } from "./meses";
import {
  coberturaDelMes,
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  mesDeFecha,
  periodoEfectivo,
  seSolapan,
  validarPeriodo,
  type Periodo,
} from "./periodo";
import type {
  MkImpulsadora,
  CreateImpulsadoraInput,
  RegistrarPagoImpulsadoraInput,
  ImpulsadoraConEstado,
  ImpulsadoraMarcaResuelta,
  ResultadoEliminarImpulsadora,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

// ¿Existen ya periodo_desde/periodo_hasta en mk_facturas? Se memoiza el "sí"
// (la migración no se desaplica); el "no" se reintenta en cada llamada para que
// el día que Daniel corra el DDL empiece a guardar el rango sin redeploy.
let periodoDisponible: boolean | null = null;
async function hayColumnasPeriodo(): Promise<boolean> {
  if (periodoDisponible) return true;
  const { error } = await supabaseServer
    .from("mk_facturas")
    .select("periodo_desde")
    .limit(1);
  const ok = !error;
  if (ok) periodoDisponible = true;
  return ok;
}

interface FilaPagoRaw {
  impulsadora_id: string;
  impulsadora_mes: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
}

// TOLERANCIA A DDL PENDIENTE: periodo_desde/periodo_hasta (migración
// 20260727140000) pueden no existir todavía. Si PostgREST se queja de esas
// columnas, se relee solo con impulsadora_mes y todo el módulo sigue vivo
// tratando cada pago como un mes completo (que es lo que eran antes).
async function leerPagosRaw(
  impulsadoraIds: ReadonlyArray<string>,
): Promise<FilaPagoRaw[]> {
  const consultar = (cols: string) =>
    supabaseServer
      .from("mk_facturas")
      .select(cols)
      .in("impulsadora_id", impulsadoraIds)
      .is("anulado_en", null);

  const conPeriodo = await consultar(
    "impulsadora_id, impulsadora_mes, periodo_desde, periodo_hasta",
  );
  if (!conPeriodo.error) return (conPeriodo.data ?? []) as unknown as FilaPagoRaw[];
  if (!/periodo_desde|periodo_hasta/.test(conPeriodo.error.message)) {
    throw new Error(`leerPagosRaw: ${conPeriodo.error.message}`);
  }

  const sinPeriodo = await consultar("impulsadora_id, impulsadora_mes");
  if (sinPeriodo.error) throw new Error(`leerPagosRaw: ${sinPeriodo.error.message}`);
  return (sinPeriodo.data ?? []) as unknown as FilaPagoRaw[];
}

/**
 * Períodos ya pagados por impulsadora. Un pago genera N facturas (una por
 * marca) con el MISMO período: se deduplican, si no un pago repartido en 3
 * marcas contaría 3 veces en "últimos pagos".
 */
async function cargarPeriodosPagados(
  impulsadoraIds: ReadonlyArray<string>,
): Promise<Map<string, Periodo[]>> {
  const out = new Map<string, Periodo[]>();
  if (impulsadoraIds.length === 0) return out;

  const vistos = new Map<string, Set<string>>();
  for (const r of await leerPagosRaw(impulsadoraIds)) {
    const p = periodoEfectivo(r);
    if (!p) continue;
    const key = String(r.impulsadora_id);
    const clave = `${p.desde}|${p.hasta}`;
    const set = vistos.get(key) ?? new Set<string>();
    if (set.has(clave)) continue;
    set.add(clave);
    vistos.set(key, set);
    const arr = out.get(key) ?? [];
    arr.push(p);
    out.set(key, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => (a.desde < b.desde ? -1 : 1));
  return out;
}

/**
 * Catálogo VISIBLE con split resuelto + estado de pago del mes anterior y actual.
 *
 * Filtra `activa = false`: esa es la marca de "eliminada" para las impulsadoras
 * que no se pueden borrar de verdad (ver eliminarImpulsadora). Antes la columna
 * `activa` no la ponía nadie en false —se escribía `true` al crear y solo se
 * usaba para ordenar—, así que el filtro no esconde nada que hoy se vea.
 */
export async function listImpulsadoras(): Promise<ImpulsadoraConEstado[]> {
  const { data, error } = await supabaseServer
    .from("mk_impulsadoras")
    .select("*")
    .eq("activa", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(`listImpulsadoras: ${error.message}`);

  const impulsadoras = (data ?? []) as MkImpulsadora[];
  const ids = impulsadoras.map((i) => String(i.id));

  const [splits, pagados, marcas] = await Promise.all([
    cargarSplits(ids),
    cargarPeriodosPagados(ids),
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

    const periodos = pagados.get(String(imp.id)) ?? [];
    const cobAnt = coberturaDelMes(mesAnt, periodos);
    const cobAct = coberturaDelMes(mesAct, periodos);
    return {
      ...imp,
      monto_mensual: Number(imp.monto_mensual),
      marcas: marcasResueltas,
      mesAnterior: { ...cobAnt, pagado: cobAnt.estado === "pagado" },
      mesActual: { ...cobAct, pagado: cobAct.estado === "pagado" },
      // Los 3 más recientes, para que la tarjeta muestre QUÉ se pagó y no solo
      // el estado del mes ("1–15 jul 2026 · 16–31 jul 2026 · jun 2026").
      ultimosPeriodos: periodos.slice(-3).reverse().map(etiquetaPeriodoCorta),
      // Ya está calculado y deduplicado acá: el aviso previo a eliminar no
      // necesita una consulta aparte para decir "tiene N pagos registrados".
      pagosRegistrados: periodos.length,
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

/**
 * Cuántas FILAS de mk_facturas apuntan a esta impulsadora — anuladas incluidas.
 * Es lo que decide borrar contra ocultar, y por eso cuenta filas y no pagos:
 * la FK `mk_facturas.impulsadora_id → mk_impulsadoras(id)` no distingue una
 * factura anulada de una vigente, así que un DELETE reventaría igual. Contar
 * pagos "de verdad" acá dejaría pasar un borrado que la base va a rechazar.
 */
async function contarFacturasImpulsadora(id: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("mk_facturas")
    .select("id", { count: "exact", head: true })
    .eq("impulsadora_id", id);
  if (error) throw new Error(`contarFacturasImpulsadora: ${error.message}`);
  // FAIL-CERRADO: sin un número confiable NO se borra. Un count nulo tratado
  // como 0 sería "borrá igual" sobre plata ya registrada.
  if (typeof count !== "number") {
    throw new Error("No se pudo verificar si tiene pagos registrados");
  }
  return count;
}

/**
 * Pagos que una persona contaría: períodos distintos, sin anulados. Un pago
 * repartido en 3 marcas son 3 filas de mk_facturas pero UN pago, y decirle a
 * Daniel "tiene 3 pagos" cuando hizo uno solo sería mentirle.
 */
async function contarPagosImpulsadora(id: string): Promise<number> {
  const periodos = await cargarPeriodosPagados([id]);
  return (periodos.get(id) ?? []).length;
}

/**
 * Elimina una impulsadora. DOS desenlaces, y los dos son legítimos:
 *
 *   - SIN gastos registrados → DELETE real. La fila se va y `mk_impulsadora_marcas`
 *     se va con ella por el ON DELETE CASCADE del split. No hay historial que
 *     perder: es el caso de la impulsadora que se cargó por error.
 *   - CON gastos registrados → `activa = false` (queda oculta). Borrarla de
 *     verdad se llevaría el historial de gastos y descuadraría los reportes por
 *     marca y los totales del año; la FK de `mk_facturas.impulsadora_id` lo
 *     rechazaría igual, así que el UPDATE no es un rodeo, es la única salida
 *     correcta.
 *
 * Se usa `activa` y NO una columna `deleted` nueva a propósito: la columna ya
 * existe desde la migración original, ya significa exactamente esto, y sumarle
 * un segundo flag para lo mismo dejaría dos fuentes de verdad (y otra DDL
 * pendiente de correr a mano).
 */
export async function eliminarImpulsadora(
  id: string,
): Promise<ResultadoEliminarImpulsadora> {
  if (!id) throw new Error("id requerido");

  const { data, error } = await supabaseServer
    .from("mk_impulsadoras")
    .select("id, nombre")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`eliminarImpulsadora[leer]: ${error.message}`);
  if (!data) throw new Error("La impulsadora no existe");
  const nombre = String((data as { nombre: string }).nombre);

  if ((await contarFacturasImpulsadora(id)) > 0) {
    const { error: errOcultar } = await supabaseServer
      .from("mk_impulsadoras")
      .update({ activa: false })
      .eq("id", id);
    if (errOcultar) {
      throw new Error(`eliminarImpulsadora[ocultar]: ${errOcultar.message}`);
    }
    return { accion: "ocultada", nombre, pagos: await contarPagosImpulsadora(id) };
  }

  const { error: errBorrar } = await supabaseServer
    .from("mk_impulsadoras")
    .delete()
    .eq("id", id);
  if (errBorrar) {
    throw new Error(`eliminarImpulsadora[borrar]: ${errBorrar.message}`);
  }
  return { accion: "eliminada", nombre };
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
 * Registra un pago de impulsadora por PERÍODO TRABAJADO (quincena, mes o un
 * solo día). Crea UNA factura por marca (proyecto_id NULL, impulsadora_id set,
 * estado Pagado) con su porción del monto, su marca al 100% en
 * mk_factura_marcas, y el comprobante adjunto.
 * El comprobante es OBLIGATORIO: sin `path` lanza error (validación server-side).
 *
 * Anti-duplicado: rechaza si el período SE SOLAPA con un pago vigente de la
 * misma impulsadora (pagar dos veces los mismos días). Dos quincenas del mismo
 * mes conviven sin problema porque no comparten ningún día.
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

  const desde = normalizarTexto(input.desde ?? "").slice(0, 10);
  const hasta = normalizarTexto(input.hasta ?? "").slice(0, 10);
  const errPeriodo = validarPeriodo(desde, hasta);
  if (errPeriodo) throw new Error(errPeriodo);
  const periodo: Periodo = { desde, hasta };
  // impulsadora_mes sigue siendo el mes del INICIO del período: los reportes
  // por año y el orden del ZIP siguen leyendo esta columna sin cambios.
  const mesISO = mesDeFecha(desde);

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

  // Anti-duplicado por SOLAPAMIENTO de días (antes era "un pago por mes", que
  // bloqueaba la 2ª quincena). Se compara contra el período efectivo de cada
  // pago vigente, así los pagos mensuales viejos también protegen.
  const yaPagados = (await cargarPeriodosPagados([impulsadoraId])).get(impulsadoraId) ?? [];
  const choque = yaPagados.find((p) => seSolapan(p, periodo));
  if (choque) {
    throw new Error(
      `Ya hay un pago registrado que cubre esos días (${etiquetaPeriodo(choque)}). Elegí otras fechas.`,
    );
  }

  // Mes completo → "Impulsadora Ana — Julio 2026" (texto idéntico al de los
  // pagos mensuales de antes). Quincena → "… — 1–15 de julio 2026".
  const concepto = `Impulsadora ${nombreImpulsadora} — ${etiquetaPeriodo(periodo)}`;
  // El número lleva el día de inicio: con dos quincenas en un mes, "IMP-2026-07"
  // se repetiría en las dos.
  const numeroFactura = `IMP-${desde}`;
  // hoyPanama(), NO toISOString(): después de las 19:00 de Panamá el ISO en UTC
  // ya es el día siguiente y el gasto quedaría fechado mañana.
  const fechaFactura = hoyPanama();
  const porciones = repartirMonto(monto, split);

  // Pre-migración 20260727140000 el rango no se puede guardar: el pago igual se
  // registra (con impulsadora_mes, como siempre) en vez de reventar. El
  // concepto ya lleva el período escrito, así que el dato no se pierde.
  const guardarPeriodo = await hayColumnasPeriodo();
  const colsPeriodo = guardarPeriodo
    ? { periodo_desde: desde, periodo_hasta: hasta }
    : {};

  const creadas: string[] = [];
  try {
    for (const p of porciones) {
      const { data: facData, error: facErr } = await supabaseServer
        .from("mk_facturas")
        .insert({
          proyecto_id: null,
          impulsadora_id: impulsadoraId,
          impulsadora_mes: mesISO,
          ...colsPeriodo,
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
