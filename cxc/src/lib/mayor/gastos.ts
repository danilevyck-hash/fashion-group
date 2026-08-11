/**
 * Reglas de negocio del MAYOR CONTABLE → gastos por empresa.
 *
 * Este módulo es PURO: recibe líneas ya parseadas y devuelve el resumen. No
 * toca la base ni la red, así que se prueba entero contra el archivo real de
 * Vistana (`src/__tests__/fixtures/mayor-vistana-2026.csv`).
 *
 * ── Lo que decidió Daniel (no relitigar) ────────────────────────────────────
 *
 *  1. SOLO el grupo 6. El grupo 5 (COSTOS) NO se trae: `5.03 COMPRAS` existe en
 *     2 de las 8 empresas, así que significaría cosas distintas según la
 *     empresa. El costo sale del inventario, que sí es uniforme. Una sola
 *     fuente por número.
 *
 *  2. El ISR (`6.05`) SÍ es gasto y va DENTRO del total, pero en su propia
 *     línea al final — no revuelto con los gastos de operación. Cuando un mes
 *     tiene ISR y el anterior no, se avisa: no cae parejo y distorsiona la
 *     comparación.
 *
 *  3. Cuatro cuentas NO son plata que salió del banco (depreciación, cuentas
 *     malas, faltantes de inventario, gasto de períodos anteriores). CUENTAN en
 *     el total —para cuadrar al centavo con la contadora— pero van marcadas.
 *
 *  4. Las comisiones de vendedores viven dentro de `6.01` junto al salario. El
 *     catálogo las separa (`6.01.01 SALARIOS` vs `6.01.02 COMISIONES`), así que
 *     el desglose las distingue cuando hay dato. En enero de Vistana NO hay una
 *     sola línea 6.01, así que esto está escrito pero SIN verificar contra dato
 *     real — ver `PENDIENTE` abajo.
 *
 * ── 🔑 Lo más importante de todo el módulo ──────────────────────────────────
 *
 *  Distinguir "gastó $0" de "no hay contabilidad de este mes". La contadora va
 *  meses atrasada: si un mes sin cerrar se pintara como cero, Daniel creería
 *  que no gastó nada y tomaría una decisión con un número inventado. Por eso
 *  `EstadoMes` tiene CUATRO valores y solo uno de ellos ("cerrado") autoriza a
 *  mostrar el monto como un hecho.
 */

import type { MayorLinea } from "./parser";

// ── Grupos y cuentas especiales ──────────────────────────────────────────────

/** Prefijo del único grupo que es gasto. */
export const GRUPO_GASTOS = "6.";

/** Impuesto sobre la renta. Cuenta en el total, pero en su propia línea. */
export const PREFIJO_ISR = "6.05";

/** Gastos salariales (incluye las comisiones de vendedores). */
export const PREFIJO_SALARIOS = "6.01";
/** Salario fijo, dentro de 6.01. */
export const CUENTA_SALARIO_FIJO = "6.01.01";
/** Comisiones de vendedores, dentro de 6.01. Bajan con las ventas. */
export const CUENTA_COMISIONES = "6.01.02";

/**
 * Las 4 cuentas que NO son plata que salió del banco. Cuentan en el total pero
 * se marcan, porque "gasté" y "se me depreció un activo" no son lo mismo a la
 * hora de decidir.
 */
export const CUENTAS_SIN_SALIDA_DE_CAJA: Record<string, string> = {
  "6.03.38": "Depreciación",
  "6.03.39": "Cuentas malas",
  "6.03.41": "Faltantes de inventario",
  "6.03.42": "Gasto de períodos anteriores",
};

/** `"6.03.07.00.00"` → `"6.03.07"` (los 3 segmentos que identifican la cuenta). */
export function cuentaCorta(cuenta: string): string {
  return cuenta.split(".").slice(0, 3).join(".");
}

export const esGasto = (cuenta: string): boolean => cuenta.startsWith(GRUPO_GASTOS);
export const esIsr = (cuenta: string): boolean => cuentaCorta(cuenta).startsWith(PREFIJO_ISR);
export const esSinSalidaDeCaja = (cuenta: string): boolean =>
  cuentaCorta(cuenta) in CUENTAS_SIN_SALIDA_DE_CAJA;
export const esSalarial = (cuenta: string): boolean => cuentaCorta(cuenta).startsWith(PREFIJO_SALARIOS);

