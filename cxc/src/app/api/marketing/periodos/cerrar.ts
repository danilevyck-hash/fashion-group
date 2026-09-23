// ============================================================================
// Marketing — CERRAR UN PERÍODO, la operación, una sola vez.
//
// 🔑 La única puerta es `[id]/cerrar`: cada marca se cierra SOLA. El cierre en
// grupo (`cerrar-grupo`, "Cerrar las tres") se retiró el 11-ago-2026 — Daniel,
// textual: *"que sea por separado mejor no?"*. La operación sigue viviendo acá
// y no dentro del route para que cualquier puerta futura reuse EL MISMO cierre.
//
// 🩸 Si la lógica se duplicara, el día que cambie una regla del cierre habría
// dos cierres distintos según qué botón se apretó, y el reporte de Calvin no
// se parecería al de Tommy sin que nadie sepa por qué.
//
// 🔴 DOS CIERRES, UN INTERRUPTOR (rediseño, 22-sep-2026):
//   · `cerrarPeriodoRediseno` — con `MARKETING_PORTADA_REDISENO` prendido.
//     Daniel: *«no quiero pipeline, cuando lo cierro es porque lo cobré»*.
//     Pide el NOMBRE con el que se cierra (obligatorio) y la nota de crédito
//     como TEXTO (opcional, sin cálculo), sella lo que pertenece al período,
//     escribe el cierre por `armarCierre` y abre el siguiente con
//     `abrirSiguiente` (nombre «Desde el …», con el hoy de PANAMÁ). 🔴 NO
//     GENERA NI GUARDA REPORTE: `mk_periodos.reporte` queda como estaba. El
//     ZIP se baja cuando se quiera desde el período (pieza D).
//   · `cerrarPeriodoDeMarca` — el de antes, intacto, para el interruptor en
//     `false`. Los cierres viejos (con `reporte` congelado) no se tocan.
// ============================================================================

import { hoyPanama } from "@/lib/fecha-panama";
import {
  abrirPeriodo,
  abrirPeriodoSiguiente,
  cerrarPeriodo,
  cerrarPeriodoConNombre,
  contarAbiertos,
  getPeriodo,
  reabrirPeriodo,
  sellarDocumento,
  type PeriodoFila,
} from "@/lib/marketing/periodos-io";
import {
  agregar,
  armarReportePeriodo,
  cargarDatosPeriodos,
  documentosDelPeriodoAbierto,
  type DocumentosDelReporte,
} from "@/lib/marketing/periodos-reporte";
import { nombreDeBloque } from "@/lib/marketing/bloques";
import {
  MSG_FALTA_NOMBRE,
  abrirSiguiente,
  armarCierre,
  puedeCerrar,
} from "@/lib/marketing/periodo-estado";

export const MSG_SIN_TABLAS =
  "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.";

/** Lo que la UI necesita para ofrecer el ZIP de la marca recién cerrada. */
export interface ZipDelCierre {
  marcaCodigo: string;
  marcaNombre: string;
  periodoId: string;
  periodoNombre: string;
}

export interface ResultadoCierre {
  cerrado: {
    id: string;
    nombre: string;
    marcaCodigo: string;
    marcaNombre: string;
    totales: {
      facturas: { count: number; total: number };
      muebles: { count: number; total: number };
      total: number;
      proyectos: number;
    };
  };
  siguiente: { id: string; nombre: string };
  zip: ZipDelCierre;
}

