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
import { bloquePorMarcaId, sellarDocumento } from "./periodos-io";
import { esMarcaCodigo } from "./bloques";
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
): Promise<{ facturasCreadas: number; fotoGuardada: boolean | null }> {
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
  // Qué marca le tocó a cada factura creada, para sellarla al final. Se anota
  // acá y NO se sella dentro del try: si una porción falla, el rollback borra
  // las facturas y no queda ni un sello apuntando a algo que ya no existe.
  const paraSellar: Array<{ facturaId: string; marcaId: string }> = [];
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
      paraSellar.push({ facturaId, marcaId: p.marca_id });

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

  // El pago de una impulsadora es una factura por marca, así que se sella igual
  // que cualquier otro gasto: con el período que esa MARCA tenía ABIERTO
  // hoy, no con el mes trabajado. Una quincena de junio cargada en agosto entra
  // en el período abierto y se reporta en el próximo corte.
  //
  // Nunca es fatal: si el sello falla, el pago ya está guardado y el gasto se
  // ve como del período actual — que es el default correcto.
  const bloqueDeMarca = await bloquePorMarcaId(paraSellar.map((s) => s.marcaId));
  for (const s of paraSellar) {
    const key = bloqueDeMarca.get(s.marcaId);
    if (!key || !esMarcaCodigo(key)) continue;
    await sellarDocumento({
      tipo: "factura",
      documentoId: s.facturaId,
      marcaKeys: [key],
    });
  }

  // Foto OPCIONAL del pago (un evento, una activación). Se cuelga de CADA
  // factura creada: un pago repartido en 2 marcas son 2 facturas, y el ZIP de
  // cada marca tiene que traer la foto — el encargado de una no ve la de la
  // otra.
  //
  // 🩸 NUNCA es fatal, y por dos razones distintas:
  //   1. El pago YA está guardado; tumbar el request por la foto le diría a la
  //      secretaria "no se guardó" sobre un pago que sí se guardó.
  //   2. Pre-DDL, `mk_adjuntos` todavía no acepta `foto_instalacion` (el CHECK
  //      viejo la rechaza). El pago sale igual, y `fotoGuardada: false` le da
  //      a la pantalla la manera de DECIRLO — una foto que se pierde en
  //      silencio es peor que una que avisa que no entró.
  // `fotoGuardada: null` = no venía foto (no hay nada que reportar).
  let fotoGuardada: boolean | null = null;
  const fotoPath = normalizarTexto(input.foto?.path ?? "");
  if (fotoPath) {
    const filas = creadas.map((facturaId) => ({
      proyecto_id: null,
      factura_id: facturaId,
      tipo: "foto_instalacion",
      url: fotoPath,
      nombre_original: input.foto?.nombreOriginal
        ? normalizarTexto(input.foto.nombreOriginal)
        : null,
      size_bytes: input.foto?.sizeBytes ?? null,
    }));
    const { error: fotoErr } = await supabaseServer.from("mk_adjuntos").insert(filas);
    fotoGuardada = !fotoErr;
    if (fotoErr) {
      console.error(`registrarPagoImpulsadora[foto]: ${fotoErr.message}`);
    }
  }

  return { facturasCreadas: creadas.length, fotoGuardada };
}

// ─────────────────────────────────────────────────────────────────────────────
//   HISTORIAL · ANULAR · EDITAR FICHA  (3-ago-2026)
//
// 🩸 POR QUÉ. Daniel: *"en impulsadoras, no puedo ver el historial ni nada, solo
// me deja ingresar gastos… quiero ver y editar el historial"*. El módulo era de
// SOLO ESCRITURA: se podía crear y pagar, pero no revisar ni corregir. La
// tarjeta enseñaba los últimos 3 períodos como texto y nada más, aunque en la
// base ya había pagos guardados desde abril-2024. Tampoco se podía editar la
// ficha: subirle el sueldo a alguien exigía borrarla y crearla de nuevo.
//
// ⚠️ NO SE BORRA UN PAGO, SE ANULA. Los pagos alimentan el reporte por marca,
// la card de marca y el Excel de gastos — los tres filtran por `anulado_en`
// (verificado uno por uno). Anular los saca de TODOS esos números y deja
// rastro; borrar perdería la evidencia de que el gasto existió.
// ─────────────────────────────────────────────────────────────────────────────

/** Una marca dentro de un pago, con la porción que le tocó. */
export interface PagoMarca {
  marcaId: string;
  marca: string;
  monto: number;
}

/** Un pago = las N facturas (una por marca) que comparten `numero_factura`. */
export interface PagoHistorial {
  /** Llave del pago: el `numero_factura` que comparten sus filas. */
  ref: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  /** Día 1 del mes imputado. Es lo único que existe en los pagos viejos. */
  mes: string | null;
  concepto: string;
  fechaRegistro: string | null;
  total: number;
  marcas: PagoMarca[];
  anulado: boolean;
  anuladoMotivo: string | null;
  anuladoEn: string | null;
  /** Path en Storage del comprobante (se firma al servir). */
  comprobantePath: string | null;
  /** Cuántas filas de mk_facturas componen el pago (una por marca). */
  filas: number;
}

