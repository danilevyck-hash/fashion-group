// ─────────────────────────────────────────────────────────────────────────────
// LAS NOVEDADES — ESCRITAS A MANO, UNA POR LÍNEA (9-sep-2026).
//
// 🔴 ESTE ARCHIVO ES EL ÚNICO LUGAR DONDE SE ESCRIBE UNA NOVEDAD. No se generan
// del historial de cambios ni de los commits: un texto para una persona lo
// escribe una persona. El historial dice «MITADES_POR_MARCA = true»; Angela
// necesita leer «una descripción casi igual a otra ahora te avisa».
//
// CÓMO SE AGREGA UNA (tres reglas, y hay candado para las tres):
//   · `modulo` es la KEY del módulo en `src/lib/modules.ts` — `cargar`, no
//     «Plantilla Switch»; `cheques`, no «Recordatorios».
//   · `id` EMPIEZA con esa key. Es lo que se guarda como «ya la vi», así que
//     dos módulos no pueden compartir uno.
//   · `texto` es UNA línea, en el idioma de ellos: sin nombres de tabla, sin
//     rutas, sin «endpoint», sin voseo. Si la persona no lo NOTA al usar la
//     pantalla, no es una novedad.
//
// 🔴 MEJOR CERO QUE UNA DE RELLENO. Un módulo que no cambió no lleva novedad.
// Por eso acá hay CINCO módulos y no veintidós: son los que cambiaron entre el
// 8 y el 9 de septiembre de 2026, cada uno verificado contra el código.
//
// ⚠️ Solo se ven TRES a la vez, las más nuevas (`MAX_A_LA_VEZ`). Escribir cinco
// de un módulo el mismo día entierra dos: por eso ningún módulo lleva más de
// tres acá.
// ─────────────────────────────────────────────────────────────────────────────

import type { Novedad } from "./seleccion";

export const NOVEDADES: readonly Novedad[] = [
  /* ── Plantilla Switch (era «Depurador») — módulo `cargar` ───────────────── */
  {
    id: "cargar-se-llama-plantilla-switch",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "El módulo ahora se llama «Plantilla Switch». Es el mismo de siempre, con el nombre de lo que hace.",
  },
  {
    id: "cargar-quitar-una-descripcion",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "En «Reglas» ya puedes quitar una descripción que escribiste, sin pedírselo a nadie.",
  },
  {
    id: "cargar-avisa-descripcion-casi-igual",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "Si una descripción es casi igual a otra de la misma marca, el sistema te lo avisa antes de que entre.",
  },

  /* ── Cuentas por Cobrar — módulo `cxc` ──────────────────────────────────── */
  {
    id: "cxc-descargar-en-vez-de-exportar",
    modulo: "cxc",
    fecha: "2026-09-08",
    texto: "«Exportar» ahora dice «Descargar» y ofrece dos cosas: total por cliente o detallado por compañía, en PDF o Excel.",
  },
  {
    id: "cxc-saldo-a-favor-no-se-cobra",
    modulo: "cxc",
    fecha: "2026-09-08",
    texto: "Al cliente que tiene saldo a favor ya no se le ofrece cobrar: sigue viéndose, pero no se le pide plata que le debemos.",
  },
  {
    id: "cxc-estado-de-cuenta-como-switch",
    modulo: "cxc",
    fecha: "2026-09-09",
    texto: "El estado de cuenta que le mandas al cliente ahora sale con la misma forma que el de Switch.",
  },

  /* ── Comisiones — módulo `comisiones` ───────────────────────────────────── */
  {
    id: "comisiones-flechita-descarga-el-reporte",
    modulo: "comisiones",
    fecha: "2026-09-08",
    texto: "La flechita gris al lado de cada número descarga ese reporte sin tener que abrir el detalle.",
  },

  /* ── Guías de Despacho — módulo `guias` ─────────────────────────────────── */
  {
    id: "guias-westland-bien-escrito",
    modulo: "guias",
    fecha: "2026-09-08",
    texto: "La lista de destinos ya dice «Westland» bien escrito; las guías viejas quedan como están.",
  },
  {
    id: "guias-calle-19-fuera-de-la-lista",
    modulo: "guias",
    fecha: "2026-09-08",
    texto: "«CALLE 19» salió de la lista de destinos: sola no dice a qué tienda va el envío.",
  },

  /* ── Préstamos — módulo `prestamos` ─────────────────────────────────────── */
  {
    id: "prestamos-de-donde-salio-el-pago",
    modulo: "prestamos",
    fecha: "2026-09-08",
    texto: "Al registrar un pago ahora eliges de dónde salió la plata; ya no viene contestado «Quincena».",
  },
];
