// ─────────────────────────────────────────────────────────────────────────────
// La cartera de Confecciones Boston, leída del REPORTE WEB del panel.
//
// Este módulo es PURO: convierte lo que devuelve `/estadodecuenta/obtener` en
// filas con la forma EXACTA de `switch_estadocuenta`, para que la pestaña de
// Boston y la vista `switch_estadocuenta_aging_boston` sigan funcionando sin
// tocar una línea. El I/O vive en `sync-estadocuenta-web.ts`.
//
// ─── POR QUÉ EL REPORTE WEB Y NO EL API ──────────────────────────────────────
// `syncEmpresaEstadoCuenta` hace **una llamada HTTP por cliente** y Boston tiene
// **4.912 clientes** (las otras empresas: 136-139). Su único run exitoso de la
// historia tardó **3.240 s (54 min)** contra un techo de función de 800 s, así
// que por cron moría SIEMPRE — y un proceso matado no ejecuta `finally`: ni
// heartbeat, ni alerta, ni reconcile. La cartera quedó congelada desde el 28-jul.
//
// El reporte de antigüedad del panel (`Reportes → Estado de cuenta →
// Antigüedad`) trae **los mismos documentos, todos, en 2 llamadas**. Medido el
// 30-jul-2026: 924 documentos de 400 clientes en **~3 s**.
//
// ─── EL DETALLE QUE HACE QUE ESTO FUNCIONE ───────────────────────────────────
// El reporte no devuelve solo los totales por tramo: cada cliente trae su
// `elements[]` con el documento completo — `secuencial`, `numeroFiscal`, `total`,
// `saldo`, `tipoComprobante`, `abrev`, `fechaCreacion`, `dias`, `debito`,
// `credito`, `plazoCredito`. Son los MISMOS campos que consume
// `mapEstadoCuentaElement` desde el API, así que la fila que se guarda es la
// misma fila de siempre y nada aguas abajo se entera del cambio de fuente.
//
// Certificado el 30-jul-2026 cruzando el reporte contra las filas que la vía API
// ya había dejado en la base, documento por documento (909 pareados por
// `secuencial`): **0 diferencias en |saldo|, 0 en tipo de comprobante y 0 en
// cliente.** Es el mismo dato por otro camino.
//
// ═══ 🩸 LOS DOS CAMPOS QUE NO SE PUEDEN COPIAR TAL CUAL ══════════════════════
//
// 1. EL SIGNO DEL SALDO — el error que da "exactamente el doble".
//
//    El API devuelve `saldo` como MAGNITUD (siempre positivo) y el signo lo pone
//    la vista, con un CASE por `tipo_comprobante`:
//        Nota de Crédito / Recibo / Recibo Saldo Anterior  →  RESTAN
//        Factura / Nota de Débito / Saldo Anterior /
//        Transacción / Tiquete                             →  SUMAN
//
//    El reporte WEB devuelve `saldo` **ya firmado**: los 237 Recibos vienen en
//    negativo. Copiarlo tal cual hace que la vista niegue lo ya negativo y los
//    Recibos pasen a SUMAR. Medido contra producción el 30-jul-2026:
//        suma correcta (la que publica Switch) ...... 225.801,89
//        suma copiando el saldo tal cual ............ 343.530,77
//        diferencia ................................. 117.728,88
//        |saldo| de los Recibos ...................... 58.864,44  ×2 = 117.728,88
//    La diferencia es EXACTAMENTE el doble de lo que debía restarse. Es la firma
//    del bug, y es la razón de que este módulo no copie `saldo` a secas.
//
//    `saldoParaGuardar` invierte con LA MISMA tabla que usa la vista, así que el
//    round-trip es exacto por construcción y no depende de que los Recibos sigan
//    llegando en negativo: si Switch algún día invierte un signo, la vista sigue
//    devolviendo la verdad del reporte. Un tipo desconocido NO se adivina — la
//    vista lo ignora (contribuye 0) y acá queda anotado como skip.
//
// 2. EL `ccte_id` — el reporte web NO lo trae.
//
//    Es la llave natural de la tabla (`UNIQUE (empresa_key, ccte_id)`, `int`).
//    El reporte sí trae `numeroOrden`, que es único (924/924) y coincide con el
//    del API… pero **69 de los 924 pasan de 2.147.483.647** (máximo 4.509.300.155)
//    y no entran en un `int`. Su mitad alta tampoco sirve: `numeroOrden / 10000`
//    da 923 valores para 924 documentos (colisiona).
//
//    Lo que SÍ es chico y estable es el `secuencial`, con formato
//    `<serie>-<9 dígitos>` (series observadas 11/12/13/14/139/155; correlativo
//    máximo 7.649 medido el 25-ago-2026).
//
//    ═══ 🩸 PERO EL NÚMERO SOLO NO ES UNA IDENTIDAD (25-ago-2026) ═════════════
//
//    **Switch REINICIÓ la numeración.** El mismo `secuencial`, en la misma
//    empresa y con el mismo tipo, identifica DOS documentos distintos separados
//    por años. Medido en producción, 52 grupos así:
//
//        confecciones_boston  11-000000009  → Factura 2022-10-14 $285,16
//                                             Factura 2026-07-23 $271,25
//        confecciones_boston  13-000000003  → NC      2022-12-13 $9.955,60
//                                             NC      2026-03-19 $187,79
//
//    Solo Boston está expuesta: las otras 7 empresas usan el `ccte_id` NATIVO
//    que trae el API. Boston lo derivaba del secuencial porque su cartera baja
//    por el reporte web, así que dos documentos distintos daban la MISMA fila y
//    el upsert por `(empresa_key, ccte_id)` colapsaba uno **en silencio** (o
//    reventaba la corrida, según cayeran en el mismo lote de 100 o en dos).
//
//    ⚠️ Y ningún guard lo tapaba. El de colisión solo cortaba cuando dos
//    secuenciales DISTINTOS daban el mismo id; dos documentos con el MISMO
//    secuencial ni lo despertaban. Y `cuadraConSwitch` tampoco puede verlo: el
//    resumen se calcula sobre las filas ANTES del upsert, así que cuadra al
//    centavo contando los dos y recién DESPUÉS el upsert colapsa uno.
//
//    ═══ LA IDENTIDAD LLEVA EL AÑO ADENTRO ═══════════════════════════════════
//
//        ccte_id = serie × 10.000.000 + (año − 2000) × 100.000 + correlativo
//
//    y se lee de corrido en decimal — `11-000000009` del 2026 da `112600009`,
//    o sea `11` · `26` · `00009`. Que sea legible no es cosmético: es lo que
//    permite auditar una fila sin volver a correr nada.
//
//    • **Determinista**: mismo documento (mismo secuencial + misma fecha) →
//      mismo id SIEMPRE, así que el upsert sigue siendo idempotente.
//    • **Disjunto de los ccteId reales por CONSTRUCCIÓN**: el mínimo que produce
//      es 1×10⁷ = 10.000.000 y el ccte_id real más alto de TODA la tabla es
//      16.388. No es una apuesta a que no choquen: no pueden.
//    • **Con techo verificado**: 200×10⁷ + 99×10⁵ + 99.999 = 2.009.999.999,
//      debajo de 2^31−1. El presupuesto de un `int` no da para más: con serie
//      hasta 200 y 100 años, el correlativo no puede pasar de ~107.000, así que
//      los 100.000 de acá son el máximo redondo que entra. Medido: 7.649.
//    • **Ventana de años 2000-2099.** Medido en producción el 25-ago-2026: los
//      1.109 documentos de la cartera van de 2022 a 2026, ninguno sin fecha.
//
//    🔴 **Un documento sin fecha, o con un año fuera de la ventana, se RECHAZA**
//    (igual que una serie > 200 o un correlativo ≥ 100.000): va a `skip_details`
//    con su motivo. Y como el resumen se arma solo con las filas que SÍ se
//    construyeron, ese rechazo desarma el cuadre contra Switch y la corrida
//    entera se corta sin escribir nada. Es a propósito: preferimos la cartera de
//    ayer entera y un error a la vista, que la de hoy con un documento menos.
//
//    ⚠️ **Lo que el año NO cubre**: dos documentos con el mismo secuencial en el
//    MISMO año. No existe hoy y no cabe en un `int`, pero tampoco pasa
//    desapercibido — cae en el guard de identidad de `construirFilas`, que corta
//    la corrida. Fail-closed y ruidoso, nunca una fila pisando a otra.
// ─────────────────────────────────────────────────────────────────────────────

