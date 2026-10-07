// ============================================================================
// Marketing › SOLO LO COBRABLE (7-oct-2026) — EL INTERRUPTOR, APAGADO.
//
// Daniel: «Quiero poder registrar todo lo cobrable a las marcas, de manera
// ordenada, minimalista. Solo lo cobrable. Es escoger la factura, a qué marca
// va el gasto, a qué cliente se le hizo».
//
// Con `MKT_SOLO_COBRABLE_2026_10 = true`:
//   1. REGISTRAR — la factura de un proveedor se registra en UNA pantalla, en
//      el orden del trabajo: el comprobante (la IA llena los datos) → Marca →
//      Tienda (obligatoria: «cada factura va a una tienda, no a varias») → Se
//      cobra 100 % · 50 %. Sin «A cargo de la empresa», sin «Se reporta a la
//      marca», sin pedir el comprobante dos veces y sin asteriscos. Al EDITAR,
//      «Se cobra» suma «No recuperable»: así Daniel pasa él mismo una factura
//      ya cargada (las de Boston, la #145) fuera de la marca y del ZIP.
//   2. EL ZIP — la carpeta sale de lo elegido: la tienda, «Impulsadoras» o
//      «Mobiliario y exhibición» (la entrega). Ya no se adivina por el texto
//      del concepto. Las facturas viejas sin tienda no se tocan: las 4 que esa
//      regla mandaba a «Mobiliario y exhibición» siguen ahí, por su id; otra
//      cualquiera sin tienda cae en «General», el cajón de siempre.
//   3. LA PORTADA abre en Marcas: una fila por marca con lo pendiente del
//      período abierto, ya con el 50 % aplicado, sin las marcas vacías.
//   4. NO RECUPERABLE — una pestaña al final, solo de consulta, con lo que ya
//      existe y no se le cobra a nadie (Multi Fashion, la #145). No suma a
//      ninguna marca ni entra a ningún ZIP.
//
// 🔴 NO SE MUEVE NI UNA FILA. Es pantalla y papel: nada de lo guardado cambia.
// Apagado, todo es la pantalla de hoy, byte por byte (candado
// `marketing-solo-cobrable-2026-10`).
// ============================================================================

/** 🔴 El interruptor. APAGADO hasta que Daniel lo vea y diga «sí». */
export const MKT_SOLO_COBRABLE_2026_10 = false;

// ─── 1 · REGISTRAR ──────────────────────────────────────────────────────────

/** Cuánto se le cobra a la marca. Solo dos respuestas: lo no cobrable no entra. */
export const PCT_QUE_SE_COBRA = [100, 50] as const;
export type PctQueSeCobra = (typeof PCT_QUE_SE_COBRA)[number];

/** La tienda del cargo: un código del directorio, o nada todavía. Obligatoria. */
export type TiendaDelCargo = { codigo: string; nombre: string } | null;

export interface DestinoDelCargo {
  marcaId: string;
  tienda: TiendaDelCargo;
  /** `null` = todavía no se eligió: es decisión de una persona (diseno.md, regla 4). */
  pct: PctQueSeCobra | null;
}

/**
 * Qué falta del destino para guardar. Sale al tocar Guardar, todo junto
 * (diseno.md, regla 7). Multi Fashion es tienda propia: no se le cobra a
 * ninguna marca, así que no entra por esta puerta.
 */
export function faltaEnElDestino(
  d: DestinoDelCargo,
  esTiendaPropia: (codigo: string) => boolean,
): string[] {
  const out: string[] = [];
  if (d.marcaId.trim() === "") out.push("la marca");
  if (d.tienda === null) out.push("la tienda");
  else if (esTiendaPropia(d.tienda.codigo)) {
    out.push("una tienda cobrable (Multi Fashion es tienda propia)");
  }
  if (d.pct === null) out.push("cuánto se cobra");
  return out;
}

/** El código que se guarda, en mayúsculas (la misma columna de siempre). */
export function tiendaQueSeGuarda(t: TiendaDelCargo): string | null {
  if (t === null) return null;
  const c = t.codigo.trim().toUpperCase();
  return c.length > 0 ? c : null;
}