// ── Estado de un mes ─────────────────────────────────────────────────────────

/**
 * En qué situación está la contabilidad de un mes.
 *
 *  - `cerrado`    → la contadora cerró el mes. El monto es un HECHO.
 *  - `parcial`    → hay asientos sueltos pero NO los de cierre mensual. El monto
 *                   que se ve está incompleto. (Febrero de Vistana: un único
 *                   asiento de préstamo, sin una sola cuenta de gasto.)
 *  - `sin_cerrar` → se pidió el mes a Switch y volvió sin un solo asiento.
 *  - `sin_datos`  → nunca se trajo ese mes. No sabemos nada de él.
 *
 * ⚠️ SOLO `cerrado` autoriza a mostrar el número como un gasto real. Los otros
 * tres se muestran con su leyenda, NUNCA como `$0.00`.
 */
export type EstadoMes = "cerrado" | "parcial" | "sin_cerrar" | "sin_datos";

/** Texto corto, en español simple, para pintar en la pantalla. */
export const ETIQUETA_ESTADO: Record<EstadoMes, string> = {
  cerrado: "Cerrado",
  parcial: "Incompleto",
  sin_cerrar: "Sin cerrar",
  sin_datos: "No traído",
};

/**
 * Explicación larga. Nada de jerga contable: Daniel no es contador.
 * `hastaMes` es el último mes cerrado que sí tenemos (ej. "enero 2026").
 */
export function explicacionEstado(estado: EstadoMes, hastaMes: string | null): string {
  switch (estado) {
    case "cerrado":
      return "La contadora ya cerró este mes.";
    case "parcial":
      return "Este mes tiene movimientos sueltos, pero la contadora todavía no lo cerró. Lo que se ve está incompleto.";
    case "sin_cerrar":
      return hastaMes
        ? `Todavía no hay contabilidad de este mes. La contabilidad llega hasta ${hastaMes}.`
        : "Todavía no hay contabilidad de este mes.";
    case "sin_datos":
      return "Este mes todavía no se ha traído de Switch.";
  }
}

/**
 * ¿Es un asiento de CIERRE mensual?
 *
 * Los asientos que la contadora postea al cerrar el mes se describen
 * `ASIENTO <QUÉ> <AAAA-MM>` — en Vistana enero: `ASIENTO VENTA 2026-01`,
 * `ASIENTO STOCK 2026-01`, `ASIENTO MOVIMIENTOS FONDOS 2026-01`,
 * `ASIENTO PROVEEDORES 2026-01`. Los movimientos sueltos del día a día
 * (`REGISTRA PRESTAMO - ROXANA HERNANDEZ`) no siguen ese patrón.
 *
 * Se exige además que el mes citado en la descripción sea EL MISMO mes de la
 * fecha de la línea, para que un asiento de ajuste de otro período no haga
 * pasar por cerrado un mes que no lo está.
 *
 * ⚠️ SUPUESTO A CONFIRMAR CON LA CONTADORA: esto está medido contra UNA empresa
 * (Vistana) y UN mes (enero 2026). Si otra empresa describe sus asientos de
 * cierre de otra forma, sus meses se van a ver como "Incompleto" — que es el
 * lado seguro del error (avisa de menos, nunca pinta un cero falso), pero hay
 * que verificarlo cuando lleguen los otros archivos.
 */
export function esAsientoDeCierre(linea: Pick<MayorLinea, "descripcion" | "mes">): boolean {
  const m = /^ASIENTO\b.*?(\d{4}-\d{2})$/i.exec(linea.descripcion.trim());
  return m !== null && m[1] === linea.mes;
}

// ── Agregación ───────────────────────────────────────────────────────────────

/** Una cuenta de gasto con su neto del mes. */
export interface CuentaGasto {
  /** Código completo de 5 segmentos, la llave contra la contabilidad. */
  cuenta: string;
  /** Los 3 segmentos que se muestran ("6.03.07"). */
  corta: string;
  /** Nombre tal como lo trae ESA empresa. */
  nombre: string;
  debitoCent: number;
  creditoCent: number;
  /** débito − crédito. Puede ser negativo (reverso/ajuste), y es correcto. */
  netoCent: number;
  esIsr: boolean;
  /** No es plata que salió del banco (depreciación, faltantes, …). */
  sinSalidaDeCaja: boolean;
}