import type { SkipDetail } from "./sync-empresa";

/** Tope de un `int` de Postgres. `ccte_id` es `int NOT NULL`. */
export const CCTE_ID_MAX = 2_147_483_647;

/** Multiplicador de la serie en `ccteIdSintetico`. Deja 7 dígitos para el par
 *  (año, correlativo): 2 para el año y 5 para el correlativo. */
export const CCTE_SERIE_FACTOR = 10_000_000;

/** Multiplicador del año dentro del bloque de la serie. Deja 5 dígitos
 *  (0..99.999) para el correlativo — el máximo medido en Boston es 7.649. */
export const CCTE_ANIO_FACTOR = 100_000;

/** Año 0 de la ventana. `ccte_id` guarda `año − CCTE_ANIO_BASE` en 2 dígitos, o
 *  sea 2000..2099. Un documento fuera de esa ventana se RECHAZA en vez de
 *  envolverse: 2100 daría el mismo id que 2000. */
export const CCTE_ANIO_BASE = 2000;

/** Años que entran en los 2 dígitos reservados (2000..2099). */
export const CCTE_ANIO_SPAN = 100;

/** Correlativo máximo admitido (exclusivo). Es lo que dejan los 5 dígitos de
 *  abajo; medido el 25-ago-2026 en Boston: 7.649, o sea 13× de holgura. */
