// ═══════════════════════════════════════════════════════════════════════════
//   UN RENGLÓN QUE NO SE PUDO LEER TAMPOCO PUEDE DESAPARECER EN SILENCIO.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── 🩸 EL DEFECTO DE FONDO, Y ES PEOR QUE EL INCIDENTE QUE LO DESTAPÓ ────────
//
// El 1-sep-2026 Switch empezó a mandar el nombre de la cuenta pegado al código
// (`"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"`) y el sync de Egresos Varios
// murió en las cinco empresas que tienen gastos. Se notó **por casualidad**:
// como falló el 100% de los renglones, el sync se cortó entero y la corrida
// quedó en `error`.
//
// Si el cambio hubiera tocado 3 renglones de 378 en vez de los 378, esos tres
// gastos se caían **sin una sola señal** y la corrida se anotaba `success`:
// `erroresParseo` viajaba SOLO en la respuesta HTTP del cron, que nadie lee. No
// iba a `switch_sync_log.skip_details`, no salía en pantalla y no avisaba.
// Plata desaparecida en silencio; nos salvó que el cambio fue total.
//
// Eso incumplía dos reglas que la casa YA tenía escritas:
//   · «lo que Switch estrene y nadie clasifique **avisa**, en vez de valer CERO
//     en silencio» (centinela de tipos de comprobante, `ventas/centinela-tipos.ts`);
//   · «lo rechazado **se dice en pantalla**» (guard de montos imposibles,
//     `rechazos-de-switch.ts`).
//
// ── EL PATRÓN ES EL DEL GUARD DE MONTOS. NO SE INVENTA NINGUNO ──────────────
//
// Mismas tres estaciones, en el mismo orden y sobre las mismas tablas:
//
//   1. REGISTRO  → `switch_sync_log.records_skipped` + `skip_details`, con la
//                  MISMA forma de fila que `detallesDeRechazo` (`facturaId`,
//                  `secuencial`, `campo`, `valorCrudo`). Un solo lector después.
//   2. PANTALLA  → `rechazos-de-switch.ts`, que ya es la fuente ÚNICA del texto
//                  de «lo que Switch mandó y no entró».
//   3. TELEGRAM  → 🔧 SISTEMA, un mensaje por corrida, con el MISMO anti-loop de
//                  7 días por clave (`clavesYaAvisadasPorCampo`, compartida).
//
// ── ¿POR QUÉ ESTO SÍ MERECE ALERTA, Y NO SOLO REGISTRO? ─────────────────────
//
// Por la regla de tres del canal de sistema (`alertas/canal.ts`), entera:
//   1. **Es real** — es un pago que salió del banco y que la app no tiene.
//   2. **No se arregla solo** — el archivo llega igual mañana. Medido: el mismo
//      renglón falló el 1 y el 2 de septiembre, idéntico.
//   3. **Alguien tiene que hacer algo** — o se corrige el documento en Switch, o
//      hay que enseñarle a la app el formato nuevo. Ninguna de las dos pasa sola.
//
// Y **no estrena una cuarta regla**: es la regla 2 («algo se rompió y no se
// arregló solo») y sale por `enviarSistema`, igual que el aviso de montos
// imposibles con el que comparte hasta el anti-loop. Es exactamente el mismo
// caso que el centinela de tipos de venta, un escalón más abajo: allá la plata
// entra valiendo cero, acá directamente no entra.
//
// ── Y NO PUEDE VOLVERSE LA ALERTA QUE SUENA PARA SIEMPRE ────────────────────
// Los mismos dos frenos del guard de montos:
//   • **Un mensaje por corrida**, no uno por renglón (se nombran los 5 primeros).
//   • **Anti-loop de 7 días por clave**, y la clave es el N. INTERNO del
//     documento — NO el nº de línea, que se corre entero en cuanto alguien
//     arregla un renglón de arriba y haría ver descartes nuevos todos los días.

import { enviarSistema } from "@/lib/alertas/canal";
import { mapEmpresaName } from "@/lib/empresa-mapping";
import { clavesPorAvisar } from "./monto-guard";
import { clavesYaAvisadasPorCampo } from "./monto-guard-io";

/**
 * El `campo` con el que un renglón ilegible queda marcado en `skip_details`.
 *
 * 🔴 NO ES un `campoSkip(familia)`: los montos imposibles y los renglones
 * ilegibles se cuentan y se cuentan aparte. Si compartieran etiqueta, el
 * anti-loop de uno silenciaría al otro y la pantalla no podría decir cuál de
 * las dos cosas pasó.
 */
