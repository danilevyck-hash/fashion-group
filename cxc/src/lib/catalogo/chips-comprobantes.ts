// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN SOLO ASPECTO PARA LOS DOS FILTROS, Y LOS CONTEOS DE LO QUE SE VE
// (6-sep-2026)
//
// La pantalla tenía DOS filtros con DOS aspectos distintos:
//   · arriba  «Todos (20) · Del link (6) · Míos (14)» con subrayado — que en
//     este sistema es el aspecto de la NAVEGACIÓN por pestañas;
//   · abajo   «Pedidos 18 · Cotizaciones 0 · Borradores 2» en píldoras.
//
// Son dos preguntas del mismo rango —**quién lo armó** y **qué es**—, así que
// van con el MISMO aspecto: dos grupos de píldoras, cada uno con su rótulo
// chico. Nada de subrayados: no se está navegando a ningún lado.
//
// 🔴 LO QUE ESTÁ EN CERO NO APARECE. «Cotizaciones 0» ocupaba un lugar para
// decir que no hay nada. La única excepción es el chip ACTIVO: esconderlo
// dejaría la pantalla sin ningún chip encendido y sin forma de volver.
//
// 🔴 LOS CONTEOS CUENTAN LO QUE SE ESTÁ MIRANDO (4.6). Antes contaban sobre
// TODO el listado, sin importar el filtro de origen ni la ventana de días. Hoy
// casi no se nota; **en octubre sí**: los pedidos de julio caen fuera de los 90
// días y el chip diría 20 donde la lista muestra 5.
//
// 🔑 EL UNIVERSO DE CADA GRUPO ES «TODO MENOS SU PROPIA PREGUNTA». El conteo de
// «Cotizaciones» se calcula sobre las filas que pasan el origen, la búsqueda y
// la ventana — pero NO el filtro por tipo. Contarlo sobre el tipo ya aplicado
// dejaría todos los chips en 0 menos el encendido, que es como decir nada.
//
// Módulo PURO: recibe las filas y el estado, y devuelve qué chips dibujar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FILTROS_ORIGEN,
  ROTULO_GRUPO_ORIGEN,
  pasaFiltroOrigen,
  type FiltroOrigen,
  type OrigenComprobante,
} from "./origen-comprobante";
import {
  FILTROS_COMPROBANTE,
  pasaFiltroComprobante,
  type FiltroComprobante,
  type NumerosDePedido,
} from "./numeros-pedido";
import { CHIP_SIN_MANDAR, esSinMandar } from "./sin-mandar";

/**
 * Lo que la pantalla puede tener puesto en el segundo grupo. Son los tres
 * filtros de siempre MÁS `sin_mandar`.
 *
 * 🔴 `sin_mandar` NO se metió en `FILTROS_COMPROBANTE`. Los tres de allá
 * PARTICIONAN —ninguna fila viva se queda sin chip, y hay candado que exige que
 * la suma dé el total—; «Sin mandar» es un subconjunto de «Pedidos», no un
 * cuarto balde. Meterlo ahí rompería la partición en silencio.
 */
export type VistaComprobante = FiltroComprobante | "sin_mandar";

/** El rótulo chico del segundo grupo. */
export const ROTULO_GRUPO_VISTA = "Qué es";

/** La llave del chip que filtra los que se quedaron trabados. */
export const VISTA_SIN_MANDAR: VistaComprobante = "sin_mandar";

/** Las cuatro opciones del segundo grupo, en el orden en que se leen. */
export const VISTAS_COMPROBANTE: readonly { clave: VistaComprobante; label: string }[] = [
  ...FILTROS_COMPROBANTE,
  { clave: VISTA_SIN_MANDAR, label: CHIP_SIN_MANDAR },
];

/** La fila mínima que estos filtros necesitan mirar. */
export interface FilaParaChips extends NumerosDePedido {
  origen: OrigenComprobante;
  created_at?: string;
}

/** ¿Pasa el segundo grupo? Los tres de siempre delegan; el cuarto es un subconjunto. */
export function pasaVista(p: FilaParaChips, vista: VistaComprobante): boolean {
  if (vista === "sin_mandar") return esSinMandar(p);
  return pasaFiltroComprobante(p, vista);
}

/** Un chip listo para dibujar. */
export interface Chip<K extends string> {
  clave: K;
  label: string;
  conteo: number;
  activo: boolean;
}

/** Un grupo de chips con su rótulo chico. */
export interface GrupoChips<K extends string> {
  rotulo: string;
  opciones: Chip<K>[];
}

/**
 * Esconde lo que está en cero, SALVO el chip activo.
 *
 * 🔴 La excepción no es cosmética: sin ella, filtrar por «Cotizaciones» y que
 * el resultado quedara vacío haría desaparecer el propio chip que está puesto —
 * la pantalla quedaría vacía sin decir por qué ni ofrecer volver.
 */
function visibles<K extends string>(chips: Chip<K>[]): Chip<K>[] {
  return chips.filter((c) => c.conteo > 0 || c.activo);
}

/** El estado de la pantalla que decide qué se cuenta. */
export interface EstadoFiltros {
  origen: FiltroOrigen;
  vista: VistaComprobante;
  /** Ya aplicada por quien llama (búsqueda + ventana): estas filas son las candidatas. */
}

/**
 * Los dos grupos de chips, contados sobre `candidatas` — que quien llama arma
 * con la búsqueda y la ventana YA aplicadas, y con los dos filtros SIN aplicar.
 *
 * Cada grupo se cuenta con el OTRO filtro puesto y el propio quitado.
 */
export function gruposDeChips(
  candidatas: readonly FilaParaChips[],
  estado: EstadoFiltros,
): { origen: GrupoChips<FiltroOrigen>; vista: GrupoChips<VistaComprobante> } {
  // Para contar el origen: la vista SÍ está puesta, el origen no.
  const paraOrigen = candidatas.filter((p) => pasaVista(p, estado.vista));
  // Para contar la vista: el origen SÍ está puesto, la vista no.
  const paraVista = candidatas.filter((p) => pasaFiltroOrigen(p.origen, estado.origen));

  return {
    origen: {
      rotulo: ROTULO_GRUPO_ORIGEN,
      opciones: visibles(
        FILTROS_ORIGEN.map((f) => ({
          clave: f.clave,
          label: f.label,
          conteo: paraOrigen.filter((p) => pasaFiltroOrigen(p.origen, f.clave)).length,
          activo: estado.origen === f.clave,
        })),
      ),
    },
    vista: {
      rotulo: ROTULO_GRUPO_VISTA,
      opciones: visibles(
        VISTAS_COMPROBANTE.map((f) => ({
          clave: f.clave,
          label: f.label,
          conteo: paraVista.filter((p) => pasaVista(p, f.clave)).length,
          activo: estado.vista === f.clave,
        })),
      ),
    },
  };
}

/** ¿Esta fila sobrevive a los DOS filtros? */
export function pasaLosDosFiltros(p: FilaParaChips, estado: EstadoFiltros): boolean {
  return pasaFiltroOrigen(p.origen, estado.origen) && pasaVista(p, estado.vista);
}