export const CCTE_CORRELATIVO_MAX = CCTE_ANIO_FACTOR;

/** Serie máxima admitida: 200 × 10⁷ + 99 × 10⁵ + 99.999 = 2.009.999.999 < 2^31−1.
 *  Una serie mayor desbordaría, así que se rechaza el documento en vez de
 *  truncarlo. */
export const CCTE_SERIE_MAX = 200;

/**
 * Signo con el que cada tipo de comprobante entra a la cartera.
 *
 * ⚠️ Es el ESPEJO del CASE de `switch_estadocuenta_aging_boston` (y del de la
 * vista del grupo). Las dos listas tienen que decir lo mismo o la plata sale
 * mal; `boston-cartera-web.test.ts` lee el SQL de la migración y compara.
 */
export const SIGNO_TIPO_COMPROBANTE: Readonly<Record<string, -1 | 1>> = {
  "Nota de Crédito": -1,
  Recibo: -1,
  "Recibo Saldo Anterior": -1,
  Factura: 1,
  "Nota de Débito": 1,
  "Saldo Anterior": 1,
  Transacción: 1,
  Tiquete: 1,
};

/** El signo que la vista le aplicará a este tipo. 0 = tipo desconocido: la vista
 *  lo ignora (aporta 0 a la cartera) y acá se anota como skip. */
export function signoDeTipo(tipo: string | null | undefined): -1 | 0 | 1 {
  if (!tipo) return 0;
  return SIGNO_TIPO_COMPROBANTE[tipo] ?? 0;
}

/**
 * Convierte el `saldo` FIRMADO del reporte web en el valor que hay que GUARDAR
 * para que la vista, al aplicarle su signo, devuelva exactamente el del reporte.
 *
 * Como el signo es ±1, invertir es multiplicar: `guardado = reporte × signo` y
 * entonces `vista = signo × guardado = signo² × reporte = reporte`. Exacto, sin
 * división ni redondeo.
 *
 * Tipo desconocido (signo 0): no hay valor que haga que la vista devuelva algo
 * distinto de 0, así que se guarda el saldo tal cual —es el dato crudo, el más
 * honesto— y el llamador lo anota como skip.
 */
export function saldoParaGuardar(tipo: string | null | undefined, saldoReporte: number): number {
  const signo = signoDeTipo(tipo);
  return signo === 0 ? saldoReporte : saldoReporte * signo;
}

/** Lo que la vista calculará a partir de un saldo ya guardado. Existe para que
 *  el test pueda comprobar el round-trip sin reimplementar la regla. */
export function saldoSegunLaVista(tipo: string | null | undefined, saldoGuardado: number): number {
  const signo = signoDeTipo(tipo);
  return signo === 0 ? 0 : saldoGuardado * signo;
}

export type CcteIdResultado =
  | { ok: true; ccteId: number; serie: number; correlativo: number; anio: number }
  | { ok: false; motivo: string };

