// ─────────────────────────────────────────────────────────────────────────────
// Campo derivado del ledger de CxP: ÚLTIMO PAGO. Nada más.
//
// Módulo PURO: no toca base ni red. Lo usan DOS lugares, y por eso vive aparte:
//   - src/lib/switch-api/sync-proveedores.ts → escribe las columnas al sincronizar
//   - src/lib/proveedores.ts                 → las RECALCULA al leer, desde el
//     mismo `elements` que ya está guardado en la fila
// Recalcular al leer no es redundancia: arregla las filas viejas sin esperar al
// cron (que corre 1×/día) y mantiene "hace N días" fresco entre corridas.
//
// ⛔ ACÁ VIVÍAN "Comprado YTD" y "Pagado YTD". SE ELIMINARON el 27-jul-2026 y no
// se vuelven a agregar sobre esta fuente. La regla que fijó Daniel es "solo
// quiero info que se pueda sacar al centavo desde Switch; lo que no, se elimina",
// y estos dos números NO se pueden:
//
//   `/apiproveedor/info` → `estadodecuenta.elements[]` es un ESTADO DE CUENTA,
//   no un libro de documentos: solo trae lo que TODAVÍA se debe (verificado: 0 de
//   821 renglones con saldo cero). Una factura de compra del año pagada al 100%
//   se cae del ledger **y se lleva su pago con ella**. Los dos totales quedaban
//   cortos, y cortos de forma impredecible — dependía de a qué proveedor se le
//   estuviera pagando al día. No es un número aproximado: es un subconjunto
//   arbitrario, sin factor de corrección ni cota de error posible.
//
//   "Pagado YTD" además NO TIENE ARREGLO: en las 74 páginas de la API de Switch
//   no existe NI UN endpoint de pagos a proveedores (ni reporte, ni lista, ni
//   detalle). La única fuente de pagos es este mismo ledger podado.
//
//   "Comprado" TAMPOCO tiene reemplazo. Se evaluó `/apiingresomercancia/lista`
//   como fuente de una columna distinta y bien rotulada ("Mercancía recibida") y
//   se DESCARTÓ tras medirla contra producción el 27-jul-2026. Las tres razones,
//   cualquiera de ellas suficiente:
//
//     1. NO se pueden excluir los anulados, ni siquiera detectarlos. El filtro
//        `estatus` está documentado pero la API lo IGNORA: medido en
//        american_classic, `estatus=Activo`, `estatus=Inactivo` y sin filtro
//        devuelven las MISMAS 610 filas y la MISMA suma ($1.099.278,65). Y no hay
//        campo de estado en ninguna parte — ni en la lista ni en
//        `/apiingresomercancia/info` (se revisaron las 10 llaves del detalle en
//        12 documentos: id, secuencial, fecha, subTotal, impuesto, total,
//        proveedor, proveedorId, sucursal, sucursalId).
//     2. Los datos traen basura que no se puede filtrar. En active_shoes el
//        ingreso 11 (19-000000011) viene con `subTotal: 4460999999999.55` y
//        `total: 1000000000` — cuatro billones y mil millones exactos, contra un
//        saldo de CxP de $233.870,60 en TODA la empresa. Ese solo documento hace
//        que "Mercancía recibida" de LATIN FITNESS GROUP diga MIL MILLONES.
//        Además 6 de 104 filas no cumplen `subTotal + impuesto = total`.
//     3. Es BRUTO: en toda la API no existe endpoint de devoluciones ni de notas
//        de crédito de compra, así que una devolución no se resta nunca.
//
//   Bajo la regla de Daniel eso es un borrado, no un rótulo nuevo: el número
//   sería exacto respecto de lo que Switch lista, pero lo que Switch lista no es
//   certificable. La evidencia se reproduce con los scripts
//   `scripts/_probe-ingresomercancia*.ts` (solo lectura).
//
// `Último pago` SÍ es exacto y se queda: solo necesita el pago más reciente, que
// por definición sigue vivo en el ledger abierto.
//
// 🩸 EL BUG QUE ARREGLA (27-jul-2026). `parseFecha()` exigía **DD-MM-YYYY**:
//     const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
// pero `/apiproveedor/info` devuelve `fechaCreacion` en **YYYY-MM-DD**. Medido
// contra los 821 renglones guardados en `switch_proveedor_estadocuenta`:
// **821 en YYYY-MM-DD, 0 en DD-MM-YYYY** → la función devolvía null 821 de 821
// veces y, como todo el cálculo vive dentro de `if (f && …)`, las tres columnas
// quedaban en cero/vacío en **66 de 66 filas, en las 7 empresas**. El comentario
// del código documentaba un formato que el endpoint no usa (se copió del estado
// de cuenta de CXC, que sí es DD-MM-YYYY — ver `parseFechaDMY` en switch-api/parse.ts).
// Acá se aceptan LOS DOS formatos: el real y el que decía el comentario.
//
// ⚠️ Panamá es UTC−5 FIJO (sin horario de verano) y el año se corta en hora
// PANAMÁ, no en UTC. `new Date().getUTCFullYear()` —lo que usaba el sync— ya es
// el año siguiente entre las 19:00 y las 23:59 del 31 de diciembre en Panamá:
// durante esas 5 horas el YTD se habría vaciado un día antes de tiempo. Y una
// fecha con hora se lleva al día-calendario de Panamá antes de mirarle el año.
// ─────────────────────────────────────────────────────────────────────────────