/** Falla esperada del cierre, con el código HTTP que le corresponde. */
export class ErrorDeCierre extends Error {
  readonly status: number;
  readonly extra?: Record<string, unknown>;
  constructor(status: number, mensaje: string, extra?: Record<string, unknown>) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Cierra el período abierto de UNA marca y abre el siguiente en cero.
 *
 * El orden no es negociable:
 *   1. validar (existe, está abierto, el nombre del próximo no viene vacío)
 *   2. generar el reporte con SOLO la parte de esa marca
 *   3. sellar lo que entró y todavía no tenía sello
 *   4. cerrar (estado, cuándo y quién) guardando el reporte tal como salió
 *   5. abrir el siguiente en cero
 *
 * 🩸 4 y 5 tienen que quedar consistentes. El índice único
 * `mk_periodos_uno_abierto_por_proveedor` protege de dejar DOS abiertos, pero
 * no de dejar CERO — y cero abiertos deja a la marca sin dónde registrar el
 * próximo gasto, que es peor que no haber cerrado. Por eso, si el paso 5 falla,
 * el 4 se revierte; y al final se verifica que quedó exactamente uno.
 */
export async function cerrarPeriodoDeMarca(args: {
  periodoId: string;
  nombreSiguiente: string;
  cerradoPor: string;
}): Promise<ResultadoCierre> {
  const { periodoId, nombreSiguiente, cerradoPor } = args;

  // ---- 1. Validar ---------------------------------------------------------
  const periodo: PeriodoFila | null = await getPeriodo(periodoId);
  if (!periodo) throw new ErrorDeCierre(404, "Ese período no existe.");
  if (periodo.estado !== "abierto") {
    throw new ErrorDeCierre(400, "Este período ya está cerrado.");
  }

  // ---- 2. Reporte ---------------------------------------------------------
  const datos = await cargarDatosPeriodos();
  if (!datos.hayTablas) throw new ErrorDeCierre(409, MSG_SIN_TABLAS);

  const marcaCodigo = String(periodo.proveedor_key);
  const marcaNombre = nombreDeBloque(marcaCodigo, datos.marcas);
  const { reporte, documentos } = armarReportePeriodo(datos, {
    id: periodo.id,
    proveedor_key: marcaCodigo,
    nombre: periodo.nombre,
  });

  // ---- 3. Sellar lo que entró en el reporte y todavía no tenía sello -------
  //
  // Un documento sin sello se lee como "del período actual". Si se queda sin
  // sellar, después de cerrar volvería a aparecer en el período NUEVO — o sea,
  // ya reportado y contándose otra vez. Se sella ANTES de cerrar, porque
  // `sellarDocumento` ata al período ABIERTO, que en este instante es
  // justamente el que se está por cerrar. Es best-effort: nunca lanza, y un
  // documento ya sellado no se mueve (ON CONFLICT DO NOTHING).
  for (const facturaId of documentos.facturas) {
    await sellarDocumento({
      tipo: "factura",
      documentoId: facturaId,
      marcaKeys: [marcaCodigo],
    });
  }
  for (const entregaId of documentos.entregas) {
    await sellarDocumento({
      tipo: "entrega",
      documentoId: entregaId,
      marcaKeys: [marcaCodigo],
    });
  }

  // ---- 4. Cerrar ----------------------------------------------------------
  await cerrarPeriodo(periodo.id, reporte, cerradoPor);

  // ---- 5. Abrir el siguiente en cero --------------------------------------
  let siguienteId: string;
  try {
    const nuevo = await abrirPeriodo(marcaCodigo, nombreSiguiente);
    siguienteId = nuevo.id;
  } catch (errAbrir) {
    // Revertir el cierre: dejar a la marca sin período abierto la dejaría sin
    // poder registrar un gasto nuevo.
    try {
      await reabrirPeriodo(periodo.id);
    } catch (errRevertir) {
      console.error(
        "cerrarPeriodoDeMarca: no se pudo revertir el cierre:",
        errRevertir instanceof Error ? errRevertir.message : errRevertir,
      );
    }
    console.error(
      "cerrarPeriodoDeMarca[abrir siguiente]:",
      errAbrir instanceof Error ? errAbrir.message : errAbrir,
    );
    throw new ErrorDeCierre(
      500,
      "No se pudo abrir el período nuevo, así que no se cerró nada. Intenta de nuevo.",
    );
  }

  // ---- Verificación final: exactamente UN período abierto -----------------
  const abiertos = await contarAbiertos(marcaCodigo);
  if (abiertos !== 1) {
    console.error(
      `cerrarPeriodoDeMarca[verificación]: ${marcaCodigo} quedó con ${abiertos} períodos abiertos`,
    );
    throw new ErrorDeCierre(
      500,
      "El período se cerró pero quedó algo raro con el nuevo. Revisa la lista de períodos antes de seguir.",
      { periodoCerrado: periodo.id, periodoNuevo: siguienteId, abiertos },
    );
  }

  return {
    cerrado: {
      id: periodo.id,
      nombre: periodo.nombre,
      marcaCodigo,
      marcaNombre,
      totales: reporte.totales,
    },
    siguiente: { id: siguienteId, nombre: nombreSiguiente },
    // El ZIP se ofrece SIEMPRE, aunque el período haya cerrado en cero: es la
    // forma de bajar lo que se acaba de reportar, y si está vacío el ZIP lo
    // dice mejor que un botón ausente.
    zip: {
      marcaCodigo,
      marcaNombre,
      periodoId: periodo.id,
      periodoNombre: periodo.nombre,
    },
  };
}

/** El nombre del próximo período, validado. Lanza `ErrorDeCierre` si no sirve. */
export function validarNombreSiguiente(valor: unknown): string {
  const nombre = typeof valor === "string" ? valor.trim() : "";
  if (!nombre) {
    throw new ErrorDeCierre(400, "Escribe cómo se va a llamar el próximo período.");
  }
  if (nombre.length > 120) {
    throw new ErrorDeCierre(400, "El nombre es muy largo. Usa menos de 120 letras.");
  }
  return nombre;
}

// ────────────────────────────────────────────────────────────────────────────
// EL CIERRE DEL REDISEÑO (22-sep-2026)
// ────────────────────────────────────────────────────────────────────────────

/** Lo que devuelve el cierre nuevo. Sin `zip`: cerrar no genera nada. */
export interface ResultadoCierreRediseno {
  cerrado: {
    id: string;
    /** El nombre que se le puso al cerrar. */
    nombre: string;
    marcaCodigo: string;
    marcaNombre: string;
    notaCredito: string | null;
    /** Lo que quedó reportado y lo apagado, del MISMO agregador de la portada. */
    totales: { reportado: number; noReportado: number; gastos: number };
  };
  siguiente: { id: string; nombre: string };
}

/** Sella lo que pertenece al período ANTES de cerrarlo (best-effort, nunca lanza). */
async function sellarLoQuePertenece(
  marcaCodigo: string,
  documentos: DocumentosDelReporte,
): Promise<void> {
  for (const facturaId of documentos.facturas) {
    await sellarDocumento({ tipo: "factura", documentoId: facturaId, marcaKeys: [marcaCodigo] });
  }
  for (const entregaId of documentos.entregas) {
    await sellarDocumento({ tipo: "entrega", documentoId: entregaId, marcaKeys: [marcaCodigo] });
  }
}

/** El nombre con el que se cierra, validado. Lanza `ErrorDeCierre` si no sirve. */
export function validarNombreAlCerrar(valor: unknown): string {
  const nombre = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
  if (!nombre) throw new ErrorDeCierre(400, MSG_FALTA_NOMBRE);
  if (nombre.length > 120) {
    throw new ErrorDeCierre(400, "El nombre es muy largo. Usa menos de 120 letras.");
  }
  return nombre;
}

/** La nota de crédito, TEXTO recortado o `null`. Acá no hay ningún número. */
export function validarNotaCredito(valor: unknown): string | null {
  const nota = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
  if (nota.length > 300) {
    throw new ErrorDeCierre(400, "La nota de crédito es muy larga. Usa menos de 300 letras.");
  }
  return nota.length > 0 ? nota : null;
}

/**
 * Cierra el período abierto de UNA marca con el nombre que Daniel escribió y
 * abre el siguiente solo. El orden:
 *   1. validar (existe, está abierto, el nombre no viene vacío)
 *   2. sellar lo que pertenece al período (los apagados también: el sello
 *      dice a qué período va el gasto, no si se reporta)
 *   3. cerrar (estado, cuándo, quién, nombre, nota) — SIN reporte
 *   4. abrir el siguiente con `abrirSiguiente` (hoy de Panamá)
 * Si el 4 falla, el 3 se revierte; al final quedó exactamente UN abierto.
 */
export async function cerrarPeriodoRediseno(args: {
  periodoId: string;
  nombreAlCerrar: string;
  notaCredito: string | null;
  cerradoPor: string;
  /** Solo para las pruebas: el instante y el «hoy». */
  ahoraISO?: string;
  hoy?: string;
}): Promise<ResultadoCierreRediseno> {
  const ahoraISO = args.ahoraISO ?? new Date().toISOString();
  const hoy = args.hoy ?? hoyPanama();

  // ---- 1. Validar ---------------------------------------------------------
  const periodo: PeriodoFila | null = await getPeriodo(args.periodoId);
  if (!periodo) throw new ErrorDeCierre(404, "Ese período no existe.");
  if (!puedeCerrar(periodo.estado)) {
    throw new ErrorDeCierre(400, "Este período ya está cerrado.");
  }
  let patch;
  try {
    patch = armarCierre(periodo, {
      nombreAlCerrar: args.nombreAlCerrar,
      notaCredito: args.notaCredito,
      cerradoPor: args.cerradoPor,
      ahoraISO,
    });
  } catch (err) {
    throw new ErrorDeCierre(400, err instanceof Error ? err.message : MSG_FALTA_NOMBRE);
  }

  // ---- 2. Sellar ----------------------------------------------------------
  const datos = await cargarDatosPeriodos();
  if (!datos.hayTablas) throw new ErrorDeCierre(409, MSG_SIN_TABLAS);
  const marcaCodigo = String(periodo.proveedor_key);
  const marcaNombre = nombreDeBloque(marcaCodigo, datos.marcas);
  const fila = { id: periodo.id, proveedor_key: marcaCodigo, nombre: periodo.nombre };
  await sellarLoQuePertenece(marcaCodigo, documentosDelPeriodoAbierto(datos, fila));
  // Los totales para decirlos: los del MISMO agregador que dibuja la portada.
  const bloque = agregar(datos).bloques.find((b) => b.key === marcaCodigo);
  const totales = {
    reportado: bloque?.total ?? 0,
    noReportado: bloque?.noReportado.total ?? 0,
    gastos: (bloque?.facturas.count ?? 0) + (bloque?.muebles.count ?? 0),
  };

  // ---- 3. Cerrar, sin reporte --------------------------------------------
  await cerrarPeriodoConNombre(periodo.id, patch);

  // ---- 4. Abrir el siguiente solo ----------------------------------------
  const siguiente = abrirSiguiente({ marcaCodigo, hoyPanama: hoy, ahoraISO });
  let siguienteId: string;
  try {
    siguienteId = (await abrirPeriodoSiguiente(siguiente)).id;
  } catch (errAbrir) {
    try {
      await reabrirPeriodo(periodo.id);
    } catch (errRevertir) {
      console.error(
        "cerrarPeriodoRediseno: no se pudo revertir el cierre:",
        errRevertir instanceof Error ? errRevertir.message : errRevertir,
      );
    }
    console.error(
      "cerrarPeriodoRediseno[abrir siguiente]:",
      errAbrir instanceof Error ? errAbrir.message : errAbrir,
    );
    throw new ErrorDeCierre(
      500,
      "No se pudo abrir el período nuevo, así que no se cerró nada. Intenta de nuevo.",
    );
  }

  const abiertos = await contarAbiertos(marcaCodigo);
  if (abiertos !== 1) {
    console.error(
      `cerrarPeriodoRediseno[verificación]: ${marcaCodigo} quedó con ${abiertos} períodos abiertos`,
    );
    throw new ErrorDeCierre(
      500,
      "El período se cerró pero quedó algo raro con el nuevo. Revisa la lista de períodos antes de seguir.",
      { periodoCerrado: periodo.id, periodoNuevo: siguienteId, abiertos },
    );
  }

  return {
    cerrado: {
      id: periodo.id,
      nombre: patch.nombre_al_cerrar,
      marcaCodigo,
      marcaNombre,
      notaCredito: patch.nota_credito,
      totales,
    },
    siguiente: { id: siguienteId, nombre: siguiente.nombre },
  };
}
