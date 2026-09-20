// ─────────────────────────────────────────────────────────────────────────────
// LOS AVISOS DE UNA FILA DE LA LISTA — CALLADOS Y SIN MOVER NADA (19-sep-2026).
//
// 🩸 Daniel, textual: *«veo desorden más que nada cuando falta N de
// transportista, que la falta no se vea tan ruidosa»*. Los dos avisos se
// dibujaban como CHIPS ámbar con fondo, borde y el texto entero, metidos en
// medio de la fila de escritorio — o sea que la fila que tenía aviso empujaba
// sus columnas ~95 px y quedaba desalineada con las de arriba y las de abajo.
// El desorden no era el color: era que la fila con aviso NO se parecía a las
// demás.
//
// 🔴 LA COLUMNA EXISTE SIEMPRE, CON O SIN AVISO. Es lo único que garantiza que
// las columnas no bailen: la fila sin aviso reserva el mismo hueco que la que
// lo tiene. Y el aviso pasa a ser un PUNTO ámbar con el texto en `title` y en
// `sr-only` — se ve de reojo, no grita, y quien necesita el detalle abre la
// guía (el acordeón sigue diciendo la frase entera, `textoFaltantesDespachada`).
//
// ⚠️ NO CAMBIA QUÉ SE AVISA NI CUÁNDO. Las dos preguntas siguen siendo las
// mismas funciones de siempre (`guiaSinNumeroTransp`, `despachadaIncompleta`);
// acá solo se juntan en UNA lista para que la pantalla y su candado lean lo
// mismo. Módulo PURO: sin React y sin fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { guiaSinNumeroTransp } from "./modo-despacho";
import { despachadaIncompleta } from "./faltantes-despacho";

/** La guía salió, pero el transportista no dio su número. */
export const AVISO_SIN_NUMERO_TRANSP = "Falta N° transportista";
/** La guía salió sin placa, sin quién recibió o sin cédula. */
export const AVISO_SALIO_INCOMPLETA = "Salió incompleta";

type GuiaConAvisos = Parameters<typeof guiaSinNumeroTransp>[0] &
  Parameters<typeof despachadaIncompleta>[0];

/**
 * Los avisos de ESA fila, en el orden en que se dibujan. Lista vacía = la fila
 * no tiene nada que decir (y su hueco queda en blanco, no desaparece).
 */
export function avisosDeLaFila(g: GuiaConAvisos): string[] {
  const avisos: string[] = [];
  if (guiaSinNumeroTransp(g)) avisos.push(AVISO_SIN_NUMERO_TRANSP);
  if (despachadaIncompleta(g)) avisos.push(AVISO_SALIO_INCOMPLETA);
  return avisos;
}