export interface ResumenMes {
  mes: string;
  estado: EstadoMes;
  /** Cuentas de operación (todo el grupo 6 MENOS el ISR), de mayor a menor. */
  cuentas: CuentaGasto[];
  /** El ISR, aparte, para pintarlo en su propia línea al final. */
  isr: CuentaGasto[];
  /** Gastos de operación, sin ISR. */
  totalOperacionCent: number;
  /** ISR del mes. */
  totalIsrCent: number;
  /** Operación + ISR. Es el número que cuadra con la contadora. */
  totalCent: number;
  /** Parte del total que NO salió del banco. */
  totalSinSalidaDeCajaCent: number;
  /** Salarios (6.01) partidos, cuando el dato lo permite. */
  salarios: { fijoCent: number; comisionesCent: number; otrosCent: number; totalCent: number };
  /** Nº de líneas del mes (de cualquier grupo). Distingue "vacío" de "sin gasto". */
  lineasTotal: number;
  /** Nº de líneas del grupo 6. */
  lineasGasto: number;
}

/** ¿Qué meses se trajeron de Switch? Cada rango es un `[desde, hasta]` ISO. */
export interface Cobertura {
  desde: string;
  hasta: string;
}

/** ¿El mes `YYYY-MM` cae COMPLETO dentro de algún rango traído? */
export function mesCubierto(mes: string, coberturas: Cobertura[]): boolean {
  const primero = `${mes}-01`;
  const ultimo = ultimoDiaDelMes(mes);
  return coberturas.some((c) => c.desde <= primero && c.hasta >= ultimo);
}

