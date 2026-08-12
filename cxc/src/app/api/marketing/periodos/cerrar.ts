// ============================================================================
// Marketing — CERRAR UN PERÍODO, la operación, una sola vez.
//
// 🔑 Vive acá y no dentro del route porque hay DOS puertas que hacen exactamente
// lo mismo: cerrar UNA marca (`[id]/cerrar`) y cerrar las TRES de un grupo
// (`cerrar-grupo`, que llama a ésta tres veces seguidas). Daniel, textual:
// *"cada marca tiene su encargado"* — el botón "Cerrar las tres" es una
// comodidad de calendario, **no** un cierre conjunto.
//
// 🩸 Si la lógica se duplicara, el día que cambie una regla del cierre habría
// dos cierres distintos según qué botón se apretó, y el reporte de Calvin no
// se parecería al de Tommy sin que nadie sepa por qué.
// ============================================================================

import {
  abrirPeriodo,
  cerrarPeriodo,
  contarAbiertos,
  getPeriodo,
  reabrirPeriodo,
  sellarDocumento,
  type PeriodoFila,
} from "@/lib/marketing/periodos-io";
import {
  armarReportePeriodo,
  cargarDatosPeriodos,
  type DatosPeriodos,
} from "@/lib/marketing/periodos-reporte";
import { nombreDeBloque } from "@/lib/marketing/bloques";

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
 *
 * `datos` se puede pasar ya cargado (lo hace el cierre de grupo, que además lo
 * RECARGA entre marca y marca: el cierre anterior movió sellos y leer una foto
 * vieja le metería a Calvin los documentos que Tommy acaba de reportar).
 */
export async function cerrarPeriodoDeMarca(args: {
  periodoId: string;
  nombreSiguiente: string;
  cerradoPor: string;
  datos?: DatosPeriodos;
}): Promise<ResultadoCierre> {
  const { periodoId, nombreSiguiente, cerradoPor } = args;

  // ---- 1. Validar ---------------------------------------------------------
  const periodo: PeriodoFila | null = await getPeriodo(periodoId);
  if (!periodo) throw new ErrorDeCierre(404, "Ese período no existe.");
  if (periodo.estado !== "abierto") {
    throw new ErrorDeCierre(400, "Este período ya está cerrado.");
  }

  // ---- 2. Reporte ---------------------------------------------------------
  const datos = args.datos ?? (await cargarDatosPeriodos());
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
      "El período se cerró pero quedó algo raro con el nuevo. Revisá la lista de períodos antes de seguir.",
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
    throw new ErrorDeCierre(400, "Escribí cómo se va a llamar el próximo período.");
  }
  if (nombre.length > 120) {
    throw new ErrorDeCierre(400, "El nombre es muy largo. Usá menos de 120 letras.");
  }
  return nombre;
}
