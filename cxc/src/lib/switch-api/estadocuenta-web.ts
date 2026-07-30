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
//    Lo que SÍ es único, chico y estable es el `secuencial`, con formato
//    `<serie>-<9 dígitos>` (series observadas 11/12/14/139/155; correlativo
//    máximo 7.473). De ahí sale `ccteIdSintetico`:
//
//        ccte_id = serie × 10.000.000 + correlativo
//
//    • **Determinista**: el mismo documento da siempre el mismo id, así que el
//      upsert por `(empresa_key, ccte_id)` sigue siendo idempotente.
//    • **Disjunto de los ccteId reales por CONSTRUCCIÓN**: el mínimo que produce
//      es 11×10⁷ = 110.000.000 y el ccte_id real más alto de TODA la tabla es
//      16.388. No es una apuesta a que no choquen: no pueden.
//    • **Con techo verificado**: 155×10⁷ + 7.473 = 1.550.007.473 < 2^31−1.
//
//    Los bordes se validan en cada corrida en vez de confiarse: una serie > 200 o
//    un correlativo ≥ 10.000.000 desbordarían el `int`, así que ese documento se
//    RECHAZA con su motivo en `skip_details` en lugar de escribir un id envuelto.
//    Y `construirFilas` corta la corrida entera si dos `secuencial` distintos dan
//    el mismo id — una colisión silenciosa sería un documento pisando a otro, o
//    sea plata mal contada.
// ─────────────────────────────────────────────────────────────────────────────

import type { SkipDetail } from "./sync-empresa";

/** Tope de un `int` de Postgres. `ccte_id` es `int NOT NULL`. */
export const CCTE_ID_MAX = 2_147_483_647;

/** Multiplicador de la serie en `ccteIdSintetico`. Deja 7 dígitos (0..9.999.999)
 *  para el correlativo — el máximo observado en Boston es 7.473. */
export const CCTE_SERIE_FACTOR = 10_000_000;

/** Serie máxima admitida: 200 × 10⁷ + 9.999.999 = 2.009.999.999 < 2^31−1. Una
 *  serie mayor desbordaría, así que se rechaza el documento en vez de truncarlo. */
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
  | { ok: true; ccteId: number; serie: number; correlativo: number }
  | { ok: false; motivo: string };

/**
 * `ccte_id` determinista a partir del `secuencial` (`<serie>-<correlativo>`).
 * Ver el encabezado para por qué no se usa `numeroOrden` y por qué no puede
 * chocar con los ccteId reales del API.
 */
export function ccteIdSintetico(secuencial: string | null | undefined): CcteIdResultado {
  if (!secuencial) return { ok: false, motivo: "secuencial vacío" };
  const m = /^(\d{1,4})-(\d{1,12})$/.exec(secuencial.trim());
  if (!m) return { ok: false, motivo: `secuencial con formato inesperado: ${secuencial}` };
  const serie = parseInt(m[1], 10);
  const correlativo = parseInt(m[2], 10);
  if (serie < 1 || serie > CCTE_SERIE_MAX) {
    return { ok: false, motivo: `serie ${serie} fuera de rango (1..${CCTE_SERIE_MAX})` };
  }
  if (correlativo >= CCTE_SERIE_FACTOR) {
    return { ok: false, motivo: `correlativo ${correlativo} no entra en 7 dígitos` };
  }
  const ccteId = serie * CCTE_SERIE_FACTOR + correlativo;
  if (ccteId > CCTE_ID_MAX) return { ok: false, motivo: `ccte_id ${ccteId} desborda int` };
  return { ok: true, ccteId, serie, correlativo };
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

/**
 * Arma las filas de `switch_estadocuenta` a partir de los clientes del reporte.
 *
 * Corta la corrida (lanza) ante una COLISIÓN de `ccte_id` entre dos documentos
 * distintos: dejarla pasar sería que un documento pise a otro en el upsert y la
 * cartera quede corta sin que nadie se entere. Un documento suelto que no se
 * puede mapear NO corta nada: se omite con su motivo en `skip_details`.
 */
export function construirFilas(
  empresaKey: string,
  clientes: readonly ClienteReporteWeb[],
): ConstruccionFilas {
  const filas: FilaEstadoCuentaWeb[] = [];
  const skips: SkipDetail[] = [];
  const porCcteId = new Map<number, string>();
  const conSaldo = new Set<number | string>();
  let d0_90 = 0;
  let d91_120 = 0;
  let d121_plus = 0;

  for (const cliente of clientes) {
    const clienteId = typeof cliente.clienteId === "number" ? cliente.clienteId : null;
    let totalCliente = 0;

    for (const el of cliente.elements ?? []) {
      const idres = ccteIdSintetico(el.secuencial);
      if (!idres.ok) {
        skips.push({
          facturaId: clienteId,
          secuencial: el.secuencial ?? null,
          campo: "ccte_id_sintetico",
          valorCrudo: idres.motivo,
        });
        continue;
      }
      const previo = porCcteId.get(idres.ccteId);
      if (previo !== undefined && previo !== el.secuencial) {
        throw new CarteraWebError(
          `colisión de ccte_id ${idres.ccteId}: "${previo}" y "${el.secuencial}" darían la misma fila`,
        );
      }
      porCcteId.set(idres.ccteId, el.secuencial!);

      const tipo = el.tipoComprobante ?? null;
      if (signoDeTipo(tipo) === 0) {
        // La vista lo va a contar como 0. No se adivina un signo: se anota.
        skips.push({
          facturaId: clienteId,
          secuencial: el.secuencial ?? null,
          campo: "tipo_comprobante_sin_signo",
          valorCrudo: tipo,
        });
      }

      const saldoReporte = num(el.saldo) ?? 0;
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
        fecha_creacion: parseFechaReporte(el.fechaCreacion),
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
