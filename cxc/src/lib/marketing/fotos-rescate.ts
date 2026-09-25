// ============================================================================
// Marketing — UNA MARCA POR ARCHIVO, AL RESCATAR FOTOS HUÉRFANAS (24-sep-2026).
// Módulo PURO: sin Supabase, sin fetch, sin React.
//
// 🩸 El rescate aceptaba `--marca` / `--periodo` UNA vez por corrida, y los
// cuatro archivos huérfanos de D-118 no son de la misma marca: dos son de
// Tommy y dos de Calvin. Con un solo valor global, o se sellaban los cuatro
// mal, o había que correrlo dos veces borrando a mano en el medio.
//
// 🔴 EL MAPA MANDA, EL GLOBAL ES EL RESPALDO. `--archivo=<nombre>:<marca>` se
// puede repetir; para cada archivo se pregunta primero al mapa y solo después
// se mira el valor global. El archivo que no está en el mapa y no tiene valor
// global se SALTA y se dice — nunca se adivina.
//
// 🔴 EL PAREO ES EXACTO, NUNCA POR PARECIDO: se compara el nombre del archivo
// en el cajón (el último tramo del path) contra la llave, tal cual.
//
// 🔴 QUÉ MARCA ES sigue decidiéndolo `destinoDeFotoNueva` en `fotos-periodo.ts`.
// Acá solo se resuelve QUÉ VALOR le toca a cada archivo: ninguna regla de
// período se escribe dos veces.
// ============================================================================

/** La bandera repetible del script de rescate. */
export const BANDERA_ARCHIVO = "--archivo";

/** Lo que se dice del archivo que nadie eligió y que no tiene valor global. */
export const AVISO_ARCHIVO_SIN_ELEGIR =
  "sin marca elegida para este archivo — se salta. Agrega `--archivo=<nombre>:<marca>`.";

/** El último tramo de un path del cajón: `tienda/D-118/1790_x.jpeg` → `1790_x.jpeg`. */
export function nombreEnElCajon(pathOArchivo: string | null | undefined): string {
  const s = String(pathOArchivo ?? "").trim();
  if (!s) return "";
  return s.slice(s.lastIndexOf("/") + 1);
}

/**
 * El mapa `archivo → marca elegida`, leído de los `--archivo=<nombre>:<valor>`
 * de la línea de comandos. Se aceptan las dos grafías (`--archivo=a:b` y
 * `--archivo a:b`) y el valor puede ser la clave de la marca o el id del
 * período: para la regla pura da lo mismo.
 *
 * El valor se corta en el ÚLTIMO `:` — así un nombre de archivo con dos
 * puntos adentro no rompe el pareo. Sin nombre o sin valor, la entrada se
 * ignora; repetida, manda la ÚLTIMA.
 */
export function mapaDeArchivosElegidos(args: ReadonlyArray<string>): Map<string, string> {
  const mapa = new Map<string, string>();
  const guardar = (crudo: string) => {
    const s = String(crudo ?? "").trim();
    const corte = s.lastIndexOf(":");
    if (corte <= 0) return;
    const nombre = nombreEnElCajon(s.slice(0, corte));
    const valor = s.slice(corte + 1).trim();
    if (!nombre || !valor) return;
    mapa.set(nombre, valor);
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i] ?? "");
    if (a.startsWith(`${BANDERA_ARCHIVO}=`)) {
      guardar(a.slice(BANDERA_ARCHIVO.length + 1));
      continue;
    }
    if (a === BANDERA_ARCHIVO) {
      guardar(String(args[i + 1] ?? ""));
      i += 1;
    }
  }
  return mapa;
}

/**
 * 🔴 EL VALOR QUE LE TOCA A UN ARCHIVO: primero el mapa, después el global.
 * Vacío = nadie eligió (y con dos marcas abiertas eso se salta y se dice).
 */
export function elegidoParaArchivo(
  mapa: ReadonlyMap<string, string>,
  pathDelArchivo: string,
  global: string | null | undefined,
): string {
  const delMapa = mapa.get(nombreEnElCajon(pathDelArchivo));
  if (delMapa) return delMapa;
  return String(global ?? "").trim();
}
