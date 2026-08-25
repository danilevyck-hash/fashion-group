// ═══════════════════════════════════════════════════════════════════════════
//   LO QUE EL GUARD DEJÓ AFUERA, DICHO EN PANTALLA — fuente ÚNICA del texto.
// ═══════════════════════════════════════════════════════════════════════════
//
// 🩸 POR QUÉ EXISTE. El guard de montos (`switch-api/monto-guard.ts`) frena las
// cifras imposibles que manda Switch para que no envenenen los totales, el
// margen y las comisiones. Hasta hoy eso pasaba **en silencio**: la cartera de
// Boston decía $198.296,55 y nadie podía saber que un documento se había
// quedado afuera. Daniel, textual: *"no debería de ser así, el sistema debe de
// mostrar la info tal cual"*.
//
// La salida elegida (24-ago-2026) es **el total real + decir qué se dejó
// afuera**, en TODAS las empresas y EN PANTALLA:
//
//   $198.296,55
//   ⚠ 1 documento fuera de la cuenta: el 155-000000129 llega con
//     $266.541.352,00. Está mal en Switch.
//
// ⚠️ LO QUE **NO** CAMBIA: el guard sigue rechazando igual. La cifra imposible
// NO entra a la base. Se descartó explícitamente mostrar el dato crudo: la
// cartera de Boston pasaría a $266.739.648,55 y dejaría de servir para cobrar.
// Boston sigue SIN aviso de Telegram (`SIN_AVISO_DE_MONTOS`); lo que gana es
// esta línea. Las demás empresas conservan su Telegram.
//
// ── UN SOLO LUGAR ARMA EL TEXTO ──────────────────────────────────────────────
// La línea va en varias pantallas. Si cada una escribiera su mensaje, la que
// quedara vieja diría otra cosa que las demás — el modo de fallo con el que
// este repo ya se quemó (13 copias del guard de montos, julio-2026). Acá vive
// la lectura Y la redacción; las pantallas solo reciben un string.
//
// ── SI NO HAY NADA RECHAZADO, NO SE DIBUJA NADA ──────────────────────────────
// `textoDeRechazos([])` devuelve `null` a propósito. Un cartel permanente se
// deja de leer a la semana.
//
// ── VENTANA DE 7 DÍAS, LA MISMA QUE EL ANTI-LOOP ─────────────────────────────
// Se miran las corridas EXITOSAS de los últimos 7 días. Es la misma ventana que
// usa el anti-loop del aviso de Telegram, así que el sistema tiene UN solo
// concepto de "reciente". Consecuencia buscada: si el dato se corrige en
// Switch, la línea se apaga sola dentro de la semana, sin que nadie toque nada.
//
// Costo medido (25-ago-2026, producción): **1 consulta, 384 ms**, sobre una
// tabla de 7.680 filas y con `records_skipped > 0` en el filtro — el resultado
// real fueron 3 filas. No hace falta índice nuevo ni DDL.

import {
  GUARDS,
  campoSkip,
  fmtMonto,
  MONTO_DIAS_ENTRE_AVISOS,
  type FamiliaMonto,
} from "@/lib/switch-api/monto-guard";

/** Un documento que Switch mandó con una cifra imposible y el guard dejó afuera. */
export interface RechazoDeSwitch {
  familia: FamiliaMonto;
  empresaKey: string;
  /** El identificador que ve el usuario: secuencial de la factura, SKU, fecha. */
  documento: string;
  /** El monto más grande de la fila. Es el que hace evidente que es imposible. */
  monto: number;
  /** Cuándo se detectó (la corrida que lo rechazó). */
  cuando: string;
}

/**
 * Cómo se nombra cada familia EN LA LÍNEA. No son nombres de tabla: son las
 * palabras que Daniel usa. El género importa porque la línea dice "el 155-…"
 * o "la 11-…".
 */
const PALABRAS: Readonly<
  Record<FamiliaMonto, { uno: string; varios: string; el: string; donde: string }>
