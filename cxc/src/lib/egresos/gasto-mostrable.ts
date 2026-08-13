/**
 * ¿El gasto de EGRESOS VARIOS de un mes se puede mostrar como un número?
 *
 * Módulo PURO. Es el equivalente de `gastoMostrable` (`mayor/gastos.ts`) para la
 * otra fuente, y existe porque **Vista General hace una pregunta que el módulo
 * Gastos no hace**: el módulo sólo PINTA lo que salió; el tablero del dueño le
 * RESTA ese gasto a la utilidad bruta. Restar un número corto pinta de verde a
 * una empresa que puede estar perdiendo plata.
 *
 * ── 🔴 EL CRITERIO DE "QUÉ ES GASTO" NO SE ESCRIBE ACÁ ──────────────────────
 *
 * Es el del módulo Gastos y llega ya calculado: `ResumenEgresosMes.totalGastoCent`
 * = sólo el **grupo 6**, sumado por `resumirMesEgresos` (`./reglas.ts`) con el
 * mismo `esGasto` que usa el mayor. Acá NO se filtra ninguna cuenta. Medido
 * sobre los 378 renglones reales de Vistana: de **$243.342,48 que salieron**,
 * sólo **$118.753,76 son gasto** — el resto son transferencias entre cuentas
 * propias, planilla por pagar y pagos intercompañía. Usar el total contaría un
 * préstamo devuelto como gasto.
 *
 * ── POR QUÉ SE CAMBIÓ DE FUENTE (13-ago-2026) ───────────────────────────────
 *
 * Daniel, textual, cuando se le explicó que Vista General usaba el mayor y el
 * módulo Gastos usaba Egresos Varios: *"esto no entendi bien, no deberia de ser
 * egresos varios y ya?"*. Sí.
 *   · El **MAYOR** es lo que la contadora CERRÓ formalmente: 135 renglones en
 *     todo 2026, casi todos de enero. Va 7 meses atrás. Medido: **NO produce un
 *     número para NINGUNA empresa en NINGÚN mes de 2026** — todas caen en
 *     `sin_planilla`, `sin_cerrar` o `parcial`. O sea que el tablero del dueño
 *     se alimentaba de una fuente que nunca le daba de comer.
 *   · **EGRESOS VARIOS** es lo que SALIÓ de caja y banco, y está vivo: vistana
 *     hasta julio ($118.753,76 de gasto en 7 meses). Daniel confirmó que los
 *     gastos de todas las empresas se registran ahí — *"por ahi mismo pero no
 *     esta acutalizado aun, estamos en eso"*—, así que la fuente es la correcta
 *     y los meses van a ir llegando solos.
 * Y sobre todo: **dos "gasto" distintos para la misma empresa en dos pantallas
 * es lo que había que eliminar.**
 *
 * ── 🔑 LA REGLA QUE MANDA, HEREDADA DEL MAYOR ───────────────────────────────
 *
 * `gastoMostrable` del mayor se niega a mostrar un mes CERRADO que no trae ni un
 * peso de salarios (`sin_planilla`): el mes está completo según la contadora y
 * aun así el total quedaría corto. Acá pasa exactamente lo mismo con otra forma:
 * un mes con movimientos donde **nada** cayó en el grupo 6. **Es la MISMA regla
 * sobre otra fuente, no un criterio nuevo** — y no es teórica: `active_wear`
 * abril-2026 tiene 1 renglón, $278,20 que salieron y **$0,00 de gasto**.
 */

import type { EstadoEgresos, ResumenEgresosMes } from "./reglas";

/**
 * Por qué el gasto de un mes NO se puede mostrar como una cifra.
 *
 * 🔴 EL VOCABULARIO ES EL DE LA FUENTE NUEVA. Los motivos del mayor
 * (`sin_cerrar` / `parcial` / `sin_planilla`) hablan de un cierre contable que
 * esta fuente no tiene: acá no hay "mes cerrado", hay plata que salió o no
 * salió. Dejar los nombres viejos habría hecho que la pantalla explicara la
 * fuente equivocada.
 *
 *  - `sin_movimientos` → se pidió el mes a Switch y no vino ni un egreso. Es el
 *                        caso mayoritario hoy: los gastos todavía no se cargan.
 *  - `sin_datos`       → ese mes nunca se le pidió a Switch. No sabemos nada.
 *  - `no_automatico`   → Confecciones Boston: sus egresos NO los baja el cron
 *                        (pedido de Daniel — su usuario de Switch es el de él).
 *                        No es una falla: es una decisión, y la pantalla la dice.
 *  - `sin_gasto`       → salió plata pero NADA quedó registrado como gasto. El
 *                        mes existe y el total quedaría corto.
 */