/**
 * `ccte_id` determinista a partir del `secuencial` (`<serie>-<correlativo>`) Y
 * DE LA FECHA del documento.
 *
 * 🔴 La fecha NO es opcional y no tiene default: es la mitad de la identidad.
 * Switch reinició la numeración y el mismo `secuencial` nombra dos documentos
 * distintos separados por años (ver el encabezado). Un parámetro con default
 * dejaría que un llamador nuevo volviera al bug con solo olvidarse de pasarlo.
 *
 * Acepta la fecha tal como la manda el reporte (`YYYY-MM-DD…` o `DD-MM-YYYY`) y
 * la normaliza con `parseFechaReporte`, que es la MISMA función con la que se
 * guarda `fecha_creacion`: la identidad y la columna no pueden divergir.
 */
export function ccteIdSintetico(
  secuencial: string | null | undefined,
  fechaCreacion: string | null | undefined,
): CcteIdResultado {
  if (!secuencial) return { ok: false, motivo: "secuencial vacío" };
  const m = /^(\d{1,4})-(\d{1,12})$/.exec(secuencial.trim());
  if (!m) return { ok: false, motivo: `secuencial con formato inesperado: ${secuencial}` };
  const serie = parseInt(m[1], 10);
  const correlativo = parseInt(m[2], 10);
  if (serie < 1 || serie > CCTE_SERIE_MAX) {
    return { ok: false, motivo: `serie ${serie} fuera de rango (1..${CCTE_SERIE_MAX})` };
  }
  if (correlativo >= CCTE_CORRELATIVO_MAX) {
    return { ok: false, motivo: `correlativo ${correlativo} no entra en 5 dígitos` };
  }
  const fecha = parseFechaReporte(fechaCreacion);
  if (!fecha) {
    return {
      ok: false,
      motivo: `documento sin fecha utilizable (${secuencial}): la fecha es parte de la identidad`,
    };
  }
  const anio = parseInt(fecha.slice(0, 4), 10);
  const offset = anio - CCTE_ANIO_BASE;
  if (!Number.isFinite(offset) || offset < 0 || offset >= CCTE_ANIO_SPAN) {
    return {
      ok: false,
      motivo: `año ${anio} fuera de la ventana ${CCTE_ANIO_BASE}..${CCTE_ANIO_BASE + CCTE_ANIO_SPAN - 1}`,
    };
  }
  const ccteId = serie * CCTE_SERIE_FACTOR + offset * CCTE_ANIO_FACTOR + correlativo;
  if (ccteId > CCTE_ID_MAX) return { ok: false, motivo: `ccte_id ${ccteId} desborda int` };
  return { ok: true, ccteId, serie, correlativo, anio };
}

// ─── Forma de lo que devuelve el reporte ─────────────────────────────────────