> = {
  cxc: { uno: "documento", varios: "documentos", el: "el", donde: "fuera de la cuenta" },
  factura: { uno: "factura", varios: "facturas", el: "la", donde: "fuera de la cuenta" },
  utilidad: { uno: "factura", varios: "facturas", el: "la", donde: "fuera de la cuenta" },
  recibo: { uno: "cobro", varios: "cobros", el: "el", donde: "fuera de la cuenta" },
  proveedor: { uno: "proveedor", varios: "proveedores", el: "el", donde: "fuera de la cuenta" },
  producto: { uno: "producto", varios: "productos", el: "el", donde: "fuera del catálogo" },
  costo_diario: { uno: "día", varios: "días", el: "el", donde: "fuera de la cuenta" },
  articulo_diario: { uno: "artículo", varios: "artículos", el: "el", donde: "fuera de la cuenta" },
  articulo_info: { uno: "artículo", varios: "artículos", el: "el", donde: "fuera de la cuenta" },
  egreso_vario: { uno: "egreso", varios: "egresos", el: "el", donde: "fuera de la cuenta" },
};

/** Cuando la pantalla mezcla familias, no se puede decir "documento" ni "factura". */
const MEZCLA = { uno: "dato", varios: "datos", el: "el", donde: "fuera de la cuenta" };

/**
 * Qué `sync_type` escribe cada familia. Sirve para que la consulta pida SOLO
 * las corridas que pueden traer lo que la pantalla necesita, en vez de barrer
 * el log entero.
 */
const SYNC_TYPES: Readonly<Record<FamiliaMonto, readonly string[]>> = {
  cxc: ["estadocuenta"],
  factura: ["facturas"],
  utilidad: ["utilidad"],
  recibo: ["recibos"],
  proveedor: ["proveedores"],
  producto: ["catalogo_reebok", "catalogo_joybees", "catalogo_tommy", "catalogo_calvin"],
  costo_diario: ["costo"],
  articulo_diario: ["articulos"],
  articulo_info: ["articulo_info"],
  egreso_vario: ["egresos_varios"],
};

/** Lo que el guard guardó en `switch_sync_log.skip_details`. */
interface FilaSkip {
  campo?: unknown;
  secuencial?: unknown;
  valorCrudo?: unknown;
}

/**
 * El monto que se muestra: el MAYOR en magnitud de las columnas que reventaron.
 * Es el que hace obvio que la cifra es imposible; mostrar la más chica dejaría
 * al lector preguntándose por qué se rechazó.
 */
function montoDeLaFila(valorCrudo: unknown): number | null {
  if (!valorCrudo || typeof valorCrudo !== "object") return null;
  const columnas = (valorCrudo as { columnas?: unknown }).columnas;
  if (!Array.isArray(columnas)) return null;
  let mayor: number | null = null;
  for (const c of columnas) {
    const v = Number((c as { valor?: unknown })?.valor);
    if (!Number.isFinite(v)) continue;
    if (mayor === null || Math.abs(v) > Math.abs(mayor)) mayor = v;
  }
  return mayor;
}

/**
 * El identificador que ve el usuario. La clave que guarda el guard trae el
 * documento y, cuando existe, el cliente pegado con " · ". En pantalla ya se
 * sabe de qué cliente se trata (o no cabe), así que se muestra solo el
 * documento — la línea tiene que ser UNA línea.
 */
function documentoDeLaClave(secuencial: unknown): string | null {
  if (typeof secuencial !== "string") return null;
  const doc = secuencial.split("·")[0].trim();
  return doc.length > 0 ? doc : null;
}

/** Supabase perezoso: este módulo lo importan pantallas que ya tienen su cliente. */
async function db() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  return supabaseServer;
}

/**
 * Los rechazos vigentes de las familias que le importan a UNA pantalla.
 *
 * **Fail-open al silencio**: si la consulta falla, se devuelve vacío y la
 * pantalla no dibuja nada. Un error de lectura no puede inventar un aviso ni
 * romper la pantalla que muestra el total — el total es lo que importa.
 */