// ─── 2 · LA CARPETA DEL ZIP ─────────────────────────────────────────────────

/**
 * 🔴 LAS FACTURAS VIEJAS SIN TIENDA, CONGELADAS POR ID (medido en producción
 * el 7-oct-2026, solo lectura). Son las 4 de Confecciones Boston («Muebles» ×3,
 * «Tazas» ×1, $21,870.80) que la regla por concepto mandaba a «Mobiliario y
 * exhibición». Siguen cayendo ahí sin tocar la base. La quinta sin tienda, la
 * #145, no es cobrable y no entra a ningún ZIP. Cuando Daniel las pase a
 * «No recuperable», salen del ZIP solas y esta lista queda sin efecto.
 */
export const FACTURAS_SIN_TIENDA_DE_MOBILIARIO = new Set<string>([
  "a76a1606-fbfa-4321-bee4-a8aac787930c", // 11-00007766 · Muebles
  "f60ad102-cfc4-4e0e-955d-040c14136f6e", // 11-000007766 · Tazas
  "31696b75-22d3-4261-93e7-6fb12731a07c", // 11-0000007756 · Muebles
  "4123aefb-f38c-4651-ab3b-ea4f2fbc4a45", // 00000007757 · Muebles
]);

/**
 * La carpeta de una FACTURA sin tienda y sin impulsadora, con el interruptor
 * prendido. Desde el registro nuevo ya no nace ninguna (la tienda es
 * obligatoria): solo llegan las viejas. Sin adivinar: o es una de las 4 de
 * mobiliario, o va al cajón de siempre.
 */
export function carpetaDeFacturaSinTienda(
  documentoId: string | null | undefined,
  carpetas: { mobiliario: string; general: string },
): string {
  return FACTURAS_SIN_TIENDA_DE_MOBILIARIO.has(String(documentoId ?? "").trim())
    ? carpetas.mobiliario
    : carpetas.general;
}

// ─── 3 · LA PORTADA ─────────────────────────────────────────────────────────

/**
 * Lo que se le cobra a la marca de una factura: el total con su porcentaje.
 * `null` (las 106 de siempre) = 100 %. `0` = no se cobra.
 */
export function montoCobrable(total: number, pct: number | null | undefined): number {
  const p = pct === null || pct === undefined ? 100 : Number(pct);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.round(total * Math.min(p, 100)) / 100;
}

/**
 * Las filas de la portada: solo las marcas con algo pendiente (KL y Reebok,
 * que nunca tuvieron un gasto, no salen), de la que más se le cobra a la que
 * menos. Las marcas NO se suman entre sí: no hay total de la lista.
 */
export function porCobrar<T extends { cantidadReportada: number; reportado: number }>(
  filas: ReadonlyArray<T>,
): T[] {
  return filas
    .filter((f) => f.cantidadReportada > 0 || f.reportado > 0)
    .sort((a, b) => b.reportado - a.reportado);
}

/** «21 gastos · desde 12 ago 2026»: cuántos y desde cuándo está abierto. */
export function subtituloPorCobrar(
  gastos: number,
  abiertoEn: string | null | undefined,
  formatearFecha: (iso: string) => string,
): string {
  const partes = [`${gastos} ${gastos === 1 ? "gasto" : "gastos"}`];
  const desde = abiertoEn ? formatearFecha(abiertoEn) : "";
  if (desde) partes.push(`desde ${desde}`);
  return partes.join(" · ");
}

// ─── 4 · NO RECUPERABLE ─────────────────────────────────────────────────────

export const PESTANA_NO_RECUPERABLE = "no-recuperable" as const;
export const ROTULO_NO_RECUPERABLE = "No recuperable";

export type MotivoNoRecuperable = "tienda-propia" | "a-cargo-de-la-empresa" | "no-se-reporta";