export interface ElementReporteWeb {
  clienteCodigo?: string | null;
  clienteNombre?: string | null;
  secuencial?: string | null;
  numeroFiscal?: string | null;
  numeroOrden?: string | number | null;
  tipoComprobante?: string | null;
  abrev?: string | null;
  total?: string | number | null;
  /** ⚠️ YA VIENE FIRMADO (los Recibos, en negativo). Ver el encabezado. */
  saldo?: string | number | null;
  debito?: string | number | null;
  credito?: string | number | null;
  plazoCredito?: string | number | null;
  dias?: number | null;
  /** El reporte lo manda en YYYY-MM-DD (el API usa DD-MM-YYYY). */
  fechaCreacion?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MOTOR DE REPORTES DE SWITCH CAMBIÓ (19-ago-2026 12:37:21)
//
// `POST /estadodecuenta/obtener` —el endpoint por rondas que alimentaba todo lo
// de abajo— dejó de existir: devuelve la página de excepción con HTTP 200 y
// `Controller method not found` adentro. La cartera de Boston quedó congelada
// del 20 al 24 de agosto (5 corridas caídas).
//
// El reemplazo, leído del PROPIO código del panel (`assets/js/reportesmanager.js`
// y `assets/js/estadodecuenta.js`), no de una suposición:
//
//   1. POST reportesmanager/crearreporteconsola  → {response:true, uuid, estatus:"CREADO"}
//   2. GET  reportesmanager/buscarreporteconsola/<uuid> cada 2.000 ms
//        → {response, estatus, data:{data:[...], totales:{...}}}
//        estatus ∈ CREADO/… → seguir; TERMINADO → listo; ERROR/CANCELADO → cortar.
//
// Y el panel documenta el cambio de forma en un comentario propio:
//   «El .jsonl ahora viene como {data:[...], totales:{...}} en vez de un array
//    plano, para traer los totales ya calculados y no tener que sumarlos en JS»
//
// ═══ LO QUE CAMBIÓ DE NOMBRE, CAMPO POR CAMPO ═══════════════════════════════
//
//   VIEJO (elements[])          NUEVO (comprobantes[])     nota
//   ─────────────────────────   ────────────────────────   ─────────────────────
//   secuencial                  nSistema                   mismo formato serie-correlativo
//   numeroFiscal                nFiscal
//   fechaCreacion               fecha                      ahora con hora; parseFechaReporte la tolera
//   tipoComprobante             tipoComprobante            igual
//   debito / credito / dias     debito / credito / dias    iguales
//   plazoCredito                plazoCredito               igual
//   saldo (ya firmado)          —                          🔴 se DERIVA: debito − credito
//   total                       —                          se usa el lado no nulo del movimiento
//   abrev                       —                          no viene; queda null
//   numeroOrden                 —                          no hacía falta (el ccte_id sale del secuencial)
//   saldosTotales[{title,saldo}] totales{bucket: valor, total}
//   codigo / nombre             clienteCodigo / clienteNombre
//
// 🔑 **EL `saldo` POR DOCUMENTO YA NO VIENE Y NO SE ADIVINA: SE DERIVA.**
// El reporte nuevo trae `saldoAcumulado`, que es el CORRIDO del cliente (en el
// ejemplo real: 25,15 y después 266.541.377,15), no el saldo del documento.
// El aporte propio de cada movimiento es `debito − credito`, y eso se verifica
// solo: el último `saldoAcumulado` de cada cliente es igual a su `saldoTotal`, y
// —lo que de verdad manda— la suma de los documentos tiene que CUADRAR AL
// CENTAVO contra los `totales` que publica el propio Switch. Si la derivación
// estuviera mal, `cuadraConSwitch` corta la corrida y NO se escribe nada. Esa
// verificación ya existía y es exactamente la que cubre este riesgo.
//
// ⚠️ Este módulo sigue siendo PURO y sigue hablando la MISMA lengua hacia abajo:
// el adaptador convierte el formato nuevo al viejo, así que `construirFilas`, la
// tabla de signos, `ccteIdSintetico`, el cuadre, el guard de montos y el
// reconcile NO se tocaron — y sus candados siguen valiendo tal cual.
// ─────────────────────────────────────────────────────────────────────────────

/** Un movimiento del reporte NUEVO (`comprobantes[]`). */
export interface ComprobanteReporteConsola {
  fecha?: string | null;
  tipoComprobante?: string | null;
  nSistema?: string | null;
  nFiscal?: string | null;
  debito?: string | number | null;
  credito?: string | number | null;
  /** Corrido del CLIENTE, no del documento. No se usa para el saldo. */
  saldoAcumulado?: string | number | null;
  plazoCredito?: string | number | null;
  fechaVence?: string | null;
  dias?: number | null;
}

/** Un cliente del reporte NUEVO. */
export interface ClienteReporteConsola {
  clienteId?: number | null;
  clienteCodigo?: string | null;
  clienteNombre?: string | null;
  saldoTotal?: string | number | null;
  buckets?: Record<string, string | number> | null;
  comprobantes?: ComprobanteReporteConsola[] | null;
}

/** El cuerpo de `buscarreporteconsola` cuando dice TERMINADO. */
export interface ReporteConsola {
  data?: ClienteReporteConsola[] | null;
  totales?: Record<string, string | number> | null;
}

/**
 * Los totales del formato nuevo (`{bucket: valor, total: N}`) dichos en la forma
 * vieja (`[{title, saldo}]`), que es la que consume `tramosPublicadosPorSwitch`.
 *
 * `total` se DESCARTA a propósito: es la suma que Switch ya hizo de los ocho
 * tramos, y colarlo como un tramo más contaría toda la cartera dos veces (caería
 * en el `else` de 121+). Los tramos son los que suman; el total es el control.
 */
export function saldosTotalesDesdeTotales(
  totales: Record<string, string | number> | null | undefined,
): Array<{ title: string; saldo: string | number }> {
  return Object.entries(totales ?? {})
    .filter(([titulo]) => titulo !== "total")
    .map(([title, saldo]) => ({ title, saldo }));
}

/**
 * Convierte el reporte NUEVO a la forma VIEJA que entiende `construirFilas`.
 *
 * Es una traducción de nombres y una derivación (`saldo = debito − credito`);
 * ninguna regla de negocio vive acá — el signo, el ccte_id, los tramos y el
 * cuadre siguen donde estaban.
 */
export function adaptarReporteConsola(
  clientes: readonly ClienteReporteConsola[],
): ClienteReporteWeb[] {
  return clientes.map((c) => ({
    clienteId: c.clienteId ?? null,
    codigo: c.clienteCodigo ?? null,
    nombre: c.clienteNombre ?? null,
    saldoTotal: c.saldoTotal ?? null,
    saldos: null,
    elements: (c.comprobantes ?? []).map((m) => {
      const debito = num(m.debito) ?? 0;
      const credito = num(m.credito) ?? 0;
      return {
        clienteCodigo: c.clienteCodigo ?? null,
        clienteNombre: c.clienteNombre ?? null,
        secuencial: m.nSistema ?? null,
        numeroFiscal: m.nFiscal ?? null,
        numeroOrden: null,
        tipoComprobante: m.tipoComprobante ?? null,
        // El reporte nuevo no manda `abrev`. Se deja en null en vez de inventarlo
        // — nadie lo lee para la cartera (mismo criterio que los "original").
        abrev: null,
        // Tampoco manda un `total` propio: cada renglón es UN movimiento, así que
        // su valor de cara es el lado que no está en cero.
        total: debito !== 0 ? debito : credito,
        // 🔴 El aporte del documento. Ver el encabezado de este bloque.
        saldo: debito - credito,
        debito,
        credito,
        plazoCredito: m.plazoCredito ?? null,
        dias: typeof m.dias === "number" ? m.dias : null,
        fechaCreacion: m.fecha ?? null,
      };
    }),
  }));
}

export interface ClienteReporteWeb {
  clienteId?: number | null;
  codigo?: string | null;
  nombre?: string | null;
  saldoTotal?: string | number | null;
  saldos?: Array<{ title: string; saldo: string | number }> | null;
  elements?: ElementReporteWeb[] | null;
}

/** Fila lista para `switch_estadocuenta` (misma forma que la del API). */
export interface FilaEstadoCuentaWeb {
  empresa_key: string;
  ccte_id: number;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  cliente_codigo: string | null;
  secuencial: string | null;
  numero_fiscal: string | null;
  tipo_comprobante: string | null;
  abrev: string | null;
  total: number | null;
  saldo: number | null;
  debito: number | null;
  credito: number | null;
  saldo_original: number | null;
  total_original: number | null;
  plazo_credito: number | null;
  dias: number | null;
  fecha_creacion: string | null;
  raw_data: unknown;
}

export interface ResumenCartera {
  clientes: number;
  documentos: number;
  total: number;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
}

export interface ConstruccionFilas {
  filas: FilaEstadoCuentaWeb[];
  skips: SkipDetail[];
  /** Lo que la VISTA va a mostrar con estas filas. Sirve para cuadrar contra
   *  `saldosTotales`, que es lo que publica el propio Switch. */
  resumen: ResumenCartera;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** `YYYY-MM-DD` tal como lo manda el reporte; tolera `DD-MM-YYYY` por si cambia. */
export function parseFechaReporte(s: string | null | undefined): string | null {
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/** Error que corta la corrida entera (no se escribe nada). */
export class CarteraWebError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarteraWebError";
  }
}

/** Lo que hace que dos renglones sean EL MISMO documento. Si dos renglones caen
 *  en el mismo `ccte_id` pero difieren en cualquiera de estos tres campos, no
 *  son una repetición: son dos documentos peleándose una fila. */
interface IdentidadDocumento {
  secuencial: string | null;
  fecha: string | null;
  saldo: number;
}

/** Un centavo. Los saldos son `numeric(12,4)` y los dos lados salen del MISMO
 *  reporte, así que cualquier diferencia real es otro documento, no redondeo. */
const TOLERANCIA_IDENTIDAD = 0.005;

/** ¿Estos dos renglones son el MISMO documento repetido? */
export function mismoDocumento(a: IdentidadDocumento, b: IdentidadDocumento): boolean {
  return (
    a.secuencial === b.secuencial &&
    a.fecha === b.fecha &&
    Math.abs(a.saldo - b.saldo) < TOLERANCIA_IDENTIDAD
  );
}

/** Qué campos difieren, para que el error diga POR QUÉ y no solo QUE. */
function diferencias(a: IdentidadDocumento, b: IdentidadDocumento): string[] {
  const d: string[] = [];
  if (a.secuencial !== b.secuencial) d.push("secuencial distinto");
  if (a.fecha !== b.fecha) d.push("fecha distinta");
  if (Math.abs(a.saldo - b.saldo) >= TOLERANCIA_IDENTIDAD) d.push("monto distinto");
  return d;
}

const describir = (d: IdentidadDocumento) =>
  `"${d.secuencial ?? "(sin secuencial)"}" del ${d.fecha ?? "(sin fecha)"} por ${d.saldo}`;

/**
 * Arma las filas de `switch_estadocuenta` a partir de los clientes del reporte.
 *
 * ═══ EL GUARD DE IDENTIDAD ═══════════════════════════════════════════════════
 *
 * Corta la corrida (lanza) cuando dos renglones caen en el mismo `ccte_id` sin
 * ser el mismo documento: dejarlo pasar sería que uno pise al otro en el upsert
 * y la cartera quede corta sin que nadie se entere.
 *
 * 🩸 **Este guard CAMBIÓ DE DIRECCIÓN el 25-ago-2026.** Antes solo miraba el
 * `secuencial`: cortaba si dos secuenciales DISTINTOS daban el mismo id, y un
 * secuencial REPETIDO se declaraba "el mismo documento" y se dejaba pasar. Esa
 * suposición es exactamente la que rompió el reinicio de numeración de Switch —
 * `11-000000009` es una Factura de 2022 **y** otra de 2026, y la vieja regla las
 * daba por la misma. Ahora la identidad son los TRES campos: mismo secuencial,
 * misma fecha y mismo monto. Cualquier diferencia corta.
 *
 * Con el año adentro del `ccte_id`, el caso que motivó todo esto ya ni llega
 * acá: 2022 y 2026 dan ids distintos y conviven como dos filas. Lo que queda
 * para el guard es lo que el año NO puede separar —dos documentos con el mismo
 * secuencial en el MISMO año— y eso, en vez de pisarse, corta.
 *
 * Un documento suelto que no se puede mapear NO corta nada acá: se omite con su
 * motivo en `skip_details`. Pero como el resumen se arma solo con lo que sí se
 * construyó, el cuadre contra Switch se cae y la corrida termina en error sin
 * escribir. Omitir nunca es silencioso.
 */
export function construirFilas(
  empresaKey: string,
  clientes: readonly ClienteReporteWeb[],
): ConstruccionFilas {
  const filas: FilaEstadoCuentaWeb[] = [];
  const skips: SkipDetail[] = [];
  const porCcteId = new Map<number, IdentidadDocumento>();
  const conSaldo = new Set<number | string>();
  let d0_90 = 0;
  let d91_120 = 0;
  let d121_plus = 0;

  for (const cliente of clientes) {
    const clienteId = typeof cliente.clienteId === "number" ? cliente.clienteId : null;
    let totalCliente = 0;

    for (const el of cliente.elements ?? []) {
      const idres = ccteIdSintetico(el.secuencial, el.fechaCreacion);
      if (!idres.ok) {
        skips.push({
          facturaId: clienteId,
          secuencial: el.secuencial ?? null,
          campo: "ccte_id_sintetico",
          valorCrudo: idres.motivo,
        });
        continue;
      }

      const tipo = el.tipoComprobante ?? null;
      const saldoReporte = num(el.saldo) ?? 0;
      const fechaDoc = parseFechaReporte(el.fechaCreacion);

      // ── El guard de identidad. Ver el comentario de la función. ───────────
      const identidad: IdentidadDocumento = {
        secuencial: el.secuencial ?? null,
        fecha: fechaDoc,
        saldo: saldoReporte,
      };
      const previo = porCcteId.get(idres.ccteId);
      if (previo !== undefined && !mismoDocumento(previo, identidad)) {
        throw new CarteraWebError(
          `colisión de ccte_id ${idres.ccteId}: ${describir(previo)} y ${describir(identidad)} ` +
            `darían la misma fila (${diferencias(previo, identidad).join(", ")})`,
        );
      }
      porCcteId.set(idres.ccteId, identidad);

      if (signoDeTipo(tipo) === 0) {
        // La vista lo va a contar como 0. No se adivina un signo: se anota.
        skips.push({
          facturaId: clienteId,
          secuencial: el.secuencial ?? null,
          campo: "tipo_comprobante_sin_signo",
          valorCrudo: tipo,
        });
      }

      const saldoGuardado = saldoParaGuardar(tipo, saldoReporte);
      const dias = typeof el.dias === "number" ? el.dias : null;
      const aporte = saldoSegunLaVista(tipo, saldoGuardado);
      if (saldoGuardado !== 0 && dias !== null) {
        if (dias <= 90) d0_90 += aporte;
        else if (dias <= 120) d91_120 += aporte;
        else d121_plus += aporte;
      }
      totalCliente += aporte;

      filas.push({
        empresa_key: empresaKey,
        ccte_id: idres.ccteId,
        cliente_switch_id: clienteId,
        cliente_nombre: cliente.nombre ?? el.clienteNombre ?? null,
        cliente_codigo: cliente.codigo ?? el.clienteCodigo ?? null,
        secuencial: el.secuencial ?? null,
        numero_fiscal: el.numeroFiscal ?? null,
        tipo_comprobante: tipo,
        abrev: el.abrev ?? null,
        total: num(el.total),
        saldo: saldoGuardado,
        debito: num(el.debito),
        credito: num(el.credito),
        // El reporte web no trae los "original": el API sí. Se dejan en null en
        // vez de inventarlos con el valor de hoy — nadie los lee para la cartera.
        saldo_original: null,
        total_original: null,
        plazo_credito: num(el.plazoCredito),
        dias,
        // La MISMA fecha con la que se calculó el `ccte_id`. Parsearla dos veces
        // abriría la puerta a que la identidad y la columna dijeran cosas
        // distintas.
        fecha_creacion: fechaDoc,
        // Se guarda el element crudo (con `origen`) para poder auditar de dónde
        // salió cada fila sin tener que adivinar por el ccte_id.
        raw_data: { ...el, origen: "reporte-web-antiguedad" },
      });
    }

    // Mismo criterio que el HAVING de la vista: un cliente cuenta si su neto
    // llega a un centavo.
    if (Math.abs(totalCliente) >= 0.01) conSaldo.add(clienteId ?? cliente.codigo ?? "");
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    filas,
    skips,
    resumen: {
      clientes: conSaldo.size,
      documentos: filas.length,
      total: r2(d0_90 + d91_120 + d121_plus),
      d0_90: r2(d0_90),
      d91_120: r2(d91_120),
      d121_plus: r2(d121_plus),
    },
  };
}

/**
 * Suma los tramos que el propio Switch publica en `saldosTotales`, agrupados
 * como los muestra la pestaña de Boston (0-90 / 91-120 / 121+).
 *
 * Es la CONTRAPARTE independiente de `construirFilas`: uno recorre los
 * documentos y el otro lee el total que Switch ya calculó. Que los dos den lo
 * mismo es lo que certifica la carga, y es lo que verifica el sync antes de
 * escribir.
 */
export function tramosPublicadosPorSwitch(
  saldosTotales: ReadonlyArray<{ title: string; saldo: string | number }> | null | undefined,
): { d0_90: number; d91_120: number; d121_plus: number; total: number } {
  let d0_90 = 0;
  let d91_120 = 0;
  let d121_plus = 0;
  for (const t of saldosTotales ?? []) {
    const v = num(t.saldo) ?? 0;
    const titulo = String(t.title).trim();
    if (titulo === "0-30" || titulo === "31-60" || titulo === "61-90") d0_90 += v;
    else if (titulo === "91-120") d91_120 += v;
    else d121_plus += v;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { d0_90: r2(d0_90), d91_120: r2(d91_120), d121_plus: r2(d121_plus), total: r2(d0_90 + d91_120 + d121_plus) };
}