interface FilaHistorial {
  id: string;
  numero_factura: string | null;
  impulsadora_mes: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  concepto: string | null;
  fecha_factura: string | null;
  created_at: string | null;
  total: number | string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
}

/**
 * TODO el historial de pagos de una impulsadora, del más nuevo al más viejo,
 * incluidos los ANULADOS (se marcan; esconderlos sería esconder justamente lo
 * que alguien vino a auditar).
 */
export async function historialPagosImpulsadora(
  impulsadoraId: string,
): Promise<PagoHistorial[]> {
  if (!impulsadoraId) throw new Error("impulsadoraId requerido");

  const conPeriodo = await hayColumnasPeriodo();
  const cols =
    "id, numero_factura, impulsadora_mes, concepto, fecha_factura, created_at, total, anulado_en, anulado_motivo" +
    (conPeriodo ? ", periodo_desde, periodo_hasta" : "");

  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select(cols)
    .eq("impulsadora_id", impulsadoraId)
    .order("impulsadora_mes", { ascending: false });
  if (error) throw new Error(`historialPagos: ${error.message}`);

  const filas = (data ?? []) as unknown as FilaHistorial[];
  if (filas.length === 0) return [];

  // Marcas y comprobantes de todas las filas, en 2 consultas (no una por fila).
  const ids = filas.map((f) => String(f.id));
  const [marcasRes, adjRes, catalogo] = await Promise.all([
    supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id").in("factura_id", ids),
    supabaseServer.from("mk_adjuntos").select("factura_id, url").in("factura_id", ids),
    getMarcas(),
  ]);
  if (marcasRes.error) throw new Error(`historialPagos[marcas]: ${marcasRes.error.message}`);
  if (adjRes.error) throw new Error(`historialPagos[adjuntos]: ${adjRes.error.message}`);

  const nombreMarca = new Map(
    (catalogo ?? []).map((m: { id: string; nombre: string }) => [String(m.id), m.nombre]),
  );
  const marcaDeFactura = new Map<string, string>();
  for (const r of (marcasRes.data ?? []) as Array<{ factura_id: string; marca_id: string }>) {
    marcaDeFactura.set(String(r.factura_id), String(r.marca_id));
  }
  const adjuntoDeFactura = new Map<string, string>();
  for (const r of (adjRes.data ?? []) as Array<{ factura_id: string; url: string | null }>) {
    if (r.url && !adjuntoDeFactura.has(String(r.factura_id))) {
      adjuntoDeFactura.set(String(r.factura_id), r.url);
    }
  }

  // Agrupar por `numero_factura`. Si faltara (dato viejo), la fila es su propio
  // pago: mejor mostrarla suelta que perderla al agrupar por una llave vacía.
  const porRef = new Map<string, PagoHistorial>();
  for (const f of filas) {
    const ref = (f.numero_factura ?? "").trim() || `fila:${f.id}`;
    const monto = Number(f.total ?? 0);
    const marcaId = marcaDeFactura.get(String(f.id)) ?? "";
    let pago = porRef.get(ref);
    if (!pago) {
      pago = {
        ref,
        periodoDesde: f.periodo_desde ?? null,
        periodoHasta: f.periodo_hasta ?? null,
        mes: f.impulsadora_mes ?? null,
        concepto: f.concepto ?? "",
        fechaRegistro: f.fecha_factura ?? (f.created_at ? f.created_at.slice(0, 10) : null),
        total: 0,
        marcas: [],
        // Un pago cuenta como anulado solo si TODAS sus filas lo están: si
        // quedara una viva, el gasto sigue impactando los reportes y decir
        // "anulado" sería mentira.
        anulado: true,
        anuladoMotivo: f.anulado_motivo ?? null,
        anuladoEn: f.anulado_en ?? null,
        comprobantePath: adjuntoDeFactura.get(String(f.id)) ?? null,
        filas: 0,
      };
      porRef.set(ref, pago);
    }
    pago.total = round2(pago.total + monto);
    pago.filas += 1;
    if (!f.anulado_en) pago.anulado = false;
    if (f.anulado_en && !pago.anuladoEn) {
      pago.anuladoEn = f.anulado_en;
      pago.anuladoMotivo = f.anulado_motivo ?? null;
    }
    if (!pago.comprobantePath) {
      pago.comprobantePath = adjuntoDeFactura.get(String(f.id)) ?? null;
    }
    if (marcaId) {
      pago.marcas.push({
        marcaId,
        marca: nombreMarca.get(marcaId) ?? "—",
        monto: round2(monto),
      });
    }
  }

  return Array.from(porRef.values()).sort((a, b) => {
    const ka = a.periodoDesde ?? a.mes ?? "";
    const kb = b.periodoDesde ?? b.mes ?? "";
    return kb.localeCompare(ka);
  });
}