export const ROTULO_MOTIVO: Readonly<Record<MotivoNoRecuperable, string>> = {
  "tienda-propia": "Tienda propia",
  "a-cargo-de-la-empresa": "A cargo de la empresa",
  "no-se-reporta": "No se reporta",
};

/** Por qué un gasto no se le cobra a nadie. `null` = sí es cobrable. */
export function motivoNoRecuperable(g: {
  esTiendaPropia: boolean;
  pctALaMarca?: number | null;
  seReporta?: boolean | null;
}): MotivoNoRecuperable | null {
  if (g.esTiendaPropia) return "tienda-propia";
  if (g.pctALaMarca === 0) return "a-cargo-de-la-empresa";
  if (g.seReporta === false) return "no-se-reporta";
  return null;
}

export interface FilaNoRecuperable {
  id: string;
  tipo: "factura" | "entrega";
  fecha: string;
  numero: string;
  proveedor: string;
  concepto: string;
  tiendaCodigo: string | null;
  tiendaNombre: string;
  motivo: MotivoNoRecuperable;
  total: number;
}

/** Las filas de la lista: la más nueva arriba, y el pie. */
export function ordenarNoRecuperables(filas: ReadonlyArray<FilaNoRecuperable>): {
  filas: FilaNoRecuperable[];
  total: number;
} {
  const orden = [...filas].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const total = Math.round(orden.reduce((s, f) => s + f.total, 0) * 100) / 100;
  return { filas: orden, total };
}

// ─── LAS PESTAÑAS ───────────────────────────────────────────────────────────

/**
 * La barra de la portada. Prendido: abre en Marcas (la pregunta es cuánto se
 * le cobra a cada una), Tiendas pasa a segunda y «No recuperable» va al final,
 * para que nadie cambie de aterrizaje en las demás. Apagado: la de hoy.
 */
export function pestanasDeLaPortada<P extends string>(
  deHoy: ReadonlyArray<P>,
  encendido: boolean,
): ReadonlyArray<P | typeof PESTANA_NO_RECUPERABLE> {
  if (!encendido) return deHoy;
  const sinMarcas = deHoy.filter((p) => p !== "marcas");
  const marcas = deHoy.filter((p) => p === "marcas");
  return [...marcas, ...sinMarcas, PESTANA_NO_RECUPERABLE];
}

// ─── PROVEEDORES › RECOBRADO ────────────────────────────────────────────────

/**
 * Las facturas selladas a un período CERRADO: esas ya se cobraron (Daniel,
 * 7-oct-2026). Con eso «Recobrado» deja de decir $0 en todos los proveedores.
 */
export function facturasEnPeriodoCerrado(
  periodos: ReadonlyArray<{ id: string; estado: string | null }>,
  sellos: ReadonlyArray<{ periodo_id: string; tipo: string | null; documento_id: string }>,
): Set<string> {
  const cerrados = new Set(periodos.filter((p) => p.estado === "cerrado").map((p) => String(p.id)));
  const out = new Set<string>();
  for (const s of sellos) {
    if (s.tipo !== "factura") continue;
    if (cerrados.has(String(s.periodo_id))) out.add(String(s.documento_id));
  }
  return out;
}

// ─── CERRAR EL PERÍODO: LAS TIENDAS SIN FOTO ────────────────────────────────

/**
 * Las tiendas del período que no tienen ni una foto. Cuenta la foto sellada a
 * ESTE período y la que no tiene sello (la de antes del sello, que se ve en
 * «Abierto»). Es un AVISO al cerrar: nunca frena el cierre.
 */
export function tiendasSinFoto(
  tiendas: ReadonlyArray<string>,
  fotos: ReadonlyArray<{ tienda_codigo: string | null; periodo_id: string | null }>,
  periodoId: string,
): string[] {
  const conFoto = new Set(
    fotos
      .filter((f) => f.periodo_id === null || f.periodo_id === periodoId)
      .map((f) => String(f.tienda_codigo ?? "").trim().toUpperCase()),
  );
  return tiendas.filter((t) => !conFoto.has(t.trim().toUpperCase()));
}