import { hoyPanama } from "@/lib/fecha-panama";

/** Un renglón del ledger que devuelve /apiproveedor/info → estadodecuenta.elements. */
export interface ElementoLedger {
  fechaCreacion?: unknown;
  credito?: unknown;
  debito?: unknown;
  total?: unknown;
  saldo?: unknown;
  dias?: unknown;
  abrev?: unknown;
  tipoComprobante?: unknown;
}

export interface DerivadosProveedor {
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null; // YYYY-MM-DD
  ultimo_pago_dias: number | null;
}

export const DERIVADOS_VACIOS: DerivadosProveedor = {
  ultimo_pago_monto: null,
  ultimo_pago_fecha: null,
  ultimo_pago_dias: null,
};

/** Switch manda montos en formato US ("41,428.0000"). Number() de eso es NaN. */
export function montoSwitch(x: unknown): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = Number(String(x ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/**
 * Fecha-calendario de PANAMÁ (YYYY-MM-DD) de un `fechaCreacion` del ledger.
 * Devuelve null si no se reconoce — nunca una fecha inventada.
 *
 * Formatos aceptados:
 *   YYYY-MM-DD              ← lo que manda Switch hoy (821/821 renglones)
 *   DD-MM-YYYY              ← lo que decía el comentario viejo; se acepta por si
 *                             el endpoint vuelve al formato del estado de cuenta
 *   YYYY-MM-DD HH:mm[:ss]   ← sin zona: convención de Switch = hora Panamá, así
 *                             que el día ya es el correcto (ver switch-api/parse.ts)
 *   ISO con Z u offset      ← instante real: se lleva a UTC−5 ANTES de cortar el día
 */
export function fechaPanamaDelLedger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;

  // ISO con zona explícita (Z o ±hh:mm) → el día depende de la zona: convertir.
  const conZona = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/);
  if (conZona) {
    const ms = Date.parse(s.replace(" ", "T"));
    if (!Number.isFinite(ms)) return null;
    // UTC−5 fijo: restar 5h y leer el día en UTC da el día-calendario de Panamá.
    return new Date(ms - 5 * 3600_000).toISOString().slice(0, 10);
  }

  // YYYY-MM-DD, con o sin hora SIN zona (hora Panamá por convención → mismo día).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;

  // DD-MM-YYYY (formato del estado de cuenta de CXC).
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return diaValido(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;

  return null;
}

/** Rechaza zero-dates ("0000-00-00") y componentes imposibles ("2026-13-40"). */
function diaValido(anio: number, mes: number, dia: number): boolean {
  if (anio < 2000 || anio > 2999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * ¿Este renglón es un PAGO de verdad?
 *
 * El agregador viejo clasificaba por `debito > 0` a secas, y con eso las **notas
 * de crédito contaban como pagos**: medido sobre los 90 renglones con débito,
 * 57 son "Pago a proveedores" y 33 son "Nota de Crédito". La consecuencia se veía
 * en pantalla: en 6 de las 17 filas con débito el "Último pago" habría mostrado
 * la fecha de una NOTA DE CRÉDITO —plata que nunca salió—, y 5 proveedores que
 * NUNCA recibieron un pago habrían mostrado uno. Una nota de crédito baja lo que
 * se debe, no es un pago.
 */
export function esPagoAProveedor(el: ElementoLedger): boolean {
  const abrev = String(el.abrev ?? "").trim().toUpperCase();
  if (abrev === "PP") return true;
  if (abrev === "NC" || abrev === "ND") return false;
  return String(el.tipoComprobante ?? "").toUpperCase().includes("PAGO");
}

/**
 * Monto del DOCUMENTO, no del saldo abierto.
 *
 * `credito`/`debito` traen el saldo que le queda al documento, no lo que dice el
 * documento: medido, `credito === saldo` en 731/731 renglones de cargo y
 * `debito === |saldo|` en 90/90. Sumarlos bajo el rótulo "Comprado YTD" da el
 * saldo por cobrar de las facturas del año — de hecho salía IDÉNTICO a la columna
 * "Por pagar" en 17 de 32 filas, y para LATIN FITNESS (active_wear) habría dicho
 * $81.430,83 comprado cuando las facturas del año suman $206.430,83. `total` sí
 * es el monto del documento (no es acumulado: el acumulado es `saldoConsecutivo`).
 */
export function montoDocumento(el: ElementoLedger): number {
  const total = montoSwitch(el.total);
  if (total > 0) return total;
  return montoSwitch(el.credito) + montoSwitch(el.debito);
}

/**
 * Último pago a este proveedor, a partir de su ledger de CxP.
 *
 * Este cálculo NO sufre la poda del estado de cuenta: el pago más reciente sigue
 * abierto por definición, así que el dato es exacto. (Lo que sí sufría la poda
 * —"Comprado YTD" y "Pagado YTD"— ya no se calcula acá; ver el encabezado.)
 */
export function derivarProveedor(
  elements: ElementoLedger[] | null | undefined,
  opts: { hoy?: string } = {},
): DerivadosProveedor {
  const hoy = opts.hoy ?? hoyPanama();

  let ultimo: { monto: number; fecha: string } | null = null;

  for (const el of elements ?? []) {
    if (montoSwitch(el.debito) <= 0 || !esPagoAProveedor(el)) continue;
    const fecha = fechaPanamaDelLedger(el.fechaCreacion);
    // Último pago: el de fecha más reciente. Sin fecha legible no compite —
    // preferimos vacío antes que inventar una.
    if (fecha != null && (ultimo === null || fecha > ultimo.fecha)) {
      ultimo = { monto: montoDocumento(el), fecha };
    }
  }

  return {
    ultimo_pago_monto: ultimo ? r2(ultimo.monto) : null,
    ultimo_pago_fecha: ultimo ? ultimo.fecha : null,
    ultimo_pago_dias: ultimo ? diasDesde(ultimo.fecha, hoy) : null,
  };
}

/**
 * Días entre dos fechas-calendario de Panamá. Se calcula acá en vez de copiar el
 * `dias` que manda Switch por dos razones: ese número se congela en la corrida
 * del sync (que es 1×/día) y encima viene en valor ABSOLUTO — el único documento
 * con fecha futura del ledger (12-dic-2026) trae `dias: 137`, que leído como
 * "hace 137 días" es falso. Nunca devuelve negativo.
 */
export function diasDesde(fecha: string, hoy: string): number {
  const a = Date.parse(`${fecha}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
