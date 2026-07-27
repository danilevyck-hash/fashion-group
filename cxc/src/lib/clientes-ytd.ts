// ─────────────────────────────────────────────────────────────────────────────
// "Compras del año" de un cliente — UNA sola definición para toda la app.
//
// Daniel pidió ver las compras del año en el LISTADO de clientes, no sólo
// adentro de la ficha. El riesgo obvio era que el listado dijera un número y la
// ficha otro para el mismo cliente — peor que no tener la columna. Por eso la
// definición vive acá y la usan los dos: `api/clientes/[codigo]` (ficha) y
// `api/clientes/ytd` (listado). No hay dos fórmulas que puedan divergir.
//
// DEFINICIÓN (la que ya usaba la ficha, no se cambió):
//   · Ventas NETAS de notas de crédito: Factura/Tiquete/Transacción/Nota de
//     Débito suman, Nota de Crédito resta, cualquier otro tipo vale 0.
//   · Base = `total`, o sea CON ITBMS.
//   · Año calendario en curso, en hora de PANAMÁ (UTC−5 fijo, sin horario de
//     verano).
//   · Sólo las 6 empresas B2B (`B2B_EMPRESA_KEYS`).
//   · Atribución por el PAR (empresa_key, cliente_switch_id): el id de cliente
//     es por-empresa, así que matchear sólo por cliente_switch_id mezclaría
//     clientes distintos de empresas distintas.
//
// ⚠️ OJO — NO es el mismo número que la columna "Compras YTD" de Ventas →
// Clientes. Esa otra pantalla suma `subtotal_descuento` (SIN ITBMS). Medido el
// 27-jul-2026 sobre fashion_wear 2026, coincide al centavo con lo que muestra:
// City Mall Paso Canoa 479.870,40 sin ITBMS contra 513.457,72 con ITBMS. Son
// dos definiciones legítimas conviviendo en el sistema; unificarlas es una
// decisión de negocio de Daniel, no un detalle técnico, y hasta que la tome
// este módulo replica la de la FICHA porque es la que Daniel pidió ver en el
// listado ("que el número sea el mismo que muestra la ficha").
//
// 🩸 El corte de año iba en UTC y eso es un bug conocido de esta casa: era
// `new Date().getFullYear()`, que en un servidor UTC ya dice el año siguiente
// entre las 19:00 y las 23:59 del 31-dic de Panamá → el "compras del año" se
// vaciaba 5 horas antes de tiempo. El mismo error se pagó en Proveedores (ver
// CLAUDE.md). Acá el año se saca SIEMPRE del calendario de Panamá.
// ─────────────────────────────────────────────────────────────────────────────

/** Panamá es UTC−5 fijo, todo el año. Verificado contra la tzdb en las 52.269
 *  facturas de switch_facturas: 0 discrepancias (ver CLAUDE.md). */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Comprobantes que SUMAN. Nota de Crédito resta; el resto no cuenta. */
export const TIPOS_QUE_SUMAN = ["Factura", "Tiquete", "Transacción", "Nota de Débito"] as const;
const SUMAN = new Set<string>(TIPOS_QUE_SUMAN);

/** El día-calendario de Panamá al que pertenece un instante, como "YYYY-MM-DD". */
export function ymdPanama(iso: string): string {
  return new Date(Date.parse(iso) - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** El año calendario en curso SEGÚN PANAMÁ (no según el reloj del servidor). */
export function anioEnCursoPanama(ahora: Date = new Date()): number {
  return Number(ymdPanama(ahora.toISOString()).slice(0, 4));
}

/** Ventana [desde, hasta) del año en curso, en instantes UTC. 1-ene 00:00 de
 *  Panamá es 05:00 UTC del mismo día. Semiabierta: el 31-dic 19:00 de Panamá
 *  (= 1-ene 00:00 UTC) todavía es del año viejo y tiene que contar. */
export function ventanaAnioPanama(ahora: Date = new Date()): { desde: string; hasta: string; anio: number } {
  const anio = anioEnCursoPanama(ahora);
  return {
    anio,
    desde: `${anio}-01-01T05:00:00.000Z`,
    hasta: `${anio + 1}-01-01T05:00:00.000Z`,
  };
}

/** El aporte firmado de un documento: + si suma, − si es nota de crédito, 0 si no. */
export function montoFirmado(tipoComprobante: string | null | undefined, base: number | string | null | undefined): number {
  const monto = Number(base ?? 0);
  if (!Number.isFinite(monto)) return 0;
  if (SUMAN.has(tipoComprobante ?? "")) return monto;
  if (tipoComprobante === "Nota de Crédito") return -monto;
  return 0;
}

/** Redondeo a centavos, para que no se filtren colas binarias a la pantalla. */
export const aCentavos = (n: number): number => Math.round(n * 100) / 100;