export async function rechazosDeSwitch(opts: {
  familias: readonly FamiliaMonto[];
  /** Si se pasa, solo estas empresas. Sin esto, todas. */
  empresas?: readonly string[];
}): Promise<RechazoDeSwitch[]> {
  const { familias, empresas } = opts;
  if (familias.length === 0) return [];

  const tipos = [...new Set(familias.flatMap((f) => SYNC_TYPES[f]))];
  const campos = new Map(familias.map((f) => [campoSkip(f), f]));
  const desde = new Date(Date.now() - MONTO_DIAS_ENTRE_AVISOS * 86_400_000).toISOString();

  let filas: Array<{ empresa_key: string; started_at: string; skip_details: unknown }>;
  try {
    const supabase = await db();
    let q = supabase
      .from("switch_sync_log")
      .select("empresa_key,started_at,skip_details")
      .eq("status", "success")
      .gt("records_skipped", 0)
      .gte("started_at", desde)
      .in("sync_type", tipos);
    if (empresas && empresas.length > 0) q = q.in("empresa_key", empresas);
    const { data, error } = await q.order("started_at", { ascending: false }).limit(100);
    if (error || !data) return [];
    filas = data as unknown as typeof filas;
  } catch {
    return [];
  }

  // Ordenadas de nueva a vieja: la primera vez que aparece un documento es la
  // detección más reciente, y es la que vale.
  const vistos = new Set<string>();
  const salida: RechazoDeSwitch[] = [];
  for (const fila of filas) {
    if (!Array.isArray(fila.skip_details)) continue;
    for (const d of fila.skip_details as FilaSkip[]) {
      const familia = campos.get(String(d?.campo));
      if (!familia) continue;
      const documento = documentoDeLaClave(d?.secuencial);
      const monto = montoDeLaFila(d?.valorCrudo);
      if (documento === null || monto === null) continue;
      const llave = `${fila.empresa_key}·${documento}`;
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      salida.push({
        familia,
        empresaKey: fila.empresa_key,
        documento,
        monto,
        cuando: fila.started_at,
      });
    }
  }
  return salida;
}

/**
 * LA LÍNEA. Una sola, sin párrafos — Daniel: *"no siempre hay q estar
 * explicando todo, se vuelve tedioso"*.
 *
 *   1 documento fuera de la cuenta: el 155-000000129 llega con
 *   $266.541.352,00. Está mal en Switch.
 *
 * Con varios, se nombra el más grande y se cuenta el resto. Devuelve `null`
 * cuando no hay nada que decir: **si no hay rechazos, no se dibuja nada.**
 */
export function textoDeRechazos(rechazos: readonly RechazoDeSwitch[]): string | null {
  if (rechazos.length === 0) return null;

  const familias = new Set(rechazos.map((r) => r.familia));
  const p = familias.size === 1 ? PALABRAS[[...familias][0]] : MEZCLA;

  // El más grande primero: es el que explica solo por qué hubo que dejarlo
  // afuera, y el que alguien va a querer buscar en Switch.
  const ordenados = [...rechazos].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
  const primero = ordenados[0];
  const resto = ordenados.length - 1;

  const cuantos = ordenados.length === 1 ? `1 ${p.uno}` : `${ordenados.length} ${p.varios}`;
  const yMas = resto > 0 ? ` y ${resto} más` : "";
  return (
    `${cuantos} ${p.donde}: ${p.el} ${primero.documento} llega con ` +
    `${fmtMonto(primero.monto)}${yMas}. Está mal en Switch.`
  );
}

/**
 * Atajo para las pantallas: leer y redactar en un paso. Devuelve `null` cuando
 * no hay nada que mostrar, que es el caso normal.
 */
export async function lineaDeRechazos(opts: {
  familias: readonly FamiliaMonto[];
  empresas?: readonly string[];
}): Promise<string | null> {
  return textoDeRechazos(await rechazosDeSwitch(opts));
}

/** Las familias que existen, para que las pantallas no inventen nombres. */
export const FAMILIAS = Object.keys(GUARDS) as FamiliaMonto[];