export type MotivoSinGastoEgresos =
  | "sin_movimientos"
  | "sin_datos"
  | "no_automatico"
  | "sin_gasto";

export interface GastoEgresosMostrable {
  /** `true` sólo si el número se puede presentar como un hecho. */
  usable: boolean;
  /** El gasto en centavos cuando `usable`; `null` si no. NUNCA 0 por defecto. */
  totalCent: number | null;
  motivo: MotivoSinGastoEgresos | null;
}

/** Etiqueta corta para la píldora. Tiene que caber al lado del nombre. */
export const ETIQUETA_SIN_GASTO_EGRESOS: Record<MotivoSinGastoEgresos, string> = {
  sin_movimientos: "Sin cargar",
  sin_datos: "Sin traer",
  no_automatico: "No se baja sola",
  sin_gasto: "Nada es gasto",
};

/**
 * 🔑 LA DECISIÓN, en una función.
 *
 * `descargaAutomatica` viaja aparte porque cambia el MOTIVO, no el número: una
 * empresa que no se baja sola no está "sin cargar" por un problema — es que no
 * se le pide. Si alguien la trajo a mano y tiene movimientos, su gasto vale
 * igual que el de cualquier otra: por eso la bandera se mira DESPUÉS de decidir
 * si hay número, nunca antes.
 *
 * ⚠️ Un gasto NEGATIVO (reversos que superan a los cargos del mes) SÍ se
 * muestra: es la misma postura que el mayor toma desde su primer día — un
 * reverso no es un error, y esconderlo obligaría a inventar un motivo para algo
 * que sí pasó. Lo que no se muestra es el CERO, que es indistinguible de un mes
 * al que le falta todo.
 */
export function gastoEgresosMostrable(
  r: Pick<ResumenEgresosMes, "estado" | "totalGastoCent">,
  descargaAutomatica: boolean,
): GastoEgresosMostrable {
  if (r.estado === "con_movimientos") {
    if (r.totalGastoCent === 0) {
      return { usable: false, totalCent: null, motivo: "sin_gasto" };
    }
    return { usable: true, totalCent: r.totalGastoCent, motivo: null };
  }
  // Sin número: el motivo explica por qué, y "no se baja sola" gana porque es
  // la causa de fondo — decir "sin traer" de Boston escondería que nadie se lo
  // va a traer solo nunca.
  if (!descargaAutomatica) {
    return { usable: false, totalCent: null, motivo: "no_automatico" };
  }
  return { usable: false, totalCent: null, motivo: motivoDeEstado(r.estado) };
}

/** `EstadoEgresos` sin número → su motivo. `con_movimientos` no llega acá. */
function motivoDeEstado(estado: EstadoEgresos): MotivoSinGastoEgresos {
  return estado === "sin_datos" ? "sin_datos" : "sin_movimientos";
}

/**
 * La frase que ve Daniel cuando no hay número. Español simple, sin jerga
 * contable, y **diciendo la verdad de ESTA fuente**.
 *
 * `hastaMes` es el último mes con movimientos de ESA empresa, ya formateado
 * ("julio 2026"), o `null` si nunca tuvo ninguno. Es el dato que más sirve: no
 * dice sólo que falta, dice hasta dónde llegó.
 */
export function textoSinGastoEgresos(
  motivo: MotivoSinGastoEgresos,
  hastaMes: string | null,
): string {
  switch (motivo) {
    case "sin_movimientos":
      return hastaMes
        ? `Los gastos de esta empresa llegan hasta ${hastaMes}.`
        : "Todavía no hay gastos registrados de esta empresa.";
    case "sin_datos":
      return hastaMes
        ? `Este mes todavía no se ha traído de Switch. Lo último que hay es de ${hastaMes}.`
        : "Este mes todavía no se ha traído de Switch.";
    case "no_automatico":
      return hastaMes
        ? `Los gastos de esta empresa no se traen solos de Switch. Lo último que se trajo a mano es de ${hastaMes}.`
        : "Los gastos de esta empresa no se traen solos de Switch, así que todavía no hay nada.";
    case "sin_gasto":
      return "Este mes salió plata, pero nada de eso quedó registrado como gasto.";
  }
}