export const CAMPO_ILEGIBLE = "renglon_ilegible";

/** Un renglón del reporte que no se pudo leer. Módulo agnóstico del reporte. */
export interface RenglonIlegible {
  /** Nº de línea dentro del archivo (1-based, contando el encabezado). */
  linea: number;
  /** Por qué no se pudo leer, en las palabras que ve una persona. */
  motivo: string;
  /** El identificador del documento, si esa celda sí se pudo leer. */
  nInterno?: string;
}

/** Lo que se guarda en `switch_sync_log.skip_details`, misma forma que el guard. */
export interface IlegibleSkipDetail {
  facturaId: null;
  secuencial: string;
  campo: string;
  valorCrudo: { motivo: string; linea: number };
}

/**
 * La clave con la que se sigue un descarte entre corridas.
 *
 * El N. INTERNO cuando existe; si lo que falló fue justamente esa celda, se cae
 * al nº de línea diciéndolo (`"línea 41"`). No es estable, y por eso se dice —
 * un descarte sin identidad tiene que verse como lo que es.
 */
export function claveDeIlegible(r: RenglonIlegible): string {
  return r.nInterno && r.nInterno !== "" ? r.nInterno : `línea ${r.linea}`;
}

/** Los descartes, listos para `switch_sync_log.skip_details`. */
export function detallesDeIlegibles(
  ilegibles: readonly RenglonIlegible[],
): IlegibleSkipDetail[] {
  return ilegibles.map((r) => ({
    facturaId: null,
    secuencial: claveDeIlegible(r),
    campo: CAMPO_ILEGIBLE,
    valorCrudo: { motivo: r.motivo, linea: r.linea },
  }));
}

const MAX_EN_MENSAJE = 5;

/**
 * UN aviso por corrida al canal 🔧 SISTEMA. Nunca puede tumbar una corrida que
 * ya escribió bien: el llamador lo envuelve en try/catch.
 *
 * `que` es cómo se nombra el dato en el mensaje, en palabras de negocio —
 * "gastos de caja y banco", no el nombre de una tabla. `donde` es la pantalla
 * que Daniel tiene que mirar.
 */
export async function avisarRenglonesIlegibles(opts: {
  empresaKey: string;
  syncType: string;
  /** Qué se estaba trayendo. Sin nombres de tabla. */
  que: string;
  /** En qué pantalla se ve. */
  donde: string;
  ilegibles: readonly RenglonIlegible[];
  /** Cuántos renglones SÍ entraron, para que el aviso tenga proporción. */
  entraron: number;
  logId: string | null;
}): Promise<void> {
  const { empresaKey, syncType, que, donde, ilegibles, entraron, logId } = opts;
  if (ilegibles.length === 0) return;

  const claves = ilegibles.map(claveDeIlegible);
  const nuevas = new Set(
    clavesPorAvisar(
      claves,
      await clavesYaAvisadasPorCampo(CAMPO_ILEGIBLE, empresaKey, syncType, logId),
    ),
  );
  if (nuevas.size === 0) return; // ya se avisó por estos renglones: no se repite

  const aMostrar = ilegibles
    .filter((r) => nuevas.has(claveDeIlegible(r)))
    .slice(0, MAX_EN_MENSAJE);
  const detalle = aMostrar.map((r) => `• ${claveDeIlegible(r)}: ${r.motivo}`).join("\n");
  const extra = nuevas.size > MAX_EN_MENSAJE ? `\n…y ${nuevas.size - MAX_EN_MENSAJE} más.` : "";
  const cuantos =
    ilegibles.length === 1 ? "1 renglón" : `${ilegibles.length} renglones`;

  await enviarSistema(
    `Hay ${cuantos} que Switch mandó y no pude leer — ${mapEmpresaName(empresaKey)}\n${detalle}${extra}\n\n` +
      `Qué pasó: al traer ${que}, esos renglones vinieron con un formato que la app todavía no ` +
      `reconoce. Los otros ${entraron} sí entraron.\n` +
      `Qué significa: esa plata NO está en ${donde}. El total que ves está corto por lo que no entró.\n` +
      `Qué hacer: buscar esos documentos en Switch. Si allá se ven bien, es el formato del reporte lo ` +
      `que cambió y hay que enseñárselo a la app. Mientras siga así, este aviso se repite una vez por ` +
      `semana, no todos los días.`,
  );
}
