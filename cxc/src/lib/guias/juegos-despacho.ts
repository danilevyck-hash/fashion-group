// ─────────────────────────────────────────────────────────────────────────────
// LOS ÚLTIMOS DESPACHOS DE ESTE TRANSPORTISTA — recibido por + cédula + placa,
// de un toque.
//
// Daniel, textual: *«Sí quiero»*.
//
// 🩸 EL BENEFICIO GRANDE NO ES EL TECLEO: ES QUE EL MISMO DATO DEJE DE
// GUARDARSE DE DOS FORMAS. Hoy los tres campos se escriben a mano, en blanco,
// en cada despacho —tres campos × ~3 guías por día, en un teléfono— y el
// resultado, medido sobre las 186 guías vivas de producción:
//
//   · la MISMA cédula guardada como `810102403` (5 veces) y `8-1010-2403` (4)
//   · `8-918-246` (7) y `8918246` (3) · `172744` (4) y `1-727-44` (4)
//   · el MISMO receptor como `Jocsan murillo` (5) y `Jocsan` (5),
//     `Aníbal arauz` (5) y `Anibal arauz` (2), `Alan` (8) y `alan` (1)
//   · y la placa `DG7115` (11 veces) convivía con un `Dg7738` en GT-202
//
// O sea: no hay forma de agrupar por chofer. Si el juego se TOMA de una guía
// anterior, sale escrito igual que la vez pasada, y el dato converge solo.
//
// 🔴 SE MUESTRA, NO SE ESCRIBE SOLO. Es una lista de hasta 3 juegos; tocar uno
// llena los tres campos, que siguen siendo editables y no obligatorios. Nada se
// traba y nada se adivina.
//
// ⚠️ EN ENTREGA DIRECTA NO APLICA: no hay transportista ni placa (ver
// `modo-despacho.ts`). La pantalla no lo muestra ahí.
//
// ⚠️ EL VALOR QUE SE GUARDA ES EL ORIGINAL, NO EL NORMALIZADO. La normalización
// existe SOLO para no listar tres veces lo mismo. Guardar la versión
// normalizada estrenaría una tercera forma de escribir el mismo dato — justo lo
// que esto vino a evitar.
// ─────────────────────────────────────────────────────────────────────────────

export interface JuegoDespacho {
  receptor: string;
  cedula: string;
  placa: string;
}

export interface GuiaDespachadaParaJuego {
  estado?: string | null;
  fecha?: string | null;
  numero?: number | null;
  deleted?: boolean | null;
  receptor_nombre?: string | null;
  cedula?: string | null;
  placa?: string | null;
}

export const JUEGOS_VISIBLES = 3;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Mayúsculas, sin tildes, espacios colapsados. `Aníbal arauz` ≡ `Anibal Arauz`. */
export function normalizarNombre(s: string | null | undefined): string {
  return sinTildes(String(s ?? "")).toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Solo letras y números, en mayúsculas: `8-1010-2403` ≡ `810102403`, y
 * `Dg7738` ≡ `DG7738`. Sirve para cédula y para placa — las dos se escriben con
 * y sin guiones, que es de donde salen los duplicados medidos.
 */
export function normalizarCodigo(s: string | null | undefined): string {
  return sinTildes(String(s ?? "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * 🔑 LA IDENTIDAD DE UN JUEGO ES LA CÉDULA + LA PLACA, no el nombre.
 *
 * `Jocsan murillo` y `Jocsan` son la misma persona, y ninguna normalización de
 * mayúsculas/tildes/guiones los junta: son textos distintos. Lo que SÍ los
 * junta es la cédula, que es literalmente el documento de identidad. Con la
 * misma cédula y la misma placa es el mismo juego, y se conserva **el más
 * reciente** — que es la forma que va a quedar escrita de ahora en adelante.
 *
 * Sin cédula (no debería pasar: solo entran juegos completos) cae al nombre,
 * para no fusionar a dos personas distintas por compartir camión.
 */
export function claveJuego(j: JuegoDespacho): string {
  const ced = normalizarCodigo(j.cedula);
  const placa = normalizarCodigo(j.placa);
  return ced ? `C:${ced}|P:${placa}` : `R:${normalizarNombre(j.receptor)}|P:${placa}`;
}

const lleno = (s: string | null | undefined) => String(s ?? "").trim().length > 0;

/**
 * Los últimos juegos COMPLETOS usados con este transportista, del más reciente
 * al más viejo y sin repetir.
 *
 * ⚠️ Solo guías YA DESPACHADAS: un juego a medio llenar de una guía que todavía
 * no salió no es un dato que alguien haya confirmado. Y solo juegos con los
 * TRES campos: el valor de esto es llenar los tres de un toque; ofrecer uno
 * incompleto obliga a completar a mano justo el que falta.
 */
export function juegosRecientes(
  guias: readonly GuiaDespachadaParaJuego[],
  limite: number = JUEGOS_VISIBLES,
): JuegoDespacho[] {
  const completas = guias.filter(
    (g) =>
      !g.deleted &&
      (g.estado === "Completada" || g.estado === "Rechazada") &&
      lleno(g.receptor_nombre) &&
      lleno(g.cedula) &&
      lleno(g.placa),
  );

  // Más reciente primero. La fecha es de la guía; el número desempata dos del
  // mismo día (es correlativo).
  const ordenadas = [...completas].sort((a, b) => {
    const fa = String(a.fecha ?? "").slice(0, 10);
    const fb = String(b.fecha ?? "").slice(0, 10);
    if (fa !== fb) return fa < fb ? 1 : -1;
    return Number(b.numero ?? 0) - Number(a.numero ?? 0);
  });

  const vistos = new Set<string>();
  const salida: JuegoDespacho[] = [];
  for (const g of ordenadas) {
    const juego: JuegoDespacho = {
      receptor: String(g.receptor_nombre ?? "").trim(),
      cedula: String(g.cedula ?? "").trim(),
      placa: String(g.placa ?? "").trim(),
    };
    const k = claveJuego(juego);
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push(juego);
    if (salida.length >= limite) break;
  }
  return salida;
}