/**
 * Anula un pago entero (todas sus filas). Idempotente: volver a anular no
 * cambia nada y no es un error.
 *
 * Los tres consumidores —reporte por marca, card de marca y Excel— filtran por
 * `anulado_en`, así que esto lo saca de TODOS los totales sin borrar evidencia.
 */
export async function anularPagoImpulsadora(
  impulsadoraId: string,
  ref: string,
  motivo: string,
): Promise<{ filasAnuladas: number }> {
  if (!impulsadoraId) throw new Error("impulsadoraId requerido");
  const referencia = (ref ?? "").trim();
  if (!referencia) throw new Error("Falta indicar cuál pago anular");
  const razon = normalizarTexto(motivo ?? "").trim();
  if (!razon) throw new Error("Escribe por qué se anula el pago");

  // `impulsadora_id` va en el WHERE además de la ref: sin él, una referencia de
  // otra impulsadora anularía pagos ajenos.
  let q = supabaseServer
    .from("mk_facturas")
    .update({ anulado_en: new Date().toISOString(), anulado_motivo: razon })
    .eq("impulsadora_id", impulsadoraId)
    .is("anulado_en", null);
  q = referencia.startsWith("fila:")
    ? q.eq("id", referencia.slice(5))
    : q.eq("numero_factura", referencia);

  const { data, error } = await q.select("id");
  if (error) throw new Error(`anularPago: ${error.message}`);
  return { filasAnuladas: (data ?? []).length };
}

export interface ActualizarImpulsadoraInput {
  nombre?: string;
  montoMensual?: number;
  marcas?: Array<{ marcaId: string; porcentaje: number }>;
}

/**
 * Edita la ficha: nombre, monto mensual y/o reparto de marcas.
 *
 * ⚠️ NO toca los pagos ya registrados, y es a propósito: un pago es lo que se
 * pagó ese mes con el reparto vigente entonces. Recalcularlo hacia atrás
 * reescribiría gastos ya cerrados y movería los reportes de meses pasados.
 * Subir el sueldo aplica del PRÓXIMO pago en adelante.
 */
export async function actualizarImpulsadora(
  impulsadoraId: string,
  input: ActualizarImpulsadoraInput,
): Promise<MkImpulsadora> {
  if (!impulsadoraId) throw new Error("impulsadoraId requerido");

  const patch: Record<string, unknown> = {};
  if (input.nombre !== undefined) {
    const nombre = tituloCase(input.nombre ?? "");
    if (!nombre) throw new Error("El nombre es obligatorio");
    patch.nombre = nombre;
  }
  if (input.montoMensual !== undefined) {
    const monto = round2(Number(input.montoMensual));
    if (!Number.isFinite(monto) || monto < 0) throw new Error("Monto mensual inválido");
    patch.monto_mensual = monto;
  }
  if (input.marcas !== undefined) validarSplit(input.marcas);

  if (Object.keys(patch).length === 0 && input.marcas === undefined) {
    throw new Error("No hay nada que cambiar");
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseServer
      .from("mk_impulsadoras")
      .update(patch)
      .eq("id", impulsadoraId);
    if (error) throw new Error(`actualizarImpulsadora: ${error.message}`);
  }

  if (input.marcas !== undefined) {
    // Se reemplaza el split entero. El borrado va PRIMERO y el insert después:
    // si el insert falla, el error sube y la ficha queda sin split — mejor un
    // error visible que un reparto a medias que dispersaría plata en silencio.
    const { error: errDel } = await supabaseServer
      .from("mk_impulsadora_marcas")
      .delete()
      .eq("impulsadora_id", impulsadoraId);
    if (errDel) throw new Error(`actualizarImpulsadora[marcas]: ${errDel.message}`);
    const filas = input.marcas.map((m) => ({
      impulsadora_id: impulsadoraId,
      marca_id: m.marcaId,
      porcentaje: round2(Number(m.porcentaje)),
    }));
    const { error: errIns } = await supabaseServer
      .from("mk_impulsadora_marcas")
      .insert(filas);
    if (errIns) throw new Error(`actualizarImpulsadora[marcas]: ${errIns.message}`);
  }

  const { data, error } = await supabaseServer
    .from("mk_impulsadoras")
    .select("*")
    .eq("id", impulsadoraId)
    .single();
  if (error || !data) throw new Error(`actualizarImpulsadora: ${error?.message ?? "sin datos"}`);
  const imp = data as MkImpulsadora;
  return { ...imp, monto_mensual: Number(imp.monto_mensual) };
}