/** `"2026-02"` → `"2026-02-28"`. */
export function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(d).padStart(2, "0")}`;
}

/**
 * Resume UN mes a partir de sus líneas.
 *
 * `lineasDelMes` son TODAS las líneas del mes (de cualquier grupo), no solo las
 * de gasto: hacen falta para saber si el mes está cerrado.
 */
export function resumirMes(
  mes: string,
  lineasDelMes: MayorLinea[],
  coberturas: Cobertura[],
): ResumenMes {
  const estado: EstadoMes =
    lineasDelMes.length === 0
      ? mesCubierto(mes, coberturas)
        ? "sin_cerrar"
        : "sin_datos"
      : lineasDelMes.some(esAsientoDeCierre)
        ? "cerrado"
        : "parcial";

  // Agrupar el grupo 6 por CÓDIGO COMPLETO de 5 segmentos.
  const porCuenta = new Map<string, CuentaGasto>();
  for (const l of lineasDelMes) {
    if (!esGasto(l.cuenta)) continue;
    const prev = porCuenta.get(l.cuenta);
    if (prev) {
      prev.debitoCent += l.debitoCent;
      prev.creditoCent += l.creditoCent;
      prev.netoCent += l.netoCent;
      // El nombre puede venir vacío en alguna línea: quedarse con el primero útil.
      if (!prev.nombre && l.cuentaNombre) prev.nombre = l.cuentaNombre;
    } else {
      porCuenta.set(l.cuenta, {
        cuenta: l.cuenta,
        corta: cuentaCorta(l.cuenta),
        nombre: l.cuentaNombre,
        debitoCent: l.debitoCent,
        creditoCent: l.creditoCent,
        netoCent: l.netoCent,
        esIsr: esIsr(l.cuenta),
        sinSalidaDeCaja: esSinSalidaDeCaja(l.cuenta),
      });
    }
  }

  const todas = [...porCuenta.values()];
  // Orden: de mayor a menor gasto. Los negativos quedan al final, que es donde
  // se los quiere ver (son la excepción que hay que mirar).
  const porMonto = (a: CuentaGasto, b: CuentaGasto) => b.netoCent - a.netoCent;
  const cuentas = todas.filter((c) => !c.esIsr).sort(porMonto);
  const isr = todas.filter((c) => c.esIsr).sort(porMonto);

  const suma = (xs: CuentaGasto[]) => xs.reduce((acc, c) => acc + c.netoCent, 0);
  const totalOperacionCent = suma(cuentas);
  const totalIsrCent = suma(isr);

  const salarialesDe = (pred: (c: CuentaGasto) => boolean) => suma(todas.filter(pred));
  const salFijo = salarialesDe((c) => c.corta === CUENTA_SALARIO_FIJO);
  const salCom = salarialesDe((c) => c.corta === CUENTA_COMISIONES);
  const salTotal = salarialesDe((c) => esSalarial(c.cuenta));

  return {
    mes,
    estado,
    cuentas,
    isr,
    totalOperacionCent,
    totalIsrCent,
    totalCent: totalOperacionCent + totalIsrCent,
    totalSinSalidaDeCajaCent: suma(todas.filter((c) => c.sinSalidaDeCaja)),
    salarios: {
      fijoCent: salFijo,
      comisionesCent: salCom,
      otrosCent: salTotal - salFijo - salCom,
      totalCent: salTotal,
    },
    lineasTotal: lineasDelMes.length,
    lineasGasto: lineasDelMes.filter((l) => esGasto(l.cuenta)).length,
  };
}

// ── Avisos de la pantalla ────────────────────────────────────────────────────

export type TipoAviso = "salarios" | "isr" | "sin_caja" | "alquiler" | "incompleto";

export interface Aviso {
  tipo: TipoAviso;
  texto: string;
}

/**
 * Empresas donde el ALQUILER está descuadrado y Daniel ya lo sabe: Confecciones
 * Boston paga la factura completa y recibía plata de Fashion Wear; hasta que le
 * facture, Boston se ve peor y Fashion Wear mejor. NO se inventa prorrateo.
 */
export const AVISO_ALQUILER: Record<string, string> = {
  confecciones_boston:
    "Boston paga el alquiler completo y todavía no le ha facturado a Fashion Wear. Hasta que lo haga, acá el gasto se ve MÁS ALTO de lo que le toca.",
  fashion_wear:
    "El alquiler lo está pagando Boston y todavía no se lo ha facturado. Hasta que lo haga, acá el gasto se ve MÁS BAJO de lo que le toca.",
};

/**
 * Avisos de un mes ya resumido. `resumenAnterior` es el mes previo (para
 * comparar el ISR), o `null` si no lo tenemos.
 */
export function avisosDelMes(
  empresaKey: string,
  r: ResumenMes,
  resumenAnterior: ResumenMes | null,
): Aviso[] {
  const avisos: Aviso[] = [];

  if (r.estado === "parcial") {
    avisos.push({
      tipo: "incompleto",
      texto:
        "Este mes tiene movimientos pero la contadora no lo ha cerrado. El gasto que se ve está incompleto.",
    });
  }

  // Un mes cerrado de una empresa con planilla y sin UN SOLO peso de salarios
  // está incompleto, por más que la contadora lo haya cerrado.
  if (r.estado === "cerrado" && r.salarios.totalCent === 0) {
    avisos.push({
      tipo: "salarios",
      texto:
        "Este mes no tiene ni un peso de salarios. O falta el asiento de planilla, o los salarios se registran en otro lado. Falta confirmarlo con la contadora.",
    });
  }

  // El ISR no cae parejo: avisar cuando aparece o desaparece contra el mes previo.
  if (resumenAnterior && resumenAnterior.estado === "cerrado" && r.estado === "cerrado") {
    const hoy = r.totalIsrCent !== 0;
    const ayer = resumenAnterior.totalIsrCent !== 0;
    if (hoy && !ayer) {
      avisos.push({
        tipo: "isr",
        texto:
          "Este mes trae impuesto sobre la renta y el mes pasado no. No cae todos los meses, así que comparar los dos totales tal cual engaña.",
      });
    } else if (!hoy && ayer) {
      avisos.push({
        tipo: "isr",
        texto:
          "El mes pasado traía impuesto sobre la renta y este no. No cae todos los meses, así que comparar los dos totales tal cual engaña.",
      });
    }
  }

  if (r.totalSinSalidaDeCajaCent !== 0) {
    avisos.push({
      tipo: "sin_caja",
      texto:
        "Parte de este gasto no es plata que salió del banco (depreciación, faltantes de inventario y parecidos). Va en el total para cuadrar con la contadora, y está marcado en el detalle.",
    });
  }

  const alquiler = AVISO_ALQUILER[empresaKey];
  if (alquiler && r.estado === "cerrado") {
    avisos.push({ tipo: "alquiler", texto: alquiler });
  }

  return avisos;
}

// ── Utilidades de dinero ─────────────────────────────────────────────────────

/** Centavos enteros → dólares con 2 decimales exactos. */
export function centAUsd(cent: number): number {
  return Math.round(cent) / 100;
}
