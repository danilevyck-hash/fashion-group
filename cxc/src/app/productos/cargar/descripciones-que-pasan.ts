// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA DESCRIPCIÓN QUE «PASA» TAMBIÉN ENTRA AL CATÁLOGO (17-sep-2026)
//
// Daniel, textual (8-sep-2026): «q siga pasando pero se agregue al catalogo
// (para poner formulas en algun momento)».
//
// 🩸 Medido: el único camino que ESCRIBÍA en `depurador_descripciones` era
// `POST …/descripciones/aprobar`, y su único llamador es
// `AlarmaDescripcionesNuevas.tsx` — o sea SOLO las que alertan. De las 304
// filas de producción, 77 nacieron así y 227 son la semilla original. Una
// descripción con veredicto `pasa` nunca llegaba a tener fila, y por eso nunca
// se le podía poner una fórmula propia (Fórmulas lista lo que está en el
// catálogo, no lo que pasó por un Excel).
//
// 🔴 «PASAR» NO CAMBIA DE SIGNIFICADO. La descripción sigue pasando: no alerta,
// no bloquea la descarga, no le pide nada a nadie y el Excel sale idéntico. Lo
// ÚNICO que cambia es que queda REGISTRADA, para poder darle fórmula después.
//
// Este módulo es PURO: decide QUÉ se registra. El cuándo y el cómo viven en
// `useRegistrarQuePasan.ts` —el único que conoce la dirección del servidor— y
// en su ruta, que escribe de forma idempotente.
// ─────────────────────────────────────────────────────────────────────────────

import {
  descripcionesDeMarca,
  esDescripcionCatalogada,
  marcaKey,
  type CatalogoDescripciones,
} from "@/lib/depurador/logic";
import { veredictoDescripcion } from "@/lib/depurador/veredicto";

/** Un renglón del archivo, reducido a lo único que importa acá. */
export interface ParMarcaDesc {
  marca: string;
  desc: string;
}

/** Lo que se manda a registrar: la descripción YA normalizada (la que se
 *  guardaría) bajo su marca canónica tal cual venía. */
export interface DescripcionARegistrar {
  marca: string;
  descripcion: string;
}

/** Tope de lo que viaja en una sola petición. Un archivo real trae 0-20
 *  descripciones nuevas; el tope es para que un archivo roto no mande miles.
 *  Lo comparten el cliente (que corta) y el servidor (que rechaza): UN número,
 *  no dos. */
export const MAX_POR_ENVIO = 200;

/** El `origen` de una descripción que entró SOLA, distinto de 'aprobada' (que
 *  alguien miró y decidió) y de 'seed' (el catálogo original). Depende de la
 *  migración `20261206120000`, que ensancha el CHECK. */
export const ORIGEN_AUTOMATICA = "automatica";

/** Clave de deduplicación: marca + descripción normalizada, insensible a caja y
 *  a espacios. Es la MISMA idea que el índice único de la base
 *  (`lower(marca), lower(descripcion)`), para no mandar dos veces lo mismo. */
export function claveRegistro(marca: string, descripcion: string): string {
  return `${marcaKey(marca)}|||${marcaKey(descripcion)}`;
}

/**
 * De los renglones de un archivo, cuáles hay que registrar en el catálogo.
 *
 * Entra SOLO lo que:
 *   1. viene bajo una marca que YA tiene catálogo (una marca desconocida u
 *      «Otros» es basura intencional: se ignora, igual que en la alarma);
 *   2. todavía NO está catalogada bajo esa marca;
 *   3. tiene veredicto exactamente `pasa` — las dos mitades ya existen dentro
 *      de su marca.
 *
 * ⚠️ `alerta` NO entra: esas siguen bloqueando y se aprueban a mano, que es
 * justo lo que Daniel quiso conservar.
 * ⚠️ `ya-existe` TAMPOCO: es la misma descripción con otros espacios o
 * mayúsculas, y la regla 3 de Daniel dice que se usa la que ya existe —
 * registrarla crearía la gemela que esa regla evita.
 *
 * 🔑 Registrar una que pasa NO cambia veredictos futuros hacia el lado flojo:
 * para haber pasado, sus DOS mitades ya existían en su marca, así que no aporta
 * ninguna mitad nueva. Lo único que crece es la lista de descripciones
 * COMPLETAS, contra la que se busca la casi-gemela — o sea que si algo cambia,
 * es que alerte MÁS, nunca menos.
 */
export function descripcionesQuePasan(
  pares: ParMarcaDesc[],
  catalogo: CatalogoDescripciones,
): DescripcionARegistrar[] {
  const vistas = new Set<string>();
  const out: DescripcionARegistrar[] = [];
  for (const { marca, desc } of pares) {
    if (!marca || !desc) continue;
    if (descripcionesDeMarca(catalogo, marca).length === 0) continue;
    const k = claveRegistro(marca, desc);
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (esDescripcionCatalogada(catalogo, marca, desc)) continue;
    // La marca viaja al veredicto: las dos mitades solo valen DENTRO de su
    // marca (8-sep-2026).
    const v = veredictoDescripcion(desc, catalogo, marca);
    if (v.veredicto !== "pasa") continue;
    out.push({ marca, descripcion: v.normalizada });
    if (out.length >= MAX_POR_ENVIO) break;
  }
  return out;
}
