// ============================================================================
// Marketing — EL GASTO. Módulo PURO (sin React, sin Supabase, sin fetch).
//
// Es el cimiento del rediseño de Marketing (22-sep-2026). Lo que Daniel
// definió ese día, en sus palabras y sin adornos:
//
//   · Tres tipos de gasto: la FACTURA del proveedor que hizo el trabajo
//     (Impresora Comercial, Premium Paint, Boston cuando fabrica — NUNCA la
//     marca), el MUEBLE que sale de su bodega y el PAGO MENSUAL de una
//     impulsadora.
//   · UNA marca por gasto, nunca se reparte. Medido: 108 de 108 facturas con
//     una sola; el «50 %» que se ve en la tabla es el modelo viejo «marca 50 /
//     Fashion Group 50», no un reparto entre dos marcas.
//   · La TIENDA es un dato del gasto (código del directorio, `clientes_master`)
//     y se BUSCA; no es la caja. Sin tienda → cajón «General». Medido: el 72 %
//     de lo abierto hoy no tiene tienda (impulsadoras, muebles de Boston).
//   · El PROYECTO SE VA. Daniel: *«a) Basta la tienda»*. Queda la tienda + una
//     nota libre de qué fue («Apertura», «Remodelación»).
//   · Interruptor «¿Se reporta a la marca?» en los TRES tipos, PRENDIDO por
//     defecto. Apagado: se guarda, se ve en la tienda marcado, no va al ZIP y
//     no suma. Daniel: *«hay gastos o muebles que son para tienda pero no
//     quiero reportar como gastos pero saber que existen»*.
//
// 🔴 DÓNDE VIVE CADA TIPO — una sola vez, acá (`TABLA_DE_TIPO`), igual que
// `TABLA_DE_MOTIVO` en Recordatorios. No hay una tabla nueva: la factura y el
// pago de impulsadora ya viven en `mk_facturas` (el pago es una fila con
// `impulsadora_id`), y el mueble en `mk_entregas_muebles`. Inventar una
// tercera tabla sería mover 17 pagos que ya están bien donde están.
//
// 🔴 `proyecto_id` NO aparece en este módulo a propósito, y hay candado. La
// columna se queda en la base (patrón `mayor_lineas`) pero ningún gasto nuevo
// decide su tienda por el proyecto: la tienda es SUYA.
// ============================================================================

/** Los tres tipos, en el orden en que se ofrecen. Lista CERRADA. */
export const TIPOS_DE_GASTO = ["factura", "mueble", "impulsadora"] as const;
export type TipoGasto = (typeof TIPOS_DE_GASTO)[number];

/** Las tablas donde cae un gasto. Las que EXISTEN hoy; ninguna nueva. */
export type TablaDeGasto = "mk_facturas" | "mk_entregas_muebles";

/**
 * 🔴 En qué tabla vive cada tipo. UNA sola vez.
 *
 * `impulsadora` cae en `mk_facturas` igual que `factura`: lo que los distingue
 * es la columna `impulsadora_id` (ver `tipoDeFila`). No se separa en dos tablas
 * porque los 17 pagos vivos ya están ahí y los reportes por año los leen de ahí.
 */
export const TABLA_DE_TIPO: Record<TipoGasto, TablaDeGasto> = {
  factura: "mk_facturas",
  mueble: "mk_entregas_muebles",
  impulsadora: "mk_facturas",
};

/** Rótulo de cada tipo, como se le dice a la persona. */
export const ROTULO_DE_TIPO: Record<TipoGasto, string> = {
  factura: "Factura de un proveedor",
  mueble: "Mueble de la bodega",
  impulsadora: "Pago de impulsadora",
};

/**
 * 🔴 El cajón de los gastos SIN tienda. Así se llama en pantalla, en el ZIP y
 * en los reportes; Daniel no lo cambió.
 */
export const TIENDA_GENERAL = "General";

/**
 * 🔴 «¿Se reporta a la marca?» nace PRENDIDO. Es el DEFAULT de la columna
 * (`se_reporta boolean NOT NULL DEFAULT true`) y el del formulario: lo que ya
 * existe no cambia, y lo nuevo se reporta salvo que alguien lo apague.
 */
export const SE_REPORTA_POR_DEFECTO = true;

/** Un gasto, con lo que el rediseño necesita saber de él. */
export interface Gasto {
  id: string;
  tipo: TipoGasto;
  /** Código de la marca (`mk_marcas.codigo`: TH · CK · KL · RBK · J). UNA. */
  marcaCodigo: string;
  /** Código del directorio (D-25). `null` = cajón «General». */
  tiendaCodigo: string | null;
  /** ¿Va al ZIP y suma en lo de la marca? */
  seReporta: boolean;
  /** Qué fue («Apertura», «Remodelación»). Libre y opcional. */
  nota: string | null;
  /** Total del gasto, en dólares. */
  monto: number;
  /** "YYYY-MM-DD" del documento (factura, entrega o período pagado). */
  fecha: string;
  /** Quien facturó. Vacío en un mueble. */
  proveedor: string;
}

/**
 * De qué tipo es una fila, mirando SOLO lo que la fila trae. Sirve para leer
 * lo que ya existe sin una columna nueva de «tipo».
 */
