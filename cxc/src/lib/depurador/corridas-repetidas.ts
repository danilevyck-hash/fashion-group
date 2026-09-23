// ─────────────────────────────────────────────────────────────────────────────
// EL HISTORIAL MARCA LA DESCARGA REPETIDA (23-sep-2026)
//
// 🩸 Medido el 23-sep-2026 contra producción (`carga_history`, 150 corridas
// entre el 25-jun y el 22-sep): **24 repiten marca, estilos y piezas dentro de
// la hora anterior**. Una de cada seis. La secretaria baja el Excel, ve algo
// que no le gusta, corrige y lo vuelve a bajar — y al día siguiente el
// Historial muestra las dos filas iguales sin decir cuál se subió a Switch.
//
// 🔴 NO SE BORRA NI SE ESCONDE NADA. Las dos filas siguen ahí, con su botón de
// «Descargar». Lo único que se agrega es que la vieja se ve en gris con un chip
// «repetida» y la última de la serie lleva «la última».
//
// 🔴 IGUALDAD EXACTA, NUNCA POR PARECIDO. Misma marca (el texto tal cual lo
// guardó la corrida), mismos estilos y mismas piezas. Una corrida con una pieza
// de diferencia es OTRA corrida, y decirle «repetida» sería mentir.
//
// Módulo PURO: sin DOM, sin red. Solo lectura — no escribe en la base.
// ─────────────────────────────────────────────────────────────────────────────

/** La ventana en la que dos descargas iguales son la misma corrida. */
export const MINUTOS_REPETIDA = 60;

export interface CorridaComparable {
  id: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  /** ISO, tal cual lo sirve el Historial. */
  created_at: string;
}

/** `"repetida"` = quedó atrás · `"ultima"` = la última de una serie repetida ·
 *  `null` = corrida sola, no se marca nada. */
export type MarcaDeRepeticion = "repetida" | "ultima" | null;

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

/** ¿Estas dos corridas son la misma, hechas uno detrás de la otra? PURA.
 *  `vieja` tiene que ser la más antigua de las dos. */
export function esRepeticion(vieja: CorridaComparable, nueva: CorridaComparable): boolean {
  if (vieja.marca !== nueva.marca) return false;
  if (vieja.cantidad_estilos !== nueva.cantidad_estilos) return false;
  if (vieja.total_unidades !== nueva.total_unidades) return false;
  const a = ms(vieja.created_at);
  const b = ms(nueva.created_at);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const minutos = (b - a) / 60000;
  return minutos >= 0 && minutos <= MINUTOS_REPETIDA;
}

/**
 * Qué chip lleva cada corrida, por `id`.
 *
 * Se recorre de la más vieja a la más nueva. Dos corridas seguidas que son la
 * misma forman una serie; la serie puede tener tres o más (medido: «CK Jeans»
 * el 29-jun salió tres veces en una hora). En una serie, todas menos la última
 * son «repetida» y la última es «la última». Una corrida sola no lleva chip.
 *
 * ⚠️ El empate de fecha se desempata por `id` para que el resultado sea el
 * mismo siempre, sin depender del orden en que llegaron las filas.
 */
export function marcarRepetidas(
  corridas: readonly CorridaComparable[],
): Map<string, MarcaDeRepeticion> {
  const out = new Map<string, MarcaDeRepeticion>();
  for (const c of corridas) out.set(c.id, null);

  const viejasPrimero = [...corridas].sort((a, b) => {
    const d = ms(a.created_at) - ms(b.created_at);
    if (Number.isFinite(d) && d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let i = 0;
  while (i < viejasPrimero.length) {
    let fin = i;
    while (fin + 1 < viejasPrimero.length && esRepeticion(viejasPrimero[fin], viejasPrimero[fin + 1])) fin++;
    if (fin > i) {
      for (let k = i; k < fin; k++) out.set(viejasPrimero[k].id, "repetida");
      out.set(viejasPrimero[fin].id, "ultima");
    }
    i = fin + 1;
  }
  return out;
}

/** Los rótulos, en un solo lugar. */
export const CHIP_REPETIDA = "repetida";
export const CHIP_ULTIMA = "la última";