export function tipoDeFila(fila: {
  tabla: TablaDeGasto;
  impulsadora_id?: string | null;
}): TipoGasto {
  if (fila.tabla === "mk_entregas_muebles") return "mueble";
  return fila.impulsadora_id ? "impulsadora" : "factura";
}

/** ¿Es un tipo de la lista? Igualdad exacta, nunca por parecido. */
export function esTipoDeGasto(v: unknown): v is TipoGasto {
  return typeof v === "string" && (TIPOS_DE_GASTO as readonly string[]).includes(v);
}

/** El rótulo de la tienda de un gasto: su código o «General». */
export function rotuloTienda(tiendaCodigo: string | null | undefined): string {
  const c = String(tiendaCodigo ?? "").trim();
  return c.length > 0 ? c : TIENDA_GENERAL;
}

/**
 * `se_reporta` leído de la base: SOLO un `false` explícito apaga. `null` o
 * ausente (la migración sin correr) se lee como PRENDIDO, que es lo de hoy.
 */
export function seReportaDe(v: unknown): boolean {
  return v !== false;
}

// ─── UNA MARCA POR GASTO ─────────────────────────────────────────────────────

/** El error que frena un gasto con dos marcas. Con nombre, para reconocerlo. */
export class ErrorMarcaRepartida extends Error {
  readonly marcas: number;
  constructor(marcas: number) {
    super(
      marcas === 0
        ? "El gasto necesita una marca."
        : `Un gasto lleva UNA marca, no ${marcas}. Si es de dos marcas, se registra dos veces.`,
    );
    this.name = "ErrorMarcaRepartida";
    this.marcas = marcas;
  }
}

/**
 * 🔴 UN GASTO TIENE UNA MARCA. Recibe la lista de marcas que llegó con el
 * gasto y devuelve LA marca; con cero o con dos, lanza `ErrorMarcaRepartida`.
 *
 * Es la puerta que usan los tres lugares que escriben marcas (factura,
 * entrega, impulsadora). Medido antes de cerrarla: 108/108 facturas, 24/24
 * entregas y 2/2 impulsadoras con una sola marca — no frena a nadie hoy.
 */
export function exigirUnaMarca<T extends { marcaId: string }>(marcas: ReadonlyArray<T>): T {
  const distintas = new Map<string, T>();
  for (const m of marcas ?? []) {
    const id = String(m?.marcaId ?? "").trim();
    if (id.length > 0 && !distintas.has(id)) distintas.set(id, m);
  }
  if (distintas.size !== 1) throw new ErrorMarcaRepartida(distintas.size);
  return distintas.values().next().value as T;
}

// ─── VALIDACIÓN DEL GASTO ────────────────────────────────────────────────────

/** Lo que llega del formulario, antes de guardarse. */
export interface GastoNuevo {
  tipo: unknown;
  marcaCodigo: unknown;
  /** `null`/vacío = General. */
  tiendaCodigo?: unknown;
  /** Si el formulario dijo «es de una tienda», la tienda es obligatoria. */
  esDeTienda?: boolean;
  seReporta?: unknown;
  nota?: unknown;
  monto: unknown;
  fecha: unknown;
}

/**
 * Qué le falta a un gasto para poder guardarse. Vacío = nada. Cada mensaje
 * dice qué falta y en español simple, para ponerlo al lado del botón.
 */
export function faltantesDelGasto(g: GastoNuevo): string[] {
  const faltan: string[] = [];
  if (!esTipoDeGasto(g.tipo)) faltan.push("Elige qué tipo de gasto es.");
  if (String(g.marcaCodigo ?? "").trim().length === 0) faltan.push("Elige la marca.");
  const tienda = String(g.tiendaCodigo ?? "").trim();
  if (g.esDeTienda === true && tienda.length === 0) {
    faltan.push("Elige la tienda del directorio.");
  }
  const monto = Number(g.monto);
  if (!Number.isFinite(monto) || monto <= 0) faltan.push("Escribe el monto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(g.fecha ?? ""))) faltan.push("Pon la fecha.");
  return faltan;
}

/**
 * Arma el gasto listo para guardar, con los DEFAULT del rediseño puestos:
 * `seReporta` prendido salvo un `false` explícito, tienda vacía = `null`
 * (General), nota recortada o `null`.
 *
 * 🔴 No hay `proyectoId` en la salida ni en la entrada: la tienda es del gasto.
 */
export function armarGasto(
  g: GastoNuevo & { id: string; proveedor?: unknown },
): Gasto {
  const faltan = faltantesDelGasto(g);
  if (faltan.length > 0) throw new Error(faltan.join(" "));
  const tienda = String(g.tiendaCodigo ?? "").trim();
  const nota = String(g.nota ?? "").replace(/\s+/g, " ").trim();
  return {
    id: String(g.id),
    tipo: g.tipo as TipoGasto,
    marcaCodigo: String(g.marcaCodigo).trim().toUpperCase(),
    tiendaCodigo: tienda.length > 0 ? tienda.toUpperCase() : null,
    seReporta: seReportaDe(g.seReporta),
    nota: nota.length > 0 ? nota : null,
    monto: Math.round(Number(g.monto) * 100) / 100,
    fecha: String(g.fecha),
    proveedor: String(g.proveedor ?? "").replace(/\s+/g, " ").trim(),
  };
}
